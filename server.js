const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
const DEFAULT_POOL_LIMIT = 201;
const ELIMINATION_SCORE_101 = 101;
const ELIMINATION_SCORE_201 = 201;
const MAX_PLAYERS = 6;
const RECONNECT_GRACE_MS = 15*60*1000;
// V9 grouping rules: 7-10-J-K is NOT a sequence; a wild 9 may complete 10-J-K.
// A same-rank group such as 10-10-9(wild) is a valid 3-card set (TRILL).

function onlinePlayerCount(){
  let count=0;
  for(const room of rooms.values()) for(const p of room.playersList) if(p.connected) count++;
  return count;
}
function broadcastOnlineCount(){ io.emit('onlineCount', {count: onlinePlayerCount()}); }
function addPlayerToRoom(room, socket, name){
  const p={id:socket.id,sessionToken:require('crypto').randomUUID(),name:String(name||'Player').slice(0,18),ready:false,index:room.playersList.length,hand:[],connected:true};
  room.scores[p.id]=0; room.players.set(socket.id,p); room.playersList.push(p); socket.join(room.id); socket.roomId=room.id;
  return p;
}

app.use(express.static(__dirname));
const GAME_HTML_PATHS = [
  path.join(__dirname,'index.html'),
  path.join(__dirname,'RUMMY_JKRN_REAL_PLAYERS_V4.html'),
  path.join(process.cwd(),'index.html'),
  path.join(process.cwd(),'RUMMY_JKRN_REAL_PLAYERS_V4.html')
];
function findGameHtml(){
  const fs = require('fs');
  return GAME_HTML_PATHS.find(p=>{try{return fs.statSync(p).isFile();}catch(e){return false;}}) || null;
}
app.get('/health',(req,res)=>{
  const html=findGameHtml();
  res.json({ok:true,service:'RUMMY-JKRN',htmlFile:html?path.basename(html):null,dir:__dirname,files:GAME_HTML_PATHS.map(p=>({file:path.basename(p),exists:!!html && p===html}))});
});
app.get('/', (req,res)=>{
  const html=findGameHtml();
  if(!html) return res.status(500).send('<h2>RUMMY JKRN server is running, but game HTML is missing.</h2><p>Upload index.html or RUMMY_JKRN_REAL_PLAYERS_V4.html into the same folder as server.js.</p>');
  res.sendFile(html);
});

