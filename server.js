const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
const POOL_LIMIT = 201;
const MAX_PLAYERS = 6;
const RECONNECT_GRACE_MS = 120000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
    if(!validGroup(g,room))return {ok:false,reason:'One or more groups are invalid.'};groups.push(g);
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
    room.currentPlayer=(room.currentPlayer+1)%room.playersList.length;
    startTurn(room);
    broadcastState(room);
  },30000);
  broadcastState(room);
}
function startRealGame(room){
  room.started=true; room.result=null;
  room.dealNumber=(room.dealNumber||0)+1;
  if(room.dealerIndex==null) room.dealerIndex=Math.floor(Math.random()*room.playersList.length);
  else room.dealerIndex=room.dealerIndex%room.playersList.length;
  room.deck=shuffle(makeDeck());
  room.playersList.forEach(p=>p.hand=[]);
  for(let r=0;r<13;r++) for(let step=1;step<=room.playersList.length;step++){
    const idx=(room.dealerIndex+step)%room.playersList.length;
    room.playersList[idx].hand.push(room.deck.pop());
  }
  room.discard=[room.deck.pop()];
  const nonPrinted=room.deck.filter(c=>!c.isPrintedJoker);
  room.wildJoker=nonPrinted[Math.floor(Math.random()*nonPrinted.length)] || null;
  room.currentPlayer=(room.dealerIndex+1)%room.playersList.length;
  room.playerHasDrawn=false;
  startTurn(room);
  io.to(room.id).emit('realGameStarted',{roomId:room.id,players:publicPlayers(room),dealerIndex:room.dealerIndex,currentPlayer:room.currentPlayer,dealNumber:room.dealNumber});
}


