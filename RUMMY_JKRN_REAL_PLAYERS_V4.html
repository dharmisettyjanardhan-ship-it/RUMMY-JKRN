const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
const DEFAULT_POOL_LIMIT = 201;
const ALLOWED_POOL_LIMITS = [101, 201];
const MAX_PLAYERS = 6;
const RECONNECT_GRACE_MS = 120000;
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
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'RUMMY_JKRN_REAL_PLAYERS_V4.html')));

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
function validGroup(g,room){return pureSeq(g)||impureSeq(g,room)||aceSetWithJokerAllowed(g,room);}
// ACE RULES (201 Pool):
// 1) A can be low (A-2-3) or high (Q-K-A) in a same-suit sequence.
// 2) A-A-A is a valid 3-card set when the natural A cards have different suits.
// 3) A-A-Joker is a valid 3-card set.
// 4) A-A-A-Joker is a valid 4-card set.
// 5) A cards used in a set must not repeat the same suit.
function aceSetWithJokerAllowed(g, room){
  return validSet(g, room);
}

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
  if(discardId){const k=hand.findIndex(c=>c.id===discardId);if(k<0)return {ok:false,reason:'Selected discard card is not in your hand.'};hand.splice(k,1);}
  if(hand.length!==13)return {ok:false,reason:'Declare requires 13 cards after selecting the discard card.'};
  if(!Array.isArray(groupIds)||!groupIds.length)return {ok:false,reason:'No groups submitted.'};
  const byId=new Map(p.hand.map(c=>[c.id,c])), used=new Set(), groups=[];
  for(const ids of groupIds){
    if(!Array.isArray(ids)||ids.length<3)return {ok:false,reason:'Every group must contain at least 3 cards.'};
    const g=[];for(const id of ids){if(used.has(id))return {ok:false,reason:'A card is used in more than one group.'};const c=byId.get(id);if(!c||id===discardId)return {ok:false,reason:'Invalid card in group.'};used.add(id);g.push(c);}
    if(!validGroup(g,room))return {ok:false,reason:'Invalid group: '+g.map(c=>c.rank+(c.suit||'')).join(' ')+'. Use valid sequence/set rules.'};groups.push(g);
  }
  const remaining=hand.filter(c=>!used.has(c.id));
  if(remaining.length)return {ok:false,reason:'All 13 cards must be covered by valid groups.'};
  const pure=groups.some(pureSeq), seq=groups.filter(g=>impureSeq(g,room)).length;
  if(!pure)return {ok:false,reason:'1st Life (Pure Sequence) is missing.'};
  if(seq<2)return {ok:false,reason:'2nd Life (Sequence) is missing.'};
  return {ok:true,groups};
}

