const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Mock Vocabulary Database (In production, fetch from an API like Dictionary API)
const vocabularyDB = [
    { level: 'Easy', type: 'Synonym', q: "What is a synonym for 'Abundant'?", options: ["Scarce", "Plentiful", "Empty", "Brief"], a: 1, time: 10, explain: "Abundant means existing or available in large quantities; plentiful." },
    { level: 'Medium', type: 'Meaning', q: "What does 'Eloquent' mean?", options: ["Fluent and persuasive", "Clumsy", "Silent", "Angry"], a: 0, time: 10, explain: "Eloquent means fluent or persuasive in speaking or writing." },
    { level: 'Hard', type: 'Fill in the blank', q: "His argument was so _______ that everyone agreed with him.", options: ["Frivolous", "Compelling", "Obscure", "Tedious"], a: 1, time: 15, explain: "Compelling means evoking interest, attention, or admiration in a powerfully irresistible way." }
];

const rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (username) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            host: socket.id,
            players: [{ id: socket.id, name: username, score: 0 }],
            status: 'waiting',
            currentQ: 0
        };
        socket.join(roomId);
        socket.emit('roomJoined', { roomId, isHost: true, players: rooms[roomId].players });
    });

    socket.on('joinRoom', ({ username, roomId }) => {
        const room = rooms[roomId];
        if (room && room.status === 'waiting' && room.players.length < 50) {
            room.players.push({ id: socket.id, name: username, score: 0 });
            socket.join(roomId);
            socket.emit('roomJoined', { roomId, isHost: false, players: room.players });
            io.to(roomId).emit('updatePlayers', room.players);
        } else {
            socket.emit('errorMsg', 'Room not found, full, or game already started.');
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.status = 'playing';
            io.to(roomId).emit('gameStarted');
            sendQuestion(roomId);
        }
    });

    socket.on('submitAnswer', ({ roomId, answerIndex, timeRemaining }) => {
        const room = rooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        const correctAns = vocabularyDB[room.currentQ].a;
        
        if (answerIndex === correctAns && player) {
            // Scoring: 100 base points + 10 points per second remaining
            player.score += 100 + (timeRemaining * 10);
        }
        io.to(roomId).emit('updateLeaderboard', room.players.sort((a, b) => b.score - a.score));
    });

    socket.on('sendChat', ({ roomId, message, username }) => {
        io.to(roomId).emit('chatMessage', { username, message });
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
        }
    });
});

function sendQuestion(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.currentQ >= vocabularyDB.length) {
        io.to(roomId).emit('gameOver', {
            players: room.players.sort((a, b) => b.score - a.score),
            review: vocabularyDB
        });
        delete rooms[roomId];
        return;
    }

    const q = vocabularyDB[room.currentQ];
    io.to(roomId).emit('newQuestion', {
        level: q.level, type: q.type, q: q.q, options: q.options, time: q.time
    });

    let timeLeft = q.time;
    const timer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            room.currentQ++;
            setTimeout(() => sendQuestion(roomId), 3000); // 3 sec pause between questions
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`LexiBattle running on http://localhost:${PORT}`));