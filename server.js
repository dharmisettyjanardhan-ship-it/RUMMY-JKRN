const express=require('express');
const http=require('http');
const crypto=require('crypto');
const path=require('path');
const {WebSocketServer}=require('ws');

const app=express();
const server=http.createServer(app);
const wss=new WebSocketServer({server});
app.use(express.json());
app.use(express.static(__dirname));

const rooms=new Map();
const tosses=new Map();

const suits=['♠','♥','♦','♣'];
const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=crypto.randomInt(i+1);
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function newDeck(){
  const d=[];
  for(const suit of suits)for(const rank of ranks)d.push({rank,suit});
  return d;
}
function createToss(players){
  let deck=shuffle(newDeck());
  const cards=players.map(p=>({playerId:p.id,playerName:p.name,card:deck.pop()}));
  const tossId=crypto.randomUUID();
  tosses.set(tossId,{tossId,cards,players,createdAt:Date.now()});
  return {tossId,cards};
}
function resolveToss(t){
  const max=Math.max(...t.cards.map(x=>ranks.indexOf(x.card.rank)));
  const tied=t.cards.map((x,i)=>({x,i})).filter(o=>ranks.indexOf(o.x.card.rank)===max);
  if(tied.length>1){
    const tiedPlayers=tied.map(o=>t.players.find(p=>p.id===o.x.playerId));
    return {reToss:true,tiedPlayers};
  }
  const winner=tied[0];
  return {reToss:false,winnerId:winner.x.playerId,winnerName:winner.x.playerName,winnerIndex:winner.i};
}

app.post('/api/toss',(req,res)=>{
  const {roomId,players}=req.body||{};
  if(!roomId||!Array.isArray(players)||players.length<2||players.length>6)
    return res.status(400).json({ok:false,error:'2-6 active players required'});
  // In production this endpoint must be called only after server-side READY validation.
  const room=rooms.get(roomId)||{ready:new Set(),players};
  rooms.set(roomId,room);
  const result=createToss(players);
  res.json({ok:true,...result});
});

app.post('/api/toss/resolve',(req,res)=>{
  const {tossId}=req.body||{};
  const t=tosses.get(tossId);
  if(!t)return res.status(404).json({ok:false,error:'Toss not found'});
  const result=resolveToss(t);
  if(result.reToss){
    // The next toss will create a fresh shuffled deck and only tied players will be sent by a real client.
    tosses.delete(tossId);
    return res.json({ok:true,reToss:true,tiedPlayers:result.tiedPlayers});
  }
  // Critical fairness rule: discard toss deck and create a brand-new shuffled main deck.
  shuffle(newDeck());
  tosses.delete(tossId);
  res.json({ok:true,...result});
});

wss.on('connection',(ws)=>{
  const clientId=crypto.randomUUID();
  ws.clientId=clientId;
  ws.on('message',(raw)=>{
    let msg; try{msg=JSON.parse(raw)}catch{return}
    if(msg.type==='join'){
      const room=rooms.get(msg.roomId)||{players:[],ready:new Set(),clients:new Map()};
      if(!room.clients)room.clients=new Map();
      room.clients.set(clientId,ws);
      rooms.set(msg.roomId,room);
      ws.roomId=msg.roomId;
      ws.send(JSON.stringify({type:'joined',clientId,roomId:msg.roomId}));
    }
    if(msg.type==='ready'&&ws.roomId){
      const room=rooms.get(ws.roomId);
      if(room){room.ready.add(clientId);broadcastReady(room);}
    }
  });
  ws.on('close',()=>{
    if(ws.roomId){
      const room=rooms.get(ws.roomId);
      if(room){
        room.ready.delete(clientId);
        if(room.ready.size===0) room.tossStarted=false;
        broadcastReady(room);
      }
    }
  });
});
function broadcastReady(room){
  const payload=JSON.stringify({type:'readyState',ready:room.ready.size});
  if(room.clients)for(const c of room.clients.values())if(c.readyState===1)c.send(payload);
}

app.get('/health',(req,res)=>res.json({ok:true}));
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('RUMMY JKRN server listening on '+PORT));