function stateFor(room,socketId){
  const me=room.players.get(socketId); if(!me)return null;
  return {
    roomId:room.id,
    players:publicPlayers(room),
    maxPlayers:room.maxPlayers,
    myIndex:me.index,
    hands:room.playersList.map(p=>p.id===socketId ? p.hand.map(publicCard) : {count:p.hand.length}),
    deckCount:room.deck.length,
    discardTop:publicCard(room.discard[room.discard.length-1]),
    wildJoker:publicCard(room.wildJoker),
    wildRank: room.wildJoker ? room.wildJoker.rank : null,
    currentPlayer:room.currentPlayer,
    playerHasDrawn:room.playerHasDrawn,
    turnEndsAt:room.turnEndsAt,
    started:room.started,
    scores: room.scores || {},
    dealerIndex: room.dealerIndex,
    dealerName: room.playersList[room.dealerIndex]?.name || null
  };
}
function broadcastState(room){
  for(const p of room.playersList){io.to(p.id).emit('gameState',stateFor(room,p.id));}
}
function startTurn(room){
  if(room.turnTimer)clearTimeout(room.turnTimer);
  room.playerHasDrawn=false;
  room.turnEndsAt=Date.now()+30000;
  room.turnTimer=setTimeout(()=>{
    if(!room.started)return;
    const timed=room.playersList[room.currentPlayer];
    if(!timed)return;
    // Timeout is server-authoritative. A client cannot make another player act.
    // If the player did not finish the turn in 30 seconds, apply a missed-turn
    // drop and move to the next eligible seat.
    const penalty=room.playerHasDrawn?50:25;
    room.scores[timed.id]=(room.scores[timed.id]||0)+penalty;
    timed.droppedThisDeal=true;
    timed.lastTurnPenalty=penalty;
    room.playerHasDrawn=false;
    const limit=room.poolLimit||DEFAULT_POOL_LIMIT;
    const active=room.playersList.filter(x=>!x.droppedThisDeal && (room.scores[x.id]||0)<limit);
    if(active.length<=1){
      room.started=false;
      if(room.turnTimer)clearTimeout(room.turnTimer);
      room.result={winnerId:active[0]?.id||null,winnerName:active[0]?.name||null,valid:true,timeout:true,penalties:room.playersList.filter(x=>x.id!==(active[0]?.id)).map(x=>({playerId:x.id,name:x.name,points:room.scores[x.id]||0}))};
      broadcastState(room);
      io.to(room.id).emit('dealResult',room.result);
      return;
    }
    room.currentPlayer=active[0].index;
    startTurn(room);
  },30000);
  broadcastState(room);
}
function startRealGame(room){
  room.started=true; room.result=null;
  room.dealNumber=(room.dealNumber||0)+1;

  // Only players who are still below the pool limit and have not been
  // eliminated are dealt into the next game.
  const activePlayers=room.playersList.filter(p=>
    !p.eliminated && (room.scores[p.id]||0)<(room.poolLimit||DEFAULT_POOL_LIMIT)
  );
  if(activePlayers.length<=1){
    room.started=false;
    const winner=activePlayers[0]||null;
    room.result={matchFinished:true,winnerId:winner?.id||null,winnerName:winner?.name||null,scores:room.scores||{}};
    broadcastState(room);
    io.to(room.id).emit('poolFinished',room.result);
    return;
  }

  if(room.dealerIndex==null || !activePlayers.some(p=>p.index===room.dealerIndex)){
    room.dealerIndex=activePlayers[Math.floor(Math.random()*activePlayers.length)].index;
  } else {
    const pos=activePlayers.findIndex(p=>p.index===room.dealerIndex);
    room.dealerIndex=activePlayers[(pos+1)%activePlayers.length].index;
  }

  room.deck=shuffle(makeDeck());
  room.playersList.forEach(p=>{p.hand=[];p.droppedThisDeal=false;p.lastTurnPenalty=0;});
  for(let r=0;r<13;r++){
    for(let step=1;step<=activePlayers.length;step++){
      const pos=(activePlayers.findIndex(p=>p.index===room.dealerIndex)+step)%activePlayers.length;
      activePlayers[pos].hand.push(room.deck.pop());
    }
  }

  room.discard=[room.deck.pop()];
  const nonPrinted=room.deck.filter(c=>!c.isPrintedJoker);
  room.wildJoker=nonPrinted[Math.floor(Math.random()*nonPrinted.length)] || null;

  const dealerPos=activePlayers.findIndex(p=>p.index===room.dealerIndex);
  room.currentPlayer=activePlayers[(dealerPos+1)%activePlayers.length].index;
  room.playerHasDrawn=false;
  startTurn(room);
  io.to(room.id).emit('realGameStarted',{
    roomId:room.id,players:publicPlayers(room),dealerIndex:room.dealerIndex,
    currentPlayer:room.currentPlayer,dealNumber:room.dealNumber,
    poolLimit:room.poolLimit||DEFAULT_POOL_LIMIT
  });
}


