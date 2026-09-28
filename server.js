const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank, id: `${rank}${suit}` });
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makeRoom(id, pool) {
  return {
    id,
    pool,
    players: [],
    deck: [],
    discard: [],
    wildJoker: null,
    turn: 0,
    timer: null,
    started: false
  };
}

function publicRoom(room) {
  return {
    id: room.id,
    pool: room.pool,
    started: room.started,
    wildJoker: room.wildJoker,
    turn: room.turn,
    players: room.players.map((p, i) => ({
      id: p.id, name: p.name, seat: i + 1, cardCount: p.hand.length,
      connected: p.connected, score: p.score, dropped: p.dropped
    })),
    discardTop: room.discard.at(-1) || null,
    deckCount: room.deck.length
  };
}

function broadcastRoom(room) {
  io.to(room.id).emit("roomState", publicRoom(room));
}

function startGame(room) {
  if (room.players.length < 2 || room.players.length > 6) return false;

  room.deck = shuffle(createDeck());
  room.discard = [];
  room.started = true;
  room.turn = 0;

  for (const p of room.players) {
    p.hand = [];
    p.dropped = false;
  }

  for (let n = 0; n < 13; n++) {
    for (const p of room.players) p.hand.push(room.deck.pop());
  }

  room.wildJoker = room.deck.pop();
  room.discard.push(room.deck.pop());

  if (room.timer) clearTimeout(room.timer);
  scheduleTurn(room);
  return true;
}

function scheduleTurn(room) {
  if (!room.started || !room.players.length) return;

  if (room.timer) clearTimeout(room.timer);

  room.timer = setTimeout(() => {
    nextTurn(room);
  }, 30000);

  broadcastRoom(room);
}

function nextTurn(room) {
  if (!room.started) return;
  const count = room.players.length;
  for (let n = 0; n < count; n++) {
    room.turn = (room.turn + 1) % count;
    if (!room.players[room.turn].dropped) break;
  }
  scheduleTurn(room);
}

function cardPoints(card) {
  if (!card) return 0;
  if (["A","J","Q","K"].includes(card.rank)) return 10;
  return Number(card.rank) || 0;
}

function handScore(hand) {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name, pool }) => {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const room = makeRoom(roomId, pool === 201 ? 201 : 101);
    room.players.push({
      id: socket.id, name: String(name || "Player 1").slice(0, 20),
      hand: [], score: 0, dropped: false, connected: true
    });
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit("joined", { roomId, playerId: socket.id });
    broadcastRoom(room);
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms.get(String(roomId || "").toUpperCase());
    if (!room) return socket.emit("errorMessage", "Room not found.");
    if (room.started) return socket.emit("errorMessage", "Game already started.");
    if (room.players.length >= 6) return socket.emit("errorMessage", "Table is full.");

    room.players.push({
      id: socket.id, name: String(name || `Player ${room.players.length + 1}`).slice(0, 20),
      hand: [], score: 0, dropped: false, connected: true
    });
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.emit("joined", { roomId: room.id, playerId: socket.id });
    broadcastRoom(room);
  });

  socket.on("startGame", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    if (room.players[0]?.id !== socket.id)
      return socket.emit("errorMessage", "Only the host can start.");
    if (!startGame(room))
      return socket.emit("errorMessage", "Need 2 to 6 players.");
    sendHands(room);
    broadcastRoom(room);
  });

  socket.on("draw", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.started) return;
    const p = room.players[room.turn];
    if (!p || p.id !== socket.id) return socket.emit("errorMessage", "Not your turn.");
    if (p.hand.length >= 14) return socket.emit("errorMessage", "Discard first.");

    const card = room.deck.pop() || room.discard.pop();
    if (!card) return socket.emit("errorMessage", "No cards available.");
    p.hand.push(card);
    sendHands(room);
    broadcastRoom(room);
  });

  socket.on("discard", ({ index }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.started) return;
    const p = room.players[room.turn];
    if (!p || p.id !== socket.id) return socket.emit("errorMessage", "Not your turn.");
    if (p.hand.length !== 14) return socket.emit("errorMessage", "Draw one card first.");

    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= p.hand.length)
      return socket.emit("errorMessage", "Invalid card.");

    room.discard.push(p.hand.splice(i, 1)[0]);
    nextTurn(room);
    sendHands(room);
  });

  socket.on("drop", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.started) return;
    const p = room.players[room.turn];
    if (!p || p.id !== socket.id) return socket.emit("errorMessage", "Not your turn.");

    p.dropped = true;
    p.score += 20;
    nextTurn(room);
    sendHands(room);
  });

  socket.on("declare", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.started) return;
    const p = room.players[room.turn];
    if (!p || p.id !== socket.id) return socket.emit("errorMessage", "Not your turn.");
    if (p.hand.length !== 13) return socket.emit("errorMessage", "You must have 13 cards.");

    p.score = 0;
    room.started = false;
    if (room.timer) clearTimeout(room.timer);
    io.to(room.id).emit("result", {
      winner: p.name,
      message: `${p.name} declared. Basic declaration accepted; full sequence validation is next phase.`
    });
    broadcastRoom(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const p = room.players.find(x => x.id === socket.id);
    if (p) p.connected = false;
    broadcastRoom(room);
  });
});

function sendHands(room) {
  for (const p of room.players) {
    const s = io.sockets.sockets.get(p.id);
    if (s) s.emit("myHand", {
      hand: p.hand,
      myTurn: room.players[room.turn]?.id === p.id,
      wildJoker: room.wildJoker
    });
  }
  broadcastRoom(room);
}

server.listen(PORT, () => {
  console.log(`RUMMY JKRN running on http://localhost:${PORT}`);
});