const suits = [
  {s:'♥',c:'red'}, {s:'♦',c:'red'}, {s:'♣',c:'black'}, {s:'♠',c:'black'}
];
const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function makeDeck(){
  const d=[];
  for(let n=0;n<2;n++) suits.forEach(x=>ranks.forEach(r=>d.push({rank:r,suit:x.s,color:x.c,isPrintedJoker:false,id:''})));
  d.push({rank:'PJ',suit:'🃏',color:'red',isPrintedJoker:true,id:''});
  d.push({rank:'PJ',suit:'🃏',color:'black',isPrintedJoker:true,id:''});
  d.forEach((c,i)=>c.id=`${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,8)}`);
  return d;
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function code(){let s;do{s=Math.floor(100000+Math.random()*900000).toString();}while(rooms.has(s));return s;}
function publicPlayers(room){return room.playersList.map(p=>({id:p.id,name:p.name,ready:p.ready,index:p.index,connected:!!p.connected}));}
function roomCapacity(room){return room.maxPlayers||2;}
function publicCard(c){return c?{rank:c.rank,suit:c.suit,color:c.color,isPrintedJoker:!!c.isPrintedJoker,id:c.id}:null;}

const RANK={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13};
function isWild(room,c){return !!c && (c.isPrintedJoker || (!!room.wildJoker && c.rank===room.wildJoker.rank));}
function pureSeq(g){
  if(!Array.isArray(g)||g.length<3||g.some(c=>c.isPrintedJoker))return false;
  const suit=g[0]?.suit;if(!suit||g.some(c=>c.suit!==suit))return false;
  const vals=g.map(c=>RANK[c.rank]).sort((a,b)=>a-b); if(new Set(vals).size!==vals.length)return false;
  let low=vals.every((v,i)=>i===0||v===vals[i-1]+1); if(low)return true;
  const hi=g.map(c=>c.rank==='A'?14:RANK[c.rank]).sort((a,b)=>a-b);
  return hi.every((v,i)=>i===0||v===hi[i-1]+1);
}
function impureSeq(g,room){
  if(!Array.isArray(g)||g.length<3)return false;
  if(pureSeq(g))return true;
  const nj=g.filter(c=>!isWild(room,c)), jok=g.length-nj.length;
  if(!nj.length)return jok>=3;
  const suit=nj[0].suit;if(nj.some(c=>c.suit!==suit))return false;
  const vals=nj.map(c=>RANK[c.rank]).sort((a,b)=>a-b);if(new Set(vals).size!==vals.length)return false;
  let gaps=0;for(let i=1;i<vals.length;i++)gaps+=vals[i]-vals[i-1]-1;
  if(gaps<=jok)return true;
  const hi=nj.map(c=>c.rank==='A'?14:RANK[c.rank]).sort((a,b)=>a-b);gaps=0;for(let i=1;i<hi.length;i++)gaps+=hi[i]-hi[i-1]-1;
  return gaps<=jok;
}
function validSet(g,room){
  if(!Array.isArray(g)||g.length<3||g.length>4)return false;
  const nj=g.filter(c=>!isWild(room,c));if(!nj.length)return true;
  const r=nj[0].rank;if(nj.some(c=>c.rank!==r))return false;
  const ss=new Set();for(const c of nj){if(ss.has(c.suit))return false;ss.add(c.suit);}return true;
}
function validGroup(g,room){return pureSeq(g)||impureSeq(g,room)||validSet(g,room);}
function eliminationScore(room){return Number(room.poolLimit)===101?ELIMINATION_SCORE_101:ELIMINATION_SCORE_201;}
function cardValue(room,c){if(!c||isWild(room,c))return 0;return ['J','Q','K','A'].includes(c.rank)?10:(parseInt(c.rank,10)||0);}
function bestLifeScore(hand,room){
  const cards=hand.filter(Boolean), n=cards.length;
  const groups=[];
  function rec(start,cur){
    if(cur.length>=3 && cur.length<=n){const g=cur.map(i=>cards[i]);if(validGroup(g,room))groups.push({idx:[...cur],g});}
    if(cur.length>=13)return;
    for(let i=start;i<n;i++)rec(i+1,[...cur,i]);
  }
  rec(0,[]);
  // maximize covered value, while requiring at least one pure sequence for a valid show
  let best={covered:0,hasPure:false,groups:[]};
  function search(pos,used,chosen,hasPure){
    let covered=0;for(const i of used)covered+=cardValue(room,cards[i]);
    if(hasPure && covered>best.covered)best={covered,hasPure,groups:chosen.map(x=>x.g)};
    for(let j=pos;j<groups.length;j++){
      const x=groups[j]; if(x.idx.some(i=>used.has(i)))continue;
      const nu=new Set(used);x.idx.forEach(i=>nu.add(i));search(j+1,nu,[...chosen,x],hasPure||pureSeq(x.g));
    }
  }
  search(0,new Set(),[],false);
  const total=cards.reduce((a,c)=>a+cardValue(room,c),0);
  return {points:Math.min(80,Math.max(0,total-best.covered)),hasFirstLife:best.hasPure,lives:best.groups};
}
function validateShow(room,p,groupIds,discardId){
  const hand=p.hand.slice();
  if(!discardId)return {ok:false,reason:'After lifting the 14th card, select exactly one card to discard. The 14th card can be used in a valid Life/Set.'};
  {const k=hand.findIndex(c=>c.id===discardId);if(k<0)return {ok:false,reason:'Selected discard card is not in your hand.'};hand.splice(k,1);}
  if(hand.length!==13)return {ok:false,reason:'Declare requires 13 cards after selecting the discard card.'};
  if(!Array.isArray(groupIds)||!groupIds.length)return {ok:false,reason:'No groups submitted.'};
  const byId=new Map(p.hand.map(c=>[c.id,c])), used=new Set(), groups=[];
  for(const ids of groupIds){
    if(!Array.isArray(ids)||ids.length<3)return {ok:false,reason:'Every group must contain at least 3 cards.'};
    const g=[];for(const id of ids){if(used.has(id))return {ok:false,reason:'A card is used in more than one group.'};const c=byId.get(id);if(!c||id===discardId)return {ok:false,reason:'Invalid card in group.'};used.add(id);g.push(c);}
    if(!validGroup(g,room)){const hasJ=g.some(c=>jkrnV14IsWild(room,c));return {ok:false,reason:hasJ?'Invalid Joker usage: Printed Joker cannot be in a Pure Sequence. A Wild-Joker rank card is Pure only when it naturally forms the same-suit consecutive sequence; otherwise use the Joker in a valid Impure Sequence or Set.':'One or more groups are invalid.'};}groups.push(g);
  }
  const remaining=hand.filter(c=>!used.has(c.id));
  if(remaining.length)return {ok:false,reason:'All 13 cards must be covered by valid groups.'};
  // Life validation order: Pure Sequence -> second valid Sequence ->
  // remaining valid Sequence/Set/Additional groups. A pure sequence is also
  // a valid sequence, so two pure sequences are legal; at least one must be pure.
  const pure=groups.some(pureSeq);
  const sequenceCount=groups.filter(g=>pureSeq(g)||impureSeq(g,room)).length;
  if(!pure)return {ok:false,reason:'1st Life (Pure Sequence) is missing.'};
  if(sequenceCount<2)return {ok:false,reason:'Minimum 2 valid sequences are required.'};
  return {ok:true,groups};
}

function stateFor(room,socketId){
  const me=room.players.get(socketId); if(!me)return null;
  return {
    roomId:room.id, players:publicPlayers(room), maxPlayers:room.maxPlayers,
    poolLimit:room.poolLimit||DEFAULT_POOL_LIMIT, entryFee:room.entryFee||300,
    myIndex:me.index, hands:room.playersList.map(p=>p.id===socketId ? p.hand.map(publicCard) : {count:p.hand.length}),
    deckCount:room.deck.length,
    handCounts:room.playersList.map(p=>p.hand.length),
    discardTop:publicCard(room.discard[room.discard.length-1]),
    wildJoker:publicCard(room.wildJoker),
    printedJokerCount:room.deck.filter(c=>c.isPrintedJoker).length,
    currentPlayer:room.currentPlayer, currentPlayerName:room.playersList[room.currentPlayer]?.name||null, playerHasDrawn:room.playerHasDrawn, turnEndsAt:room.turnEndsAt,
    roundNumber:room.dealNumber||1, currentRoundScores:room.roundPoints||{}, turnPhase:room.turnPhase||'draw', graceEndsAt:room.graceEndsAt||0, started:room.started, scores:room.scores||{},
    dealerIndex:room.dealerIndex, dealerName:room.playersList[room.dealerIndex]?.name||null,
    dropped:room.dropped||{}, eliminated:room.eliminated||{}, hasDrawnEver:room.hasDrawnEver||{}, toss:room.toss||null,
    roundPoints:room.roundPoints||{}
  };
}
function broadcastState(room){ for(const p of room.playersList){io.to(p.id).emit('gameState',stateFor(room,p.id));} }
function activePlayers(room){ return room.playersList.filter(p=>!room.eliminated?.[p.id]); }
function nextActiveIndex(room,from){
  const n=room.playersList.length;
  for(let step=1;step<=n;step++){const i=(from+step)%n,p=room.playersList[i];if(p&&!room.eliminated?.[p.id]&&!room.dropped?.[p.id])return i;}
  return from;
}
function endTurn(room){
  if(room.turnTimer)clearTimeout(room.turnTimer);
  if(room.graceTimer)clearTimeout(room.graceTimer);
  room.turnTimer=room.graceTimer=null;
  const next=nextActiveIndex(room,room.currentPlayer);
  room.currentPlayer=next; room.playerHasDrawn=false; room.turnPhase='draw'; room.graceEndsAt=0; room.turnEndsAt=Date.now()+30000;
  room.turnTimer=setTimeout(()=>endTurn(room),30000);
  broadcastState(room);
}
function startGraceTimer(room){
  if(!room.started)return;
  room.turnTimer=null; room.turnPhase='grace'; room.graceEndsAt=Date.now()+15*60*1000;
  if(room.graceTimer)clearTimeout(room.graceTimer);
  room.graceTimer=setTimeout(()=>{
    if(!room.started||room.playerHasDrawn)return;
    const p=room.playersList[room.currentPlayer]; if(p) dropPlayer(room,p,true);
  },15*60*1000);
  broadcastState(room);
}
function startTurn(room){
  if(room.turnTimer)clearTimeout(room.turnTimer); if(room.graceTimer)clearTimeout(room.graceTimer);
  room.graceTimer=null; room.playerHasDrawn=false; room.turnPhase='draw'; room.graceEndsAt=0; room.turnEndsAt=Date.now()+30000;
  room.turnTimer=setTimeout(()=>endTurn(room),30000); broadcastState(room);
}
function dropPlayer(room,p,points,automatic=false){
  if(!room.started||!p||room.dropped?.[p.id]||room.eliminated?.[p.id])return false;
  if(!room.dropped)room.dropped={}; if(!room.roundPoints)room.roundPoints={};
  room.dropped[p.id]=true; room.roundPoints[p.id]=points; room.scores[p.id]=(room.scores[p.id]||0)+points;
  if(room.turnTimer)clearTimeout(room.turnTimer); if(room.graceTimer)clearTimeout(room.graceTimer);
  p.hand=[];
  const remaining=activePlayers(room).filter(x=>!room.dropped[x.id]);
  if(remaining.length<=1){ finishRoundByDrop(room); return true; }
  room.currentPlayer=nextActiveIndex(room,p.index); room.playerHasDrawn=false; room.turnPhase='draw'; room.turnEndsAt=Date.now()+30000; room.graceEndsAt=0;
  room.turnTimer=setTimeout(()=>endTurn(room),30000);
  io.to(room.id).emit('playerDropped',{playerId:p.id,index:p.index,name:p.name,points,automatic}); broadcastState(room); return true;
}
function finishRoundByDrop(room){
  if(room.turnTimer)clearTimeout(room.turnTimer);if(room.graceTimer)clearTimeout(room.graceTimer);
  const winner=activePlayers(room).find(p=>!room.dropped[p.id]);
  room.started=false; room.result={valid:true,winnerId:winner?.id||null,winnerName:winner?.name||'Remaining Player',penalties:[],roundPoints:room.roundPoints||{},scores:room.scores,matchWinner:activePlayers(room).find(p=>(room.scores[p.id]||0)>=room.poolLimit)?.name||null};
  io.to(room.id).emit('dealResult',room.result); broadcastState(room);
}
function startToss(room){
  const d=shuffle(makeDeck().filter(c=>!c.isPrintedJoker));
  room.tossCards={}; room.toss={active:true,cards:{}};
  room.playersList.forEach(p=>{const c=d.pop();room.tossCards[p.id]=c;room.toss.cards[p.id]=publicCard(c);});
  const ranked=room.playersList.map(p=>({p,c:room.tossCards[p.id]})).sort((a,b)=>cardValue(room,a.c)-cardValue(room,b.c));
  room.dealerIndex=ranked[0]?.p.index??0; room.highestTossIndex=ranked[ranked.length-1]?.p.index??0;
  room.currentPlayer=room.highestTossIndex;
  io.to(room.id).emit('tossStarted',{cards:room.toss.cards,highestIndex:room.highestTossIndex,lowestIndex:room.dealerIndex,count:room.playersList.length,countdown:3});
  if(room.tossTimer) clearTimeout(room.tossTimer);
  room.tossTimer=setTimeout(()=>{ if(room.toss?.active) dealAfterToss(room,'closed'); },3000);
}
function dealAfterToss(room,choice,firstOverride=null){
  if(firstOverride==null && !room.toss?.active)return;
  if(room.tossTimer){clearTimeout(room.tossTimer);room.tossTimer=null;}
  if(room.toss)room.toss.active=false; room.firstDrawChoice=choice==='open'?'open':'closed'; room.dealNumber=(room.dealNumber||0)+1;
  room.deck=shuffle(makeDeck()); room.discard=[]; room.wildJoker=null; room.dropped={}; room.roundPoints={}; room.eliminated=room.eliminated||{};
  room.playersList.forEach(p=>p.hand=[]);
  const n=room.playersList.length, first=(firstOverride!=null?firstOverride:room.highestTossIndex); room.firstPlayerIndex=first;
  const active=room.playersList.filter(p=>!room.eliminated?.[p.id]);
  // Deal from one authoritative shuffled deck. Keep the deal random, but avoid
  // an accidental all-red/all-black hand for any active player.
  for(let attempt=0;attempt<12;attempt++){
    room.playersList.forEach(p=>p.hand=[]);
    room.deck=shuffle(room.deck);
    for(let r=0;r<13;r++) for(let step=0;step<n;step++){
      const idx=(first+step)%n, p=room.playersList[idx];
      if(p&&!room.eliminated?.[p.id]) p.hand.push(room.deck.pop());
    }
    const balanced=active.every(p=>{const reds=p.hand.filter(c=>c.color==='red').length;return reds>0 && reds<p.hand.length;});
    if(balanced) break;
    // Put dealt cards back and try a fresh shuffle.
    active.forEach(p=>{room.deck.push(...p.hand);p.hand=[];});
    room.deck=shuffle(room.deck);
  }
  // Safety fallback: never leave a player without a hand even if repeated
  // constrained shuffles were unlucky.
  if(active.some(p=>p.hand.length!==13)){
    active.forEach(p=>{room.deck.push(...p.hand);p.hand=[];});
    room.deck=shuffle(room.deck);
    for(let r=0;r<13;r++) for(let step=0;step<n;step++){
      const idx=(first+step)%n, p=room.playersList[idx];
      if(p&&!room.eliminated?.[p.id]) p.hand.push(room.deck.pop());
    }
  }
  const nonPrinted=room.deck.filter(c=>!c.isPrintedJoker); room.wildJoker=nonPrinted[Math.floor(Math.random()*nonPrinted.length)]||null;
  const open=room.deck.pop(); if(open)room.discard.push(open);
  room.started=true; room.currentPlayer=first; room.playerHasDrawn=false; room.turnPhase='firstChoice'; room.hasDrawnEver={};
  room.playersList.forEach(p=>room.hasDrawnEver[p.id]=false);
  room.turnEndsAt=Date.now()+30000;
  io.to(room.id).emit('realGameStarted',{
    roomId:room.id, players:publicPlayers(room), dealerIndex:room.dealerIndex,
    currentPlayer:first, dealNumber:room.dealNumber, firstChoice:true,
    poolLimit:room.poolLimit, entryFee:room.entryFee, handSize:13,
    deckCount:room.deck.length, wildJoker:publicCard(room.wildJoker),
    discardTop:publicCard(room.discard[room.discard.length-1])
  });
  broadcastState(room);
}
function startRealGame(room){ startToss(room); }

io.on('connection',socket=>{
  broadcastOnlineCount();
  socket.on('createRoom',({name,maxPlayers,poolLimit,entryFee})=>{
    const id=code();
    const requested=Number(maxPlayers)||2; const capacity=Math.max(2,Math.min(MAX_PLAYERS,requested));
    const selectedPool=Number(poolLimit)===101?101:201;
    const selectedEntry=Math.max(300,Math.min(10000,Number(entryFee)||300));
    const room={id,maxPlayers:capacity,poolLimit:selectedPool,entryFee:selectedEntry,players:new Map(),playersList:[],started:false,deck:[],discard:[],wildJoker:null,currentPlayer:0,playerHasDrawn:false,turnEndsAt:0,turnTimer:null,scores:{},dealerIndex:null,dealNumber:0,toss:null,tossCards:{},highestTossIndex:0,firstDrawChoice:'closed',turnPhase:'draw',graceEndsAt:0,graceTimer:null,dropped:{},eliminated:{},hasDrawnEver:{},roundPoints:{}};
    rooms.set(id,room);
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomCreated',{roomId:id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    broadcastOnlineCount();
  });
  socket.on('joinRoom',({name,roomId})=>{
    const id=String(roomId||'').toUpperCase(),room=rooms.get(id);
    if(!room)return socket.emit('roomError','Room not found.');
    if(room.started)return socket.emit('roomError','Game already started.');
    if(room.playersList.length>=roomCapacity(room))return socket.emit('roomError',`Room is full (${roomCapacity(room)} players maximum).`);
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    broadcastOnlineCount();
    if(room.playersList.length===roomCapacity(room) && room.playersList.every(x=>x.connected)) startRealGame(room);
  });
  socket.on('quickJoin',({name,maxPlayers,poolLimit,entryFee})=>{
    const requested=Number(maxPlayers)||6; const capacity=Math.max(2,Math.min(MAX_PLAYERS,requested));
    const selectedPool=Number(poolLimit)===101?101:201;
    const selectedEntry=Math.max(300,Math.min(10000,Number(entryFee)||300));
    let room=[...rooms.values()].find(r=>!r.started && r.maxPlayers===capacity && r.poolLimit===selectedPool && r.entryFee===selectedEntry && r.playersList.length<capacity);
    if(!room){
      const id=code(); room={id,maxPlayers:capacity,poolLimit:selectedPool,entryFee:selectedEntry,players:new Map(),playersList:[],started:false,deck:[],discard:[],wildJoker:null,currentPlayer:0,playerHasDrawn:false,turnEndsAt:0,turnTimer:null,scores:{},dealerIndex:null,dealNumber:0,toss:null,tossCards:{},highestTossIndex:0,firstDrawChoice:'closed',turnPhase:'draw',graceEndsAt:0,graceTimer:null,dropped:{},eliminated:{},hasDrawnEver:{},roundPoints:{}}; rooms.set(id,room);
    }
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee,quickJoin:true});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    broadcastOnlineCount();
    if(room.playersList.length===capacity) io.to(room.id).emit('quickMatchReady',{message:`Table full: ${capacity} players. Starting game automatically.`});
    if(room.playersList.length===roomCapacity(room) && room.playersList.every(x=>x.connected)) startRealGame(room);
  });
  socket.on('ready',({roomId,playerId})=>{
    const room=rooms.get(String(roomId||'').toUpperCase());if(!room)return;
    const p=room.players.get(playerId||socket.id);if(!p)return;
    p.ready=true;io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    if(room.playersList.length===roomCapacity(room) && room.playersList.every(x=>x.connected))startRealGame(room);else socket.emit('readyAck');
  });
  socket.on('startRoom',({roomId})=>{
    const room=rooms.get(String(roomId||'').toUpperCase());
    if(!room)return socket.emit('roomError','Room not found.');
    if(room.started)return;
    if(room.playersList.length!==roomCapacity(room))return socket.emit('roomError',`Waiting for players: ${room.playersList.length}/${roomCapacity(room)}`);
    if(!room.playersList.every(x=>x.connected))return socket.emit('roomError','Waiting for all players to reconnect.');
    room.playersList.forEach(x=>x.ready=true);
    startRealGame(room);
  });

  socket.on('tossChoice',({choice})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||p.index!==room.highestTossIndex)return socket.emit('onlineActionError',{message:'Only the highest toss card player can choose OPEN or CLOSED.'});
    if(room.toss?.active){ dealAfterToss(room,'closed'); return; }
    if(!room.started||room.currentPlayer!==p.index||room.turnPhase!=='firstChoice'||room.playerHasDrawn)return socket.emit('onlineActionError',{message:'First draw choice is not available now.'});
    const takeOpen=choice==='open';
    if(takeOpen){ if(!room.discard.length)return socket.emit('onlineActionError',{message:'OPEN card is empty.'}); p.hand.push(room.discard.pop()); }
    else { if(!room.deck.length)return socket.emit('onlineActionError',{message:'Closed deck is empty.'}); p.hand.push(room.deck.pop()); }
    room.firstDrawChoice=takeOpen?'open':'closed'; room.playerHasDrawn=true; room.hasDrawnEver[p.id]=true; room.turnPhase='afterDraw'; room.turnEndsAt=0;
    if(room.turnTimer)clearTimeout(room.turnTimer);room.turnTimer=null; broadcastState(room);
  });
  socket.on('drawDeck',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||room.eliminated?.[p.id]||room.dropped?.[p.id]||p.index!==room.currentPlayer||room.playerHasDrawn)return socket.emit('onlineActionError',{message:'Not your draw turn.'});
    if(!room.deck.length&&room.discard.length>1){const top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top];}
    if(!room.deck.length)return socket.emit('onlineActionError',{message:'Closed deck is empty.'});
    p.hand.push(room.deck.pop()); room.playerHasDrawn=true; room.hasDrawnEver[p.id]=true; room.turnPhase='afterDraw'; room.turnEndsAt=0;
    if(room.turnTimer)clearTimeout(room.turnTimer);if(room.graceTimer)clearTimeout(room.graceTimer);
    room.turnTimer=room.graceTimer=null; socket.emit('onlineActionAck',{action:'draw'}); broadcastState(room);
  });
  socket.on('drawDiscard',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||room.eliminated?.[p.id]||room.dropped?.[p.id]||p.index!==room.currentPlayer||room.playerHasDrawn||room.discard.length===0)return socket.emit('onlineActionError',{message:'OPEN card cannot be drawn now.'});
    p.hand.push(room.discard.pop()); room.playerHasDrawn=true; room.hasDrawnEver[p.id]=true; room.turnPhase='afterDraw'; room.turnEndsAt=0;
    if(room.turnTimer)clearTimeout(room.turnTimer);if(room.graceTimer)clearTimeout(room.graceTimer);
    room.turnTimer=room.graceTimer=null; socket.emit('onlineActionAck',{action:'draw'}); broadcastState(room);
  });
  socket.on('discardCard',({cardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||room.eliminated?.[p.id]||room.dropped?.[p.id]||p.index!==room.currentPlayer||!room.playerHasDrawn)return socket.emit('onlineActionError',{message:'Draw first, then discard one card.'});
    if(p.hand.length!==14)return socket.emit('onlineActionError',{message:'You must have 14 cards before discard.'});
    const idx=p.hand.findIndex(c=>c.id===cardId);if(idx<0)return socket.emit('onlineActionError',{message:'Select one card to discard.'});
    room.discard.push(p.hand.splice(idx,1)[0]); endTurn(room);
  });
  socket.on('drop',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||room.eliminated?.[p.id]||room.dropped?.[p.id]||p.index!==room.currentPlayer)return socket.emit('onlineActionError',{message:'Drop is not available.'});
    if(room.playerHasDrawn)return socket.emit('onlineActionError',{message:'After drawing, DROP/MIDDLE DROP is not allowed this turn.'});
    const points=room.hasDrawnEver?.[p.id]?50:25; dropPlayer(room,p,points,false);
  });
  socket.on('declare',({groupIds,discardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||room.eliminated?.[p.id]||room.dropped?.[p.id]||p.index!==room.currentPlayer||!room.playerHasDrawn)return socket.emit('onlineActionError',{message:'Show is allowed only after drawing.'});
    const check=validateShow(room,p,groupIds,discardId);
    if(!check.ok){
      return socket.emit('onlineActionError',{message:'Invalid Declaration: '+check.reason});
    }
    const penalties=[];
    // Scoring: winner gets 0. Every other active player gets the value of
    // cards left outside their best valid lives, with a hard 80-point cap.
    // Jokers (printed or Wild Joker rank) are always worth 0.
    for(const opp of activePlayers(room)){
      if(opp.id===p.id||room.dropped?.[opp.id])continue;
      const pts=bestLifeScore(opp.hand,room).points;
      const previous=Number(room.scores[opp.id]||0);
      room.roundPoints[opp.id]=pts;
      room.scores[opp.id]=previous+pts;
      penalties.push({playerId:opp.id,name:opp.name,roundScore:pts,previousTotal:previous,totalScore:room.scores[opp.id]});
    }
    room.roundPoints[p.id]=0;
    room.scores[p.id]=Number(room.scores[p.id]||0);
    // Eliminate immediately after the round so the next round can only deal
    // to players who are still below the selected 101/201 threshold.
    const limit=eliminationScore(room);
    const eliminatedThisRound=[];
    for(const pl of room.playersList){
      if(pl.id===p.id)continue;
      if((room.scores[pl.id]||0)>=limit){
        room.eliminated[pl.id]=true;
        eliminatedThisRound.push({playerId:pl.id,name:pl.name,totalScore:room.scores[pl.id],eliminationScore:limit});
      }
    }
    room.started=false; if(room.turnTimer)clearTimeout(room.turnTimer);
    const active=activePlayers(room);
    const matchWinner=active.length===1?active[0].name:null;
    room.result={valid:true,winnerId:p.id,winnerName:p.name,penalties,roundPoints:room.roundPoints,scores:room.scores,eliminated:eliminatedThisRound,eliminationScore:limit,matchWinner};
    io.to(room.id).emit('dealResult',room.result);broadcastState(room);
    if(active.length<=1){io.to(room.id).emit('poolFinished',{scores:room.scores,result:room.result});}
  });
  socket.on('nextDeal',()=>{
    const room=rooms.get(socket.roomId);if(!room||room.started||room.playersList.length<2)return;
    const out=room.playersList.filter(p=>(room.scores[p.id]||0)>=eliminationScore(room));out.forEach(p=>room.eliminated[p.id]=true);
    const active=activePlayers(room); if(active.length<=1)return io.to(room.id).emit('poolFinished',{scores:room.scores,result:room.result});
    room.playersList.forEach(p=>{p.hand=[];p.ready=true;});
    let nextFirst=Number.isInteger(room.firstPlayerIndex)?room.firstPlayerIndex:0;
    for(let step=1;step<=room.playersList.length;step++){const i=(nextFirst+step)%room.playersList.length;if(!room.eliminated?.[room.playersList[i].id]){nextFirst=i;break;}}
    dealAfterToss(room,'closed',nextFirst);
  });

  socket.on('reconnectPlayer',({roomId,sessionToken,name})=>{
    const room=rooms.get(String(roomId||'').toUpperCase()); if(!room)return socket.emit('roomError','Room not found.');
    const p=room.playersList.find(x=>x.sessionToken===sessionToken); if(!p)return socket.emit('roomError','Reconnect session expired.');
    const oldSocketId=p.id;
    if(oldSocketId && oldSocketId!==socket.id){
      const oldSocket=io.sockets.sockets.get(oldSocketId);
      if(oldSocket){ try{oldSocket.disconnect(true);}catch(e){} }
      room.players.delete(oldSocketId);
    }
    p.id=socket.id; p.connected=true; p.lastDisconnect=0; if(name)p.name=String(name).slice(0,18);
    room.players.set(socket.id,p); socket.join(room.id); socket.roomId=room.id;
    socket.emit('reconnected',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee}); broadcastState(room);
  });
  socket.on('chatMessage',({text})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id); if(!room||!p||!String(text||'').trim())return;
    io.to(room.id).emit('chatMessage',{name:p.name,text:String(text).trim().slice(0,200),at:Date.now()});
  });
  socket.on('leaveRoom',()=>{
    const id=socket.roomId,room=id&&rooms.get(id); if(!room)return;
    const p=room.players.get(socket.id); if(!p)return;
    if(room.turnTimer) clearTimeout(room.turnTimer);
    room.players.delete(socket.id); room.playersList=room.playersList.filter(x=>x.id!==socket.id);
    if(room.playersList.length===0){rooms.delete(id); socket.leave(id); socket.roomId=null; broadcastOnlineCount(); return;}
    room.playersList.forEach((x,i)=>x.index=i);
    room.started=false; room.playersList.forEach(x=>x.ready=false);
    if(room.dealerIndex!=null) room.dealerIndex=Math.min(room.dealerIndex,room.playersList.length-1);
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    io.to(id).emit('roomError',p.name+' left the room. Please READY again.');
    socket.leave(id); socket.roomId=null; socket.emit('leftRoom'); broadcastOnlineCount();
  });
  socket.on('requestRematch',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id); if(!room||!p)return;
    if(room.started||room.playersList.length<2)return;
    room.playersList.forEach(x=>{x.ready=true;x.hand=[];});
    if(room.dealerIndex!=null) room.dealerIndex=(room.dealerIndex+1)%room.playersList.length;
    startRealGame(room);
  });
  socket.on('disconnect',()=>{
    const id=socket.roomId,room=id&&rooms.get(id);if(!room)return;
    const p=room.players.get(socket.id); if(!p)return;
    p.connected=false; p.lastDisconnect=Date.now();
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
    broadcastOnlineCount();
    if(room.started){io.to(id).emit('roomError',p.name+' disconnected. Waiting for reconnect...');}
    setTimeout(()=>{
      const still=room.playersList.find(x=>x.sessionToken===p.sessionToken);
      if(!still || still.connected)return;
      if(room.started){
        dropPlayer(room,still,true);
        io.to(id).emit('roomError',still.name+' did not reconnect within 15 minutes and was dropped (+20).');
        return;
      }
      room.players.delete(still.id); room.playersList=room.playersList.filter(x=>x.sessionToken!==still.sessionToken);
      if(room.playersList.length===0){rooms.delete(id);return;}
      room.playersList.forEach((x,i)=>x.index=i);
      if(room.dealerIndex!=null)room.dealerIndex=Math.min(room.dealerIndex,room.playersList.length-1);
      io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,entryFee:room.entryFee});
      io.to(id).emit('roomError',still.name+' left the room.');
    },RECONNECT_GRACE_MS);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`RUMMY JKRN real-player server: http://localhost:${PORT}`));


