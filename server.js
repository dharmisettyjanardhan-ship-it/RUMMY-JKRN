const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
const DEFAULT_POOL_LIMIT = 201;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', socket => {
  socket.on('createRoom', ({ name }) => {
    socket.emit('roomCreated', { roomId: '123456', playerId: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`RUMMY JKRN server running on port ${PORT}`));
