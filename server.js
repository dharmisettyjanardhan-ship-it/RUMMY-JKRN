const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('createRoom', ({ name, maxPlayers, poolLimit }) => {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    rooms.set(roomId, { id: roomId, players: [socket.id], maxPlayers: maxPlayers || 2 });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerId: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rummy JKRN server running on http://localhost:${PORT}`));
