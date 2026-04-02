const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize SQLite database
const db = new Database('chat.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`);

const users = new Map(); // socketId -> username

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', (username) => {
    if (users.size >= 2 && !users.has(socket.id)) {
      // Room is full
      socket.emit('room_full', { message: 'Chat room is currently full (max 2 users).' });
      return;
    }

    users.set(socket.id, username);
    
    // Send message history
    const stmt = db.prepare('SELECT * FROM messages ORDER BY id ASC');
    const history = stmt.all();
    socket.emit('history', history);

    // Broadcast users online
    const onlineUsers = Array.from(users.values());
    io.emit('users_online', onlineUsers);

    // Send a system message that the user joined
    const systemJoinMsg = {
      id: Date.now() + Math.random(),
      sender: 'System',
      text: `${username} joined the chat`,
      timestamp: new Date().toISOString()
    };
    io.emit('message', systemJoinMsg);
  });

  socket.on('send_message', (data) => {
    const username = users.get(socket.id);
    if (!username) return;

    const timestamp = new Date().toISOString();
    
    const stmt = db.prepare('INSERT INTO messages (sender, text, timestamp) VALUES (?, ?, ?)');
    const info = stmt.run(username, data.text, timestamp);
    
    const messageObj = {
      id: info.lastInsertRowid,
      sender: username,
      text: data.text,
      timestamp: timestamp
    };
    
    io.emit('message', messageObj);
  });

  socket.on('typing', (isTyping) => {
    const username = users.get(socket.id);
    if (!username) return;
    
    socket.broadcast.emit('typing', { username, isTyping });
  });

  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      
      const onlineUsers = Array.from(users.values());
      io.emit('users_online', onlineUsers);

      const systemLeaveMsg = {
        id: Date.now() + Math.random(),
        sender: 'System',
        text: `${username} left the chat`,
        timestamp: new Date().toISOString()
      };
      io.emit('message', systemLeaveMsg);
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.get('/', (req, res) => {
  res.send('NightChat Backend API');
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