/* =========================================================
   JKRN STRICT PURE-LIFE / WILD-JOKER FIX
   A card whose rank matches the selected Wild Joker is a
   joker for validation and therefore can NEVER be part of
   a Pure Life. Printed Jokers are also never Pure.
   ========================================================= */
function jkrnIsWildForPureFix(room, card) {
    if (!card) return false;
    if (card.isPrintedJoker) return true;
    return !!(room && room.wildJoker && card.rank === room.wildJoker.rank);
}

function pureSeq(group, room) {
    if (!Array.isArray(group) || group.length < 3) return false;
    if (group.some(c => jkrnIsWildForPureFix(room, c))) return false;

    const suit = group[0] && group[0].suit;
    if (!suit || group.some(c => !c || c.suit !== suit)) return false;

    const low = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
    const high = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};
    const ranks = group.map(c => c.rank);
    if (new Set(ranks).size !== ranks.length) return false;

    const lv = ranks.map(r => low[r]).sort((a,b)=>a-b);
    let ok = lv.every((v,i)=>i===0 || v===lv[i-1]+1);
    if (ok) return true;

    const hv = ranks.map(r => high[r]).sort((a,b)=>a-b);
    return hv.every((v,i)=>i===0 || v===hv[i-1]+1);
}



/* JKRN V12 PURE LIFE RULE:
   A Wild-Joker rank card MAY be used in Pure Life when it is a real card
   of the same suit and the cards are consecutive. Printed Joker is not Pure. */