io.on('connection',socket=>{
  socket.on('error',err=>console.error('Socket error:',err));
  broadcastOnlineCount();
  socket.on('createRoom',({name,maxPlayers,poolLimit})=>{
    const id=code();
    const requested=Number(maxPlayers)||2; const capacity=[2,4,6].includes(requested)?requested:2;
    const selectedPool=ALLOWED_POOL_LIMITS.includes(Number(poolLimit)) ? Number(poolLimit) : DEFAULT_POOL_LIMIT;
    const room={id,maxPlayers:capacity,poolLimit:selectedPool,players:new Map(),playersList:[],started:false,deck:[],discard:[],wildJoker:null,currentPlayer:0,playerHasDrawn:false,turnEndsAt:0,turnTimer:null,scores:{},dealerIndex:null,dealNumber:0};
    rooms.set(id,room);
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomCreated',{roomId:id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
  });
  socket.on('joinRoom',({name,roomId})=>{
    const id=String(roomId||'').toUpperCase(),room=rooms.get(id);
    if(!room)return socket.emit('roomError','Room not found.');
    if(room.started)return socket.emit('roomError','Game already started.');
    if(room.playersList.length>=roomCapacity(room))return socket.emit('roomError',`Room is full (${roomCapacity(room)} players maximum).`);
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
  });
  socket.on('quickJoin',({name,maxPlayers,poolLimit})=>{
    const requested=Number(maxPlayers)||6; const capacity=[2,4,6].includes(requested)?requested:6;
    const selectedPool=ALLOWED_POOL_LIMITS.includes(Number(poolLimit)) ? Number(poolLimit) : DEFAULT_POOL_LIMIT;
    let room=[...rooms.values()].find(r=>!r.started && r.maxPlayers===capacity && r.playersList.length<capacity);
    if(!room){
      const id=code(); room={id,maxPlayers:capacity,poolLimit:selectedPool,players:new Map(),playersList:[],started:false,deck:[],discard:[],wildJoker:null,currentPlayer:0,playerHasDrawn:false,turnEndsAt:0,turnTimer:null,scores:{},dealerIndex:null,dealNumber:0}; rooms.set(id,room);
    }
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,quickJoin:true});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
    if(room.playersList.length===capacity) io.to(room.id).emit('quickMatchReady',{message:`Table full: ${capacity} players. Everyone press READY.`});
  });
  socket.on('ready',({roomId,playerId})=>{
    const room=rooms.get(String(roomId||'').toUpperCase());if(!room)return;
    const p=room.players.get(playerId||socket.id);if(!p)return;
    p.ready=true;io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    if(room.playersList.length===roomCapacity(room) && room.playersList.every(x=>x.ready && x.connected))startRealGame(room);else socket.emit('readyAck');
  });
  socket.on('drawDeck',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||p.index!==room.currentPlayer||room.playerHasDrawn){socket.emit('onlineActionError',{message:'Not your turn, or you already drew.'});return;}
    if(room.deck.length===0&&room.discard.length>1){const top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top];}
    if(!room.deck.length){socket.emit('onlineActionError',{message:'Closed deck is empty.'});return;}
    const card=room.deck.pop();p.hand.push(card);room.playerHasDrawn=true;socket.emit('onlineActionAck',{action:'draw',card:publicCard(card)});broadcastState(room);
  });
  socket.on('drawDiscard',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||p.index!==room.currentPlayer||room.playerHasDrawn||room.discard.length===0){socket.emit('onlineActionError',{message:'Cannot draw from OPEN DECK now.'});return;}
    const card=room.discard.pop();p.hand.push(card);room.playerHasDrawn=true;socket.emit('onlineActionAck',{action:'draw',card:publicCard(card)});broadcastState(room);
  });
  socket.on('discardCard',({cardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||p.index!==room.currentPlayer||!room.playerHasDrawn){socket.emit('onlineActionError',{message:'Draw first; it must be your turn.'});return;}
    if(p.hand.length!==14){socket.emit('onlineActionError',{message:'You must have 14 cards before discarding.'});return;}
    const idx=p.hand.findIndex(c=>c.id===cardId);if(idx<0){socket.emit('onlineActionError',{message:'Select one card to discard.'});return;}
    room.discard.push(p.hand.splice(idx,1)[0]);
     let nextIndex=(room.currentPlayer+1)%room.playersList.length;
     for(let step=0;step<room.playersList.length;step++){ const cand=room.playersList[(nextIndex+step)%room.playersList.length]; if(!cand.droppedThisDeal && (room.scores[cand.id]||0)<(room.poolLimit||DEFAULT_POOL_LIMIT)){ nextIndex=cand.index; break; } }
     room.currentPlayer=nextIndex; startTurn(room);
  });

  socket.on('drop',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||p.index!==room.currentPlayer){socket.emit('onlineActionError',{message:'Drop is allowed only on your turn.'});return;}
    const penalty=room.playerHasDrawn?50:25;
    room.scores[p.id]=(room.scores[p.id]||0)+penalty; p.droppedThisDeal=true; p.lastTurnPenalty=penalty; room.playerHasDrawn=false;
    const active=room.playersList.filter(x=>!x.droppedThisDeal && (room.scores[x.id]||0)<(room.poolLimit||DEFAULT_POOL_LIMIT));
    if(active.length<=1){ room.started=false; if(room.turnTimer)clearTimeout(room.turnTimer); room.result={winnerId:active[0]?.id||null,winnerName:active[0]?.name||null,valid:true,drop:true,penalties:room.playersList.filter(x=>x.id!==active[0]?.id).map(x=>({playerId:x.id,name:x.name,points:room.scores[x.id]||0}))}; broadcastState(room); io.to(room.id).emit('dealResult',room.result); return; }
    room.currentPlayer=active[0].index; startTurn(room);
  });

  socket.on('declare',({groupIds,discardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||p.index!==room.currentPlayer||!room.playerHasDrawn){socket.emit('onlineActionError',{message:'Declare is allowed only on your turn after drawing.'});return;}
    const check=validateShow(room,p,groupIds,discardId);
    if(check.ok){
      if(room.turnTimer)clearTimeout(room.turnTimer);
      const winner=p;
      const penalties=[];
      const resultPlayers=[];

      // Winner is always 0 points for this deal.
      resultPlayers.push({
        playerId:winner.id,
        name:winner.name,
        points:0,
        totalScore:room.scores[winner.id]||0,
        result:'WINNER',
        cards:winner.hand.map(publicCard),
        lives:check.groups.map(g=>({type:
          pureSeq(g)?'1st Life (Pure Sequence)':
          (impureSeq(g,room)?'2nd Life (With Joker)':'Set/Trill'),
          cards:g.map(publicCard)})),
        remaining:[]
      });

      // Score EVERY other player. Valid lives are removed from scoring;
      // only cards outside the selected valid lives contribute, capped at 80.
      for(const opp of room.playersList){
        if(opp.id===winner.id)continue;
        const info=bestLifeScore(opp.hand,room);
        const pts=info.points;
        room.scores[opp.id]=(room.scores[opp.id]||0)+pts;
        if(room.scores[opp.id] >= (room.poolLimit||DEFAULT_POOL_LIMIT)) opp.eliminated=true;

        const used=new Set((info.lives||[]).flat().map(c=>c.id));
        const remaining=opp.hand.filter(c=>!used.has(c.id));
        const lives=(info.lives||[]).map(g=>({
          type:pureSeq(g)?'1st Life (Pure Sequence)':
               (impureSeq(g,room)?'2nd Life (With Joker)':
               (validSet(g,room)?'Set/Trill':'Group')),
          cards:g.map(publicCard)
        }));

        penalties.push({
          playerId:opp.id,name:opp.name,points:pts,totalScore:room.scores[opp.id]||0
        });
        resultPlayers.push({
          playerId:opp.id,name:opp.name,points:pts,
          totalScore:room.scores[opp.id]||0,
          result:opp.eliminated?'ELIMINATED':'LOST',
          cards:opp.hand.map(publicCard),
          lives,
          remaining:remaining.map(publicCard)
        });
      }

      room.result={
        winnerId:winner.id,winnerName:winner.name,valid:true,penalties,
        players:resultPlayers,dealNumber:room.dealNumber,
        poolLimit:room.poolLimit||DEFAULT_POOL_LIMIT
      };
      room.started=false;

      const gameWinner=room.playersList.filter(x=>!x.eliminated &&
        (room.scores[x.id]||0)<(room.poolLimit||DEFAULT_POOL_LIMIT));
      room.result.matchWinner=gameWinner.length===1?gameWinner[0].name:null;
      room.result.matchFinished=gameWinner.length<=1;

      broadcastState(room);
      io.to(room.id).emit('dealResult',room.result);
    }else{
      // WRONG SHOW: the declaring player gets +80, and EVERY other
      // active player is scored from the valid lives they have.
      if(room.turnTimer)clearTimeout(room.turnTimer);
      room.scores[p.id]=(room.scores[p.id]||0)+80;
      if(room.scores[p.id] >= (room.poolLimit||DEFAULT_POOL_LIMIT)) p.eliminated=true;

      const resultPlayers=[{
        playerId:p.id,name:p.name,points:80,totalScore:room.scores[p.id]||0,
        result:p.eliminated?'ELIMINATED':'WRONG SHOW',
        cards:p.hand.map(publicCard),lives:[],remaining:p.hand.map(publicCard)
      }];
      const penalties=[{playerId:p.id,name:p.name,points:80,totalScore:room.scores[p.id]||0}];

      for(const opp of room.playersList){
        if(opp.id===p.id || opp.eliminated) continue;
        const info=bestLifeScore(opp.hand,room);
        const pts=info.points;
        room.scores[opp.id]=(room.scores[opp.id]||0)+pts;
        if(room.scores[opp.id] >= (room.poolLimit||DEFAULT_POOL_LIMIT)) opp.eliminated=true;
        const used=new Set((info.lives||[]).flat().map(c=>c.id));
        const remaining=opp.hand.filter(c=>!used.has(c.id));
        const lives=(info.lives||[]).map(g=>({
          type:pureSeq(g)?'1st Life (Pure Sequence)':
               (impureSeq(g,room)?'2nd Life (With Joker)':
               (validSet(g,room)?'Set/Trill':'Group')),
          cards:g.map(publicCard)
        }));
        penalties.push({playerId:opp.id,name:opp.name,points:pts,totalScore:room.scores[opp.id]||0});
        resultPlayers.push({
          playerId:opp.id,name:opp.name,points:pts,totalScore:room.scores[opp.id]||0,
          result:opp.eliminated?'ELIMINATED':'LOST',cards:opp.hand.map(publicCard),lives,remaining:remaining.map(publicCard)
        });
      }

      room.result={winnerId:null,winnerName:null,valid:false,wrongShow:true,
        loserId:p.id,loserName:p.name,penalties,players:resultPlayers,
        dealNumber:room.dealNumber,poolLimit:room.poolLimit||DEFAULT_POOL_LIMIT,reason:check.reason};
      room.started=false;
      const active=room.playersList.filter(x=>!x.eliminated && (room.scores[x.id]||0)<(room.poolLimit||DEFAULT_POOL_LIMIT));
      room.result.matchFinished=active.length<=1;
      room.result.matchWinner=active.length===1?active[0].name:null;
      broadcastState(room);io.to(room.id).emit('dealResult',room.result);
    }
  });
  socket.on('nextDeal',()=>{
    const room=rooms.get(socket.roomId);
    if(!room||room.started||room.playersList.length<2)return;

    const limit=room.poolLimit||DEFAULT_POOL_LIMIT;
    for(const p of room.playersList){
      if((room.scores[p.id]||0)>=limit) p.eliminated=true;
    }

    const active=room.playersList.filter(p=>!p.eliminated && (room.scores[p.id]||0)<limit);
    if(active.length<=1){
      const winner=active[0]||null;
      room.result={
        matchFinished:true,
        winnerId:winner?.id||null,
        winnerName:winner?.name||null,
        scores:room.scores||{},
        players:room.playersList.map(p=>({
          playerId:p.id,name:p.name,totalScore:room.scores[p.id]||0,
          result:p.eliminated?'ELIMINATED':(winner&&p.id===winner.id?'WINNER':'ACTIVE')
        }))
      };
      io.to(room.id).emit('poolFinished',room.result);
      return;
    }

    active.forEach(p=>{p.ready=true;p.hand=[];p.droppedThisDeal=false;});
    room.playersList.filter(p=>!active.includes(p)).forEach(p=>{p.hand=[];p.ready=true;});
    startRealGame(room);
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
    socket.emit('reconnected',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit}); broadcastState(room);
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
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
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
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
    if(room.started){io.to(id).emit('roomError',p.name+' disconnected. Waiting for reconnect...');}
    setTimeout(()=>{
      const still=room.playersList.find(x=>x.sessionToken===p.sessionToken);
      if(!still || still.connected)return;
      if(room.started && room.turnTimer)clearTimeout(room.turnTimer);
      room.players.delete(still.id); room.playersList=room.playersList.filter(x=>x.sessionToken!==still.sessionToken);
      if(room.playersList.length===0){rooms.delete(id);return;}
      room.playersList.forEach((x,i)=>x.index=i);
      room.started=false; room.playersList.forEach(x=>x.ready=false);
      if(room.dealerIndex!=null)room.dealerIndex=Math.min(room.dealerIndex,room.playersList.length-1);
      io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
      io.to(id).emit('roomError',p.name+' left the room. Please READY again.');
    },RECONNECT_GRACE_MS);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`RUMMY JKRN real-player server: http://localhost:${PORT}`));
