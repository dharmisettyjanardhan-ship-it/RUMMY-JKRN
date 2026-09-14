const path = require('path');
const http = require('http');
const express = require('express');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
const MAX_PLAYERS = 6;
const RECONNECT_GRACE_MS = 120000;
const TURN_MS = 30000;
const DEFAULT_POOL_LIMIT = 201;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'RUMMY_JKRN_REAL_PLAYERS_V4.html')));

const suits = [
  { s: '♥', c: 'red' }, { s: '♦', c: 'red' },
  { s: '♣', c: 'black' }, { s: '♠', c: 'black' }
];
const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK = {A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13};

function normalizePoolLimit(v) {
  return Number(v) === 101 ? 101 : 201;
}
function roomCapacity(room) { return room.maxPlayers || 2; }
function onlinePlayerCount() {
  let n = 0;
  for (const room of rooms.values()) for (const p of room.playersList) if (p.connected) n++;
  return n;
}
function broadcastOnlineCount() { io.emit('onlineCount', { count: onlinePlayerCount() }); }
function code() {
  let s;
  do s = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(s));
  return s;
}
function publicCard(c) {
  return c ? { rank:c.rank, suit:c.suit, color:c.color, isPrintedJoker:!!c.isPrintedJoker, id:c.id } : null;
}
function publicPlayers(room) {
  return room.playersList.map(p => ({
    id:p.id, name:p.name, ready:p.ready, index:p.index,
    connected:!!p.connected, eliminated:!!p.eliminated,
    score:room.scores[p.id] || 0, hasDrawnEver:!!p.hasDrawnEver,
    missedTurns:p.missedTurns || 0
  }));
}
function newRoom(id, maxPlayers, poolLimit) {
  return {
    id, maxPlayers, poolLimit:normalizePoolLimit(poolLimit),
    players:new Map(), playersList:[], started:false,
    deck:[], discard:[], wildJoker:null,
    currentPlayer:0, playerHasDrawn:false, turnEndsAt:0, turnTimer:null,
    scores:{}, dealerIndex:null, dealNumber:0, result:null
  };
}
function addPlayerToRoom(room, socket, name) {
  const p = {
    id:socket.id,
    sessionToken:crypto.randomUUID(),
    name:String(name || 'Player').trim().slice(0,18) || 'Player',
    ready:false, index:room.playersList.length, hand:[], connected:true,
    eliminated:false, hasDrawnEver:false, missedTurns:0
  };
  room.scores[p.id] = 0;
  room.players.set(socket.id,p);
  room.playersList.push(p);
  socket.join(room.id);
  socket.roomId=room.id;
  return p;
}
function makeDeck() {
  const d=[];
  for(let n=0;n<2;n++) suits.forEach(x=>ranks.forEach(r=>d.push({rank:r,suit:x.s,color:x.c,isPrintedJoker:false,id:''})));
  d.push({rank:'PJ',suit:'🃏',color:'red',isPrintedJoker:true,id:''});
  d.push({rank:'PJ',suit:'🃏',color:'black',isPrintedJoker:true,id:''});
  d.forEach((c,i)=>c.id=`${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,8)}`);
  return d;
}
function shuffle(a) {
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function isWild(room,c){ return !!c && (c.isPrintedJoker || (!!room.wildJoker && c.rank===room.wildJoker.rank)); }
function pureSeq(g){
  if(!Array.isArray(g)||g.length<3||g.some(c=>c.isPrintedJoker))return false;
  const suit=g[0]?.suit;if(!suit||g.some(c=>c.suit!==suit))return false;
  const vals=g.map(c=>RANK[c.rank]).sort((a,b)=>a-b);
  if(new Set(vals).size!==vals.length)return false;
  if(vals.every((v,i)=>i===0||v===vals[i-1]+1))return true;
  const hi=g.map(c=>c.rank==='A'?14:RANK[c.rank]).sort((a,b)=>a-b);
  return hi.every((v,i)=>i===0||v===hi[i-1]+1);
}
function impureSeq(g,room){
  if(!Array.isArray(g)||g.length<3)return false;
  if(pureSeq(g))return true;
  const nj=g.filter(c=>!isWild(room,c)), jok=g.length-nj.length;
  if(!nj.length)return jok>=3;
  const suit=nj[0].suit;if(nj.some(c=>c.suit!==suit))return false;
  let vals=nj.map(c=>RANK[c.rank]).sort((a,b)=>a-b);if(new Set(vals).size!==vals.length)return false;
  let gaps=0;for(let i=1;i<vals.length;i++)gaps+=vals[i]-vals[i-1]-1;
  if(gaps<=jok)return true;
  const hi=nj.map(c=>c.rank==='A'?14:RANK[c.rank]).sort((a,b)=>a-b);gaps=0;
  for(let i=1;i<hi.length;i++)gaps+=hi[i]-hi[i-1]-1;
  return gaps<=jok;
}
function validSet(g,room){
  if(!Array.isArray(g)||g.length<3||g.length>4)return false;
  const nj=g.filter(c=>!isWild(room,c));if(!nj.length)return true;
  const r=nj[0].rank;if(nj.some(c=>c.rank!==r))return false;
  const ss=new Set();for(const c of nj){if(ss.has(c.suit))return false;ss.add(c.suit);}return true;
}
function validGroup(g,room){return pureSeq(g)||impureSeq(g,room)||validSet(g,room);}
function cardValue(room,c){if(!c||isWild(room,c))return 0;return ['J','Q','K','A'].includes(c.rank)?10:(parseInt(c.rank,10)||0);}
function bestLifeScore(hand,room){
  const cards=hand.filter(Boolean),n=cards.length,groups=[];
  function rec(start,cur){
    if(cur.length>=3){const g=cur.map(i=>cards[i]);if(validGroup(g,room))groups.push({idx:[...cur],g});}
    if(cur.length>=13)return;
    for(let i=start;i<n;i++)rec(i+1,[...cur,i]);
  }
  rec(0,[]);
  let best={covered:0,hasPure:false,groups:[]};
  function search(pos,used,chosen,hasPure){
    let covered=0;for(const i of used)covered+=cardValue(room,cards[i]);
    if(hasPure&&covered>best.covered)best={covered,hasPure,groups:chosen.map(x=>x.g)};
    for(let j=pos;j<groups.length;j++){
      const x=groups[j];if(x.idx.some(i=>used.has(i)))continue;
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
  const byId=new Map(p.hand.map(c=>[c.id,c])),used=new Set(),groups=[];
  for(const ids of groupIds){
    if(!Array.isArray(ids)||ids.length<3)return {ok:false,reason:'Every group must contain at least 3 cards.'};
    const g=[];
    for(const id of ids){
      if(used.has(id))return {ok:false,reason:'A card is used in more than one group.'};
      const c=byId.get(id);if(!c||id===discardId)return {ok:false,reason:'Invalid card in group.'};
      used.add(id);g.push(c);
    }
    if(!validGroup(g,room))return {ok:false,reason:'One or more groups are invalid.'};
    groups.push(g);
  }
  if(hand.some(c=>!used.has(c.id)))return {ok:false,reason:'All 13 cards must be covered by valid groups.'};

  // 13-card SHOW structure: the hand must be split into exactly 4 valid groups.
  // With every group containing 3 or 4 cards, this gives the four supported
  // combinations: 2 Seq + 2 Sets, 2 Seq + Set + 4-card Group,
  // 3 Seq + Set, or 4 Sequences.
  if(groups.length!==4)return {ok:false,reason:'Show must contain exactly 4 groups for 13 cards (3/4 cards per group).'};
  if(groups.some(g=>g.length<3||g.length>4))return {ok:false,reason:'Each show group must contain 3 or 4 cards.'};

  const pureCount=groups.filter(g=>pureSeq(g)).length;
  const sequenceCount=groups.filter(g=>impureSeq(g,room)).length;
  if(pureCount<1)return {ok:false,reason:'Wrong Show: at least 1 Pure Sequence is compulsory.'};
  if(sequenceCount<2)return {ok:false,reason:'Wrong Show: at least 2 Sequences are compulsory.'};

  // Every supported 13-card pattern is represented by four groups.
  const setCount=groups.filter(g=>validSet(g,room)).length;
  const pattern =
    (sequenceCount===2 && setCount===2) ||
    (sequenceCount===2 && setCount===1) ||
    (sequenceCount===3 && setCount===1) ||
    (sequenceCount===4 && setCount===0);
  if(!pattern)return {ok:false,reason:'Invalid 13-card combination. Allowed: 2 Sequences + 2 Sets; 2 Sequences + 1 Set + 1 Group; 3 Sequences + 1 Set; or 4 Sequences.'};

  return {ok:true,groups,pattern:{pureSequences:pureCount,sequences:sequenceCount,sets:setCount}};
}
function activePlayers(room){return room.playersList.filter(p=>!p.eliminated && p.connected);}
function nextActiveIndex(room,from){
  const n=room.playersList.length;
  for(let step=1;step<=n;step++){
    const idx=(from+step)%n,p=room.playersList[idx];
    if(p && !p.eliminated && p.connected)return idx;
  }
  return from;
}
function eliminateIfNeeded(room,p){
  if((room.scores[p.id]||0)>=room.poolLimit){p.eliminated=true;return true;}
  return false;
}
function cardRankForToss(c){
  if(!c) return 0;
  if(c.isPrintedJoker) return 15;
  return RANK[c.rank]||0;
}
function runToss(room){
  const pool=shuffle(makeDeck());
  const toss=[];
  for(const p of room.playersList){
    const card=pool.pop();
    toss.push({playerId:p.id,index:p.index,name:p.name,card:publicCard(card),value:cardRankForToss(card)});
  }
  toss.sort((a,b)=>b.value-a.value || a.index-b.index);
  const first=toss[0]?.index ?? 0;
  return {cards:toss,firstPlayer:first};
}
function stateFor(room,socketId){
  const me=room.players.get(socketId);if(!me)return null;
  return {
    roomId:room.id,players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,
    myIndex:me.index,
    hands:room.playersList.map(p=>p.id===socketId?p.hand.map(publicCard):{count:p.hand.length}),
    deckCount:room.deck.length,discardTop:publicCard(room.discard[room.discard.length-1]),
    wildJoker:publicCard(room.wildJoker),currentPlayer:room.currentPlayer,
    playerHasDrawn:room.playerHasDrawn,turnEndsAt:room.turnEndsAt,started:room.started,
    scores:room.scores,dealerIndex:room.dealerIndex,
    dealerName:room.playersList[room.dealerIndex]?.name||null,dealNumber:room.dealNumber,
    toss:room.toss||[], result:room.result
  };
}
function broadcastState(room){for(const p of room.playersList)io.to(p.id).emit('gameState',stateFor(room,p.id));}
function endDealByLastPlayer(room){
  const active=activePlayers(room);
  if(active.length!==1)return false;
  if(room.turnTimer)clearTimeout(room.turnTimer);
  const winner=active[0];
  room.result={winnerId:winner.id,winnerName:winner.name,valid:true,byElimination:true,penalties:[]};
  room.started=false;
  room.result.matchWinner=(room.playersList.find(p=>!p.eliminated)?.name)||winner.name;
  broadcastState(room);io.to(room.id).emit('dealResult',room.result);
  return true;
}
function startTurn(room){
  if(room.turnTimer)clearTimeout(room.turnTimer);
  if(!room.started)return;
  if(room.playersList.length===0)return;
  if(room.playersList[room.currentPlayer]?.eliminated || !room.playersList[room.currentPlayer]?.connected){
    room.currentPlayer=nextActiveIndex(room,room.currentPlayer);
  }
  room.playerHasDrawn=false;
  room.turnEndsAt=Date.now()+TURN_MS;
  room.turnTimer=setTimeout(()=>{
    if(!room.started)return;
    const p=room.playersList[room.currentPlayer];
    if(!p || p.eliminated || !p.connected){room.currentPlayer=nextActiveIndex(room,room.currentPlayer);return startTurn(room);}
    // Missed turn: auto-draw one card (if possible) and discard one random card.
    p.missedTurns=(p.missedTurns||0)+1;
    if(room.deck.length===0&&room.discard.length>1){const top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top];}
    if(room.deck.length){p.hand.push(room.deck.pop());p.hasDrawnEver=true;room.playerHasDrawn=true;}
    if(p.hand.length>13){const idx=Math.floor(Math.random()*p.hand.length);room.discard.push(p.hand.splice(idx,1)[0]);}
    room.playerHasDrawn=false;
    if(p.missedTurns>=3){room.scores[p.id]=(room.scores[p.id]||0)+50;eliminateIfNeeded(room,p);p.missedTurns=0;}
    if(endDealByLastPlayer(room))return;
    room.currentPlayer=nextActiveIndex(room,room.currentPlayer);
    startTurn(room);
  },TURN_MS);
  broadcastState(room);
}
function startRealGame(room){
  if(room.playersList.length<2 || room.playersList.length!==roomCapacity(room))return;
  room.started=true;room.result=null;room.dealNumber=(room.dealNumber||0)+1;
  if(room.dealerIndex==null)room.dealerIndex=Math.floor(Math.random()*room.playersList.length);
  else room.dealerIndex=room.dealerIndex%room.playersList.length;
  room.deck=shuffle(makeDeck());room.discard=[];room.wildJoker=null;
  room.playersList.forEach(p=>{p.hand=[];p.eliminated=(room.scores[p.id]||0)>=room.poolLimit;p.missedTurns=0;});
  // Deal exactly 13 cards to every active player.
  for(let r=0;r<13;r++)for(let step=1;step<=room.playersList.length;step++){
    const idx=(room.dealerIndex+step)%room.playersList.length,p=room.playersList[idx];
    if(!p.eliminated && room.deck.length)p.hand.push(room.deck.pop());
  }
  if(room.deck.length)room.discard=[room.deck.pop()];
  // Wild rank is selected once per deal and never changes until the next deal.
  const nonPrinted=room.deck.filter(c=>!c.isPrintedJoker);
  room.wildJoker=nonPrinted.length?nonPrinted[Math.floor(Math.random()*nonPrinted.length)]:null;
  const toss=runToss(room);
  room.toss=toss.cards;
  room.currentPlayer=toss.firstPlayer;
  if(room.playersList[room.currentPlayer]?.eliminated || !room.playersList[room.currentPlayer]?.connected) room.currentPlayer=nextActiveIndex(room,room.currentPlayer);
  room.playerHasDrawn=false;
  startTurn(room);
  io.to(room.id).emit('realGameStarted',{roomId:room.id,players:publicPlayers(room),dealerIndex:room.dealerIndex,currentPlayer:room.currentPlayer,dealNumber:room.dealNumber,poolLimit:room.poolLimit,toss:toss.cards});
}
function createRoomFromEvent(name,maxPlayers,poolLimit,socket){
  const requested=Number(maxPlayers)||2,capacity=[2,4,6].includes(requested)?requested:2;
  const room=newRoom(code(),capacity,poolLimit);rooms.set(room.id,room);const p=addPlayerToRoom(room,socket,name);return {room,p};
}

io.on('connection',socket=>{
  broadcastOnlineCount();

  socket.on('createRoom',({name,maxPlayers,poolLimit})=>{
    const {room,p}=createRoomFromEvent(name,maxPlayers,poolLimit,socket);
    socket.emit('roomCreated',{roomId:room.id,playerId:p.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});broadcastOnlineCount();
  });

  socket.on('joinRoom',({name,roomId})=>{
    const id=String(roomId||'').toUpperCase(),room=rooms.get(id);if(!room)return socket.emit('roomError','Room not found.');
    if(room.started)return socket.emit('roomError','Game already started.');
    if(room.playersList.length>=roomCapacity(room))return socket.emit('roomError',`Room is full (${roomCapacity(room)} players maximum).`);
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:p.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});broadcastOnlineCount();
  });

  socket.on('quickJoin',({name,maxPlayers,poolLimit})=>{
    const requested=Number(maxPlayers)||6,capacity=[2,4,6].includes(requested)?requested:6,limit=normalizePoolLimit(poolLimit);
    let room=[...rooms.values()].find(r=>!r.started&&r.maxPlayers===capacity&&r.poolLimit===limit&&r.playersList.length<capacity);
    if(!room){room=newRoom(code(),capacity,limit);rooms.set(room.id,room);}
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:p.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit,quickJoin:true});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});broadcastOnlineCount();
    if(room.playersList.length===capacity)io.to(room.id).emit('quickMatchReady',{message:`Table full: ${capacity} players. Everyone press READY.`});
  });

  socket.on('ready',({roomId,playerId})=>{
    const room=rooms.get(String(roomId||'').toUpperCase());if(!room)return;
    const p=room.players.get(playerId||socket.id);if(!p)return;
    if(room.started)return;
    p.ready=true;io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    if(room.playersList.length===roomCapacity(room)&&room.playersList.every(x=>x.ready&&x.connected&&!x.eliminated))startRealGame(room);else socket.emit('readyAck');
  });

  function canAct(room,p){return room&&p&&room.started&&!p.eliminated&&p.connected&&p.index===room.currentPlayer;}
  socket.on('drawDeck',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!canAct(room,p)||room.playerHasDrawn)return socket.emit('onlineActionError',{message:'Not your turn, or you already drew.'});
    if(room.deck.length===0&&room.discard.length>1){const top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top];}
    if(!room.deck.length)return socket.emit('onlineActionError',{message:'Closed deck is empty.'});
    const card=room.deck.pop();p.hand.push(card);p.hasDrawnEver=true;p.missedTurns=0;room.playerHasDrawn=true;
    socket.emit('onlineActionAck',{action:'draw',card:publicCard(card),handCount:p.hand.length});broadcastState(room);
  });
  socket.on('drawDiscard',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!canAct(room,p)||room.playerHasDrawn||room.discard.length===0)return socket.emit('onlineActionError',{message:'Cannot draw from OPEN DECK now.'});
    const card=room.discard.pop();p.hand.push(card);p.hasDrawnEver=true;p.missedTurns=0;room.playerHasDrawn=true;
    socket.emit('onlineActionAck',{action:'draw',card:publicCard(card),handCount:p.hand.length});broadcastState(room);
  });
  socket.on('discardCard',({cardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!canAct(room,p)||!room.playerHasDrawn)return socket.emit('onlineActionError',{message:'Draw first; it must be your turn.'});
    if(p.hand.length!==14)return socket.emit('onlineActionError',{message:'You must have 14 cards before discarding.'});
    const idx=p.hand.findIndex(c=>c.id===cardId);if(idx<0)return socket.emit('onlineActionError',{message:'Select one card to discard.'});
    room.discard.push(p.hand.splice(idx,1)[0]);p.missedTurns=0;room.playerHasDrawn=false;
    room.currentPlayer=nextActiveIndex(room,room.currentPlayer);startTurn(room);
  });

  socket.on('dropGame',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!canAct(room,p)||room.playerHasDrawn&&p.hand.length!==14)return socket.emit('onlineActionError',{message:'Drop is allowed only on your turn.'});
    const firstDrop=!p.hasDrawnEver;
    const points=firstDrop?25:50;
    room.scores[p.id]=(room.scores[p.id]||0)+points;p.eliminated=true;p.ready=false;
    room.playerHasDrawn=false;
    io.to(room.id).emit('dropResult',{playerId:p.id,name:p.name,points,firstDrop,score:room.scores[p.id]});
    if(endDealByLastPlayer(room))return;
    room.currentPlayer=nextActiveIndex(room,room.currentPlayer);startTurn(room);
  });

  socket.on('declare',({groupIds,discardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!canAct(room,p)||!room.playerHasDrawn)return socket.emit('onlineActionError',{message:'Declare is allowed only on your turn after drawing.'});
    const check=validateShow(room,p,groupIds,discardId);
    if(check.ok){
      if(room.turnTimer)clearTimeout(room.turnTimer);
      const winner=p,penalties=[];
      for(const opp of room.playersList){if(opp.id===winner.id||opp.eliminated)continue;const pts=bestLifeScore(opp.hand,room).points;room.scores[opp.id]=(room.scores[opp.id]||0)+pts;eliminateIfNeeded(room,opp);penalties.push({playerId:opp.id,name:opp.name,points:pts});}
      room.result={winnerId:winner.id,winnerName:winner.name,valid:true,penalties};room.started=false;
      const gameWinner=room.playersList.find(x=>!x.eliminated)||winner;room.result.matchWinner=(room.scores[gameWinner.id]||0)>=room.poolLimit?gameWinner.name:null;
      broadcastState(room);io.to(room.id).emit('dealResult',room.result);
    }else{
      room.scores[p.id]=(room.scores[p.id]||0)+80;eliminateIfNeeded(room,p);
      if(room.turnTimer)clearTimeout(room.turnTimer);
      room.result={winnerId:null,winnerName:null,valid:false,wrongShow:true,loserId:p.id,loserName:p.name,penalties:[{playerId:p.id,name:p.name,points:80}],reason:check.reason};room.started=false;
      const remaining=room.playersList.find(x=>!x.eliminated&&x.id!==p.id);room.result.matchWinner=remaining&&(room.scores[p.id]||0)>=room.poolLimit?remaining.name:null;
      broadcastState(room);io.to(room.id).emit('dealResult',room.result);
    }
  });

  socket.on('nextDeal',()=>{
    const room=rooms.get(socket.roomId);if(!room||room.started||room.playersList.length<2)return;
    const alive=room.playersList.filter(p=>!p.eliminated&&p.connected);
    if(alive.length<=1||room.playersList.some(p=>(room.scores[p.id]||0)>=room.poolLimit))return io.to(room.id).emit('poolFinished',{scores:room.scores,poolLimit:room.poolLimit,result:room.result});
    room.playersList.forEach(p=>{p.ready=true;p.hand=[];p.hasDrawnEver=false;p.missedTurns=0;});
    if(room.dealerIndex!=null)room.dealerIndex=(room.dealerIndex+1)%room.playersList.length;
    startRealGame(room);
  });

  socket.on('reconnectPlayer',({roomId,sessionToken,name})=>{
    const room=rooms.get(String(roomId||'').toUpperCase());if(!room)return socket.emit('roomError','Room not found.');
    const p=room.playersList.find(x=>x.sessionToken===sessionToken);if(!p)return socket.emit('roomError','Reconnect session expired.');
    const oldSocketId=p.id;
    if(oldSocketId&&oldSocketId!==socket.id){const oldSocket=io.sockets.sockets.get(oldSocketId);if(oldSocket){try{oldSocket.disconnect(true);}catch(e){}}room.players.delete(oldSocketId);}
    p.id=socket.id;p.connected=true;p.lastDisconnect=0;if(name)p.name=String(name).slice(0,18);
    room.players.set(socket.id,p);socket.join(room.id);socket.roomId=room.id;
    socket.emit('reconnected',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});broadcastState(room);
  });

  socket.on('chatMessage',({text})=>{const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);if(!room||!p||!String(text||'').trim())return;io.to(room.id).emit('chatMessage',{name:p.name,text:String(text).trim().slice(0,200),at:Date.now()});});
  socket.on('leaveRoom',()=>{
    const id=socket.roomId,room=id&&rooms.get(id);if(!room)return;const p=room.players.get(socket.id);if(!p)return;
    if(room.turnTimer)clearTimeout(room.turnTimer);room.players.delete(socket.id);room.playersList=room.playersList.filter(x=>x.id!==socket.id);
    if(room.playersList.length===0){rooms.delete(id);socket.leave(id);socket.roomId=null;broadcastOnlineCount();return;}
    room.playersList.forEach((x,i)=>x.index=i);room.started=false;room.playersList.forEach(x=>x.ready=false);
    if(room.dealerIndex!=null)room.dealerIndex=Math.min(room.dealerIndex,room.playersList.length-1);
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});io.to(id).emit('roomError',p.name+' left the room. Please READY again.');
    socket.leave(id);socket.roomId=null;socket.emit('leftRoom');broadcastOnlineCount();
  });

  socket.on('requestRematch',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);if(!room||!p||room.started||room.playersList.length<2)return;
    if(room.playersList.some(x=>(room.scores[x.id]||0)>=room.poolLimit))return io.to(room.id).emit('poolFinished',{scores:room.scores,poolLimit:room.poolLimit,result:room.result});
    room.playersList.forEach(x=>{x.ready=true;x.hand=[];x.hasDrawnEver=false;x.missedTurns=0;});
    if(room.dealerIndex!=null)room.dealerIndex=(room.dealerIndex+1)%room.playersList.length;startRealGame(room);
  });

  socket.on('disconnect',()=>{
    const id=socket.roomId,room=id&&rooms.get(id);if(!room)return;const p=room.players.get(socket.id);if(!p)return;
    p.connected=false;p.lastDisconnect=Date.now();io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});broadcastOnlineCount();
    setTimeout(()=>{
      const still=room.playersList.find(x=>x.sessionToken===p.sessionToken);if(!still||still.connected)return;
      if(room.turnTimer)clearTimeout(room.turnTimer);room.players.delete(still.id);room.playersList=room.playersList.filter(x=>x.sessionToken!==still.sessionToken);
      if(room.playersList.length===0){rooms.delete(id);return;}room.playersList.forEach((x,i)=>x.index=i);room.started=false;room.playersList.forEach(x=>x.ready=false);
      if(room.dealerIndex!=null)room.dealerIndex=Math.min(room.dealerIndex,room.playersList.length-1);
      io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});io.to(id).emit('roomError',p.name+' left the room. Please READY again.');
    },RECONNECT_GRACE_MS);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`RUMMY JKRN server listening on ${PORT}`));