function pureSeq(group, room) {
    if (!Array.isArray(group) || group.length < 3) return false;
    if (group.some(c => c && c.isPrintedJoker)) return false;

    const suit = group[0] && group[0].suit;
    if (!suit || group.some(c => !c || c.suit !== suit)) return false;

    const low = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
    const high = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};
    const ranks = group.map(c => c.rank);
    if (ranks.some(r => low[r] == null)) return false;
    if (new Set(ranks).size !== ranks.length) return false;

    const lv = ranks.map(r => low[r]).sort((a,b)=>a-b);
    if (lv.every((v,i)=>i===0 || v===lv[i-1]+1)) return true;

    const hv = ranks.map(r => high[r]).sort((a,b)=>a-b);
    return hv.every((v,i)=>i===0 || v===hv[i-1]+1);
}



/* JKRN V14 - OFFICIAL JOKER RULES
   Printed Joker + Wild Joker are wild cards.
   Neither type may be used in a Pure Sequence.
   Jokers may be used in Impure Sequences and Sets, including multiple Jokers
   and Printed Joker + Wild Joker together. */
function jkrnV14IsWild(room, card) {
  if (!card) return false;
  if (card.isPrintedJoker) return true;
  return !!(room && room.wildJoker && card.rank === room.wildJoker.rank);
}
function pureSeq(group, room) {
  if (!Array.isArray(group) || group.length < 3) return false;
  if (group.some(c => jkrnV14IsWild(room, c))) return false;
  const suit = group[0] && group[0].suit;
  if (!suit || group.some(c => !c || c.suit !== suit)) return false;
  const low = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
  const high = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};
  const ranks = group.map(c => c.rank);
  if (ranks.some(r => low[r] == null) || new Set(ranks).size !== ranks.length) return false;
  const lv = ranks.map(r => low[r]).sort((a,b)=>a-b);
  if (lv.every((v,i)=>i===0 || v===lv[i-1]+1)) return true;
  const hv = ranks.map(r => high[r]).sort((a,b)=>a-b);
  return hv.every((v,i)=>i===0 || v===hv[i-1]+1);
}