io.on('connection',socket=>{
  socket.on('createRoom',({name,maxPlayers,poolLimit})=>{
    const id=code();
    const requested=Number(maxPlayers)||2; const capacity=[2,4,6].includes(requested)?requested:2;
    const selectedPool=[101,201].includes(Number(poolLimit))?Number(poolLimit):201;
    const room={id,maxPlayers:capacity,poolLimit:selectedPool,players:new Map(),playersList:[],started:false,deck:[],discard:[],wildJoker:null,currentPlayer:0,playerHasDrawn:false,turnEndsAt:0,turnTimer:null,scores:{},dealerIndex:null,dealNumber:0};
    const p={id:socket.id,sessionToken:require('crypto').randomUUID(),name:String(name||'Player').slice(0,18),ready:false,index:0,hand:[],connected:true}; room.scores={}; room.scores[p.id]=0;
    room.players.set(socket.id,p);room.playersList.push(p);rooms.set(id,room);socket.join(id);socket.roomId=id;
    socket.emit('roomCreated',{roomId:id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
  });
  socket.on('joinRoom',({name,roomId})=>{
    const id=String(roomId||'').toUpperCase(),room=rooms.get(id);
    if(!room)return socket.emit('roomError','Room not found.');
    if(room.started)return socket.emit('roomError','Game already started.');
    if(room.playersList.length>=roomCapacity(room))return socket.emit('roomError',`Room is full (${roomCapacity(room)} players maximum).`);
    const p={id:socket.id,sessionToken:require('crypto').randomUUID(),name:String(name||'Player').slice(0,18),ready:false,index:room.playersList.length,hand:[],connected:true}; room.scores[p.id]=0;
    room.players.set(socket.id,p);room.playersList.push(p);socket.join(id);socket.roomId=id;
    socket.emit('roomJoined',{roomId:id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
  });
  socket.on('ready',({roomId,playerId})=>{
    const room=rooms.get(String(roomId||'').toUpperCase());if(!room)return;
    const p=room.players.get(playerId||socket.id);if(!p)return;
    p.ready=true;io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers});
    if(room.playersList.length===roomCapacity(room) && room.playersList.every(x=>x.ready && x.connected))startRealGame(room);else socket.emit('readyAck');
  });
  socket.on('drawDeck',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);if(!room||!p||!room.started||p.index!==room.currentPlayer||room.playerHasDrawn)return;
    if(room.deck.length===0 && room.discard.length>1){const top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top];}
    if(!room.deck.length)return;
    p.hand.push(room.deck.pop());room.playerHasDrawn=true;broadcastState(room);
  });
  socket.on('drawDiscard',()=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);if(!room||!p||!room.started||p.index!==room.currentPlayer||room.playerHasDrawn||room.discard.length===0)return;
    p.hand.push(room.discard.pop());room.playerHasDrawn=true;broadcastState(room);
  });
  socket.on('discardCard',({cardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);if(!room||!p||!room.started||p.index!==room.currentPlayer||!room.playerHasDrawn)return;
    if(p.hand.length!==14)return;
    const idx=p.hand.findIndex(c=>c.id===cardId);if(idx<0)return;
    room.discard.push(p.hand.splice(idx,1)[0]);
    room.currentPlayer=(room.currentPlayer+1)%room.playersList.length;
    startTurn(room);
  });

  socket.on('declare',({groupIds,discardId})=>{
    const room=rooms.get(socket.roomId),p=room&&room.players.get(socket.id);
    if(!room||!p||!room.started||p.index!==room.currentPlayer||!room.playerHasDrawn)return;
    const check=validateShow(room,p,groupIds,discardId);
    if(check.ok){
      if(room.turnTimer)clearTimeout(room.turnTimer);
      const winner=p, opp=room.playersList.find(x=>x.id!==p.id);
      const oppScore=opp?bestLifeScore(opp.hand,room).points:0;
      if(opp)room.scores[opp.id]=(room.scores[opp.id]||0)+oppScore;
      room.result={winnerId:winner.id,winnerName:winner.name,valid:true,penalties:opp?[{playerId:opp.id,name:opp.name,points:oppScore}]:[]};
      room.started=false;
      const gameWinner=(opp && (room.scores[opp.id]||0)>=POOL_LIMIT)?opp:(winner && (room.scores[winner.id]||0)>=POOL_LIMIT?winner:null);
      room.result.matchWinner=gameWinner?gameWinner.name:null;
      broadcastState(room);io.to(room.id).emit('dealResult',room.result);
    }else{
      room.scores[p.id]=(room.scores[p.id]||0)+80;
      room.result={winnerId:null,winnerName:null,valid:false,wrongShow:true,loserId:p.id,loserName:p.name,penalties:[{playerId:p.id,name:p.name,points:80}],reason:check.reason};
      room.started=false;
      const gameWinner=(room.scores[p.id]||0)>=POOL_LIMIT ? room.playersList.find(x=>x.id!==p.id)?.name : null;
      room.result.matchWinner=gameWinner||null;
      broadcastState(room);io.to(room.id).emit('dealResult',room.result);
    }
  });
  socket.on('nextDeal',()=>{
    const room=rooms.get(socket.roomId);if(!room||room.started||room.playersList.length<2)return;
    if(room.playersList.some(p=>(room.scores[p.id]||0)>=POOL_LIMIT))return io.to(room.id).emit('poolFinished',{scores:room.scores,result:room.result});
    room.playersList.forEach(p=>{p.ready=true;p.hand=[];});
    if(room.dealerIndex!=null) room.dealerIndex=(room.dealerIndex+1)%room.playersList.length;
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
    socket.emit('reconnected',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers}); broadcastState(room);
  });
  socket.on('disconnect',()=>{
    const id=socket.roomId,room=id&&rooms.get(id);if(!room)return;
    const p=room.players.get(socket.id); if(!p)return;
    p.connected=false; p.lastDisconnect=Date.now();
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers});
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
      io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers});
      io.to(id).emit('roomError',p.name+' left the room. Please READY again.');
    },RECONNECT_GRACE_MS);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`RUMMY JKRN real-player server: http://localhost:${PORT}`));
