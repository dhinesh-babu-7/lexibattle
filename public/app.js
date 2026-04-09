const socket = io();

// DOM Elements
const screens = {
    landing: document.getElementById('landing-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen')
};

// State
let myRoomId = '';
let myUsername = '';
let isHost = false;
let currentTimer = 0;
let hasAnswered = false;

// Audio Effects (Using standard web free sound bytes)
const sfx = {
    tick: new Audio('https://www.soundjay.com/buttons/sounds/button-30.mp3'),
    correct: new Audio('https://www.soundjay.com/buttons/sounds/button-09.mp3'),
    wrong: new Audio('https://www.soundjay.com/buttons/sounds/button-10.mp3')
};

// --- Navigation ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// --- Setup/Lobby ---
document.getElementById('create-room-btn').addEventListener('click', () => {
    myUsername = document.getElementById('username').value.trim();
    if (!myUsername) return alert('Enter a username!');
    socket.emit('createRoom', myUsername);
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    myUsername = document.getElementById('username').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!myUsername || !roomId) return alert('Enter username and Room Code!');
    socket.emit('joinRoom', { username: myUsername, roomId });
});

socket.on('roomJoined', (data) => {
    myRoomId = data.roomId;
    isHost = data.isHost;
    document.getElementById('display-room-code').innerText = myRoomId;
    
    if (isHost) {
        document.getElementById('start-game-btn').classList.remove('hidden');
        document.getElementById('waiting-msg').classList.add('hidden');
    }
    
    updatePlayers(data.players);
    showScreen('lobby');
});

socket.on('updatePlayers', updatePlayers);

function updatePlayers(players) {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    document.getElementById('player-count').innerText = players.length;
    players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name;
        list.appendChild(li);
    });
}

document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('startGame', myRoomId);
});

socket.on('errorMsg', (msg) => {
    document.getElementById('error-msg').innerText = msg;
});

// --- Gameplay ---
socket.on('gameStarted', () => {
    showScreen('game');
});

socket.on('newQuestion', (data) => {
    hasAnswered = false;
    document.getElementById('q-level').innerText = data.level;
    document.getElementById('q-type').innerText = data.type;
    document.getElementById('question-text').innerText = data.q;
    
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    
    data.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => submitAnswer(index, btn);
        grid.appendChild(btn);
    });
});

socket.on('timerUpdate', (timeLeft) => {
    currentTimer = timeLeft;
    document.getElementById('timer').innerText = timeLeft;
    if(timeLeft <= 5 && timeLeft > 0) sfx.tick.play().catch(()=>{});
});

function submitAnswer(index, btnElement) {
    if (hasAnswered) return;
    hasAnswered = true;
    
    // Optimistic UI update
    btnElement.style.border = '2px solid white';
    socket.emit('submitAnswer', { roomId: myRoomId, answerIndex: index, timeRemaining: currentTimer });
}

socket.on('updateLeaderboard', (players) => {
    const list = document.getElementById('live-leaderboard-list');
    list.innerHTML = '';
    players.slice(0, 5).forEach(p => {
        const li = document.createElement('li');
        li.innerText = `${p.name} - ${p.score} pt`;
        list.appendChild(li);
    });
});

// --- Chat System ---
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const msg = e.target.value;
        if (msg) {
            socket.emit('sendChat', { roomId: myRoomId, message: msg, username: myUsername });
            e.target.value = '';
        }
    }
});

socket.on('chatMessage', (data) => {
    const chatBox = document.getElementById('chat-messages');
    chatBox.innerHTML += `<p><strong>${data.username}:</strong> ${data.message}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
});

// --- Game Over / Results ---
socket.on('gameOver', (data) => {
    showScreen('result');
    const players = data.players;
    
    if (players.length > 0) {
        document.getElementById('winner-name').innerText = players[0].name;
    }

    const podium = document.getElementById('podium');
    podium.innerHTML = '';
    players.slice(0, 3).forEach((p, i) => {
        const div = document.createElement('div');
        const medals = ['🥇', '🥈', '🥉'];
        div.innerHTML = `<h3>${medals[i]} ${p.name}</h3><p>${p.score} pts</p>`;
        podium.appendChild(div);
    });

    const reviewBox = document.getElementById('review-box');
    reviewBox.innerHTML = '';
    data.review.forEach(q => {
        reviewBox.innerHTML += `
            <div class="review-item">
                <p><strong>Q:</strong> ${q.q}</p>
                <p><strong>A:</strong> <span>${q.options[q.a]}</span></p>
                <p><em>${q.explain}</em></p>
            </div>
        `;
    });
});