/* JKRN V15 FINAL JOKER RULE:
   - Printed Joker is a wild card and cannot be part of Pure Sequence.
   - A Wild-Joker rank card is a real suited card. If it naturally forms a
     same-suit consecutive sequence, it MAY be Pure. Otherwise it can act
     as a Wild Joker in Impure Sequence/Set.
   - Multiple Jokers and Printed + Wild combinations remain valid in
     Impure Sequence/Set when the resulting group is valid. */
function pureSeq(group, room) {
  if (!Array.isArray(group) || group.length < 3) return false;
  if (group.some(c => c && c.isPrintedJoker)) return false;
  const suit = group[0] && group[0].suit;
  if (!suit || group.some(c => !c || c.suit !== suit)) return false;

  const low = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
  const high = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};
  const ranks = group.map(c => c.rank);
  if (ranks.some(r => low[r] == null) || new Set(ranks).size !== ranks.length) return false;

  const lv = ranks.map(r => low[r]).sort((a,b)=>a-b);
  if (lv.every((v,i)=>i===0 || v===lv[i-1]+1)) return true;

  const hv = ranks.map(r => high[r]).sort((a,b)=>a-b);
  return hv.every((v,i)=>i===0 || v===hv[i-1]+1);
}



/* JKRN V18 - DROP RULES
   First Drop = 25 points, Middle Drop = 50 points.
   First Drop means the player has not drawn during this deal.
   A dropped player cannot act again in the same deal.
   If only one active player remains, the deal finishes immediately. */
