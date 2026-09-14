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
function validGroup(g,room){return pureSeq(g)||impureSeq(g,room)||validSet(g,room);}
function cardValue(room,c){if(!c||isWild(room,c))return 0;return ['J','Q','K','A'].includes(c.rank)?10:(parseInt(c.rank,10)||0);}

function stateFor(room,socketId){
  const me=room.players.get(socketId); if(!me)return null;
  return {
    roomId:room.id, players:publicPlayers(room), maxPlayers:room.maxPlayers, myIndex:me.index,
    hands:room.playersList.map(p=>p.id===socketId ? p.hand.map(publicCard) : {count:p.hand.length}),
    deckCount:room.deck.length, discardTop:publicCard(room.discard[room.discard.length-1]),
    wildJoker:publicCard(room.wildJoker), currentPlayer:room.currentPlayer,
    playerHasDrawn:room.playerHasDrawn, turnEndsAt:room.turnEndsAt, started:room.started,
    scores: room.scores || {}, dealerIndex: room.dealerIndex
  };
}
function broadcastState(room){ for(const p of room.playersList){io.to(p.id).emit('gameState',stateFor(room,p.id));} }

io.on('connection',socket=>{
  socket.on('error',err=>console.error('Socket error:',err));
  broadcastOnlineCount();
  socket.on('createRoom',({name,maxPlayers,poolLimit})=>{
    const id=code();
    const capacity=[2,4,6].includes(Number(maxPlayers))?Number(maxPlayers):2;
    const room={id,maxPlayers:capacity,poolLimit:Number(poolLimit)||201,players:new Map(),playersList:[],started:false,deck:[],discard:[],wildJoker:null,currentPlayer:0,playerHasDrawn:false,scores:{}};
    rooms.set(id,room);
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomCreated',{roomId:id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
  });
  socket.on('joinRoom',({name,roomId})=>{
    const id=String(roomId||'').toUpperCase(),room=rooms.get(id);
    if(!room)return socket.emit('roomError','Room not found.');
    const p=addPlayerToRoom(room,socket,name);
    socket.emit('roomJoined',{roomId:room.id,playerId:socket.id,sessionToken:p.sessionToken,maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    io.to(room.id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
  });
  socket.on('disconnect',()=>{
    const id=socket.roomId,room=id&&rooms.get(id);if(!room)return;
    const p=room.players.get(socket.id); if(!p)return;
    p.connected=false;
    io.to(id).emit('roomUpdate',{players:publicPlayers(room),maxPlayers:room.maxPlayers,poolLimit:room.poolLimit});
    broadcastOnlineCount();
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`RUMMY JKRN server running on http://localhost:${PORT}`));