function jkrnV18Drop(room, p, automatic=false){
  if(!room || !p || room.started===false) return false;
  if(!room.dropped) room.dropped={};
  if(!room.roundPoints) room.roundPoints={};
  if(!room.scores) room.scores={};
  if(room.dropped[p.id] || room.eliminated?.[p.id]) return false;

  // Authoritative per-deal state: hasDrawnEver is reset when a new deal starts.
  // No draw yet => First Drop (20); already drew earlier in this deal => Middle Drop (40).
  const firstDrop = !room.hasDrawnEver?.[p.id];
  const points = firstDrop ? 25 : 50;

  room.dropped[p.id]=true;
  room.roundPoints[p.id]=points;
  room.scores[p.id]=(room.scores[p.id]||0)+points;
  p.hand=[];

  if(room.turnTimer) clearTimeout(room.turnTimer);
  if(room.graceTimer) clearTimeout(room.graceTimer);
  room.turnTimer=null; room.graceTimer=null;

  const remaining=activePlayers(room).filter(x=>!room.dropped?.[x.id] && !room.eliminated?.[x.id]);
  io.to(room.id).emit('playerDropped',{
    playerId:p.id,index:p.index,name:p.name,points,
    dropType:firstDrop?'First Drop':'Middle Drop',automatic
  });

  if(remaining.length<=1){
    finishRoundByDrop(room);
    return true;
  }

  // Move directly to the next valid player and give that player a fresh 30s turn.
  room.currentPlayer=nextActiveIndex(room,p.index);
  room.playerHasDrawn=false;
  room.turnPhase='draw';
  room.turnEndsAt=Date.now()+30000;
  room.graceEndsAt=0;
  room.turnTimer=setTimeout(()=>endTurn(room),30000);
  broadcastState(room);
  return true;
}
function dropPlayer(room,p,automatic=false){ return jkrnV18Drop(room,p,automatic); }
