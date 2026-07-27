import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect, get } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA_gMfUNO-Qer_3hbsqejbUqOg-8mLU00g",
    authDomain: "ahbawebgames.firebaseapp.com",
    databaseURL: "https://ahbawebgames-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ahbawebgames",
    storageBucket: "ahbawebgames.firebasestorage.app",
    messagingSenderId: "893149158970",
    appId: "1:893149158970:web:0b166b4fc06a40e1d5df03",
    measurementId: "G-73PHENDJPL"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// SANAL ÇÖZÜNÜRLÜK (Her cihazda dünya boyutları sabittir)
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const mpMenu = document.getElementById('mpMenu');
const hostSetup = document.getElementById('hostSetup');
const waitingScreen = document.getElementById('waitingScreen');
const roomInfoDisplay = document.getElementById('roomInfoDisplay');
const overlay = document.getElementById('gameOverlay');
const winnerText = document.getElementById('winnerText');

// Arena her zaman 800x600 merkeze yerleşir
const arena = {
    x: GAME_WIDTH / 2, 
    y: GAME_HEIGHT / 2,
    radius: 220,
    color: '#334155', 
    borderColor: '#38bdf8'
};

let players = [];
let role = null;
let roomCode = "";
let myId = 1; 
let maxPlayers = 1;
let gameStarted = false;
let gameOver = false;
let remoteInputs = { 2: {x:0, y:0}, 3: {x:0, y:0}, 4: {x:0, y:0} };

let lastHostWrite = 0;
let lastClientWrite = 0;
let lastSentJoystick = { x: 0, y: 0 };
const SYNC_RATE = 35; 

const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

let joystickData = { x: 0, y: 0 };
const manager = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'dynamic', color: '#38bdf8', size: 150
});
manager.on('move', (evt, data) => { if (data.vector) joystickData = { x: data.vector.x, y: -data.vector.y }; });
manager.on('end', () => { joystickData = { x: 0, y: 0 }; });

// === MENÜ VE LOBİ YÖNETİMİ ===
document.getElementById('btnHostInit').onclick = () => {
    mpMenu.style.display = 'none'; hostSetup.style.display = 'flex';
};

document.getElementById('btnCancelHost').onclick = () => {
    hostSetup.style.display = 'none'; mpMenu.style.display = 'flex';
};

document.querySelectorAll('.btn-player-count').forEach(btn => {
    btn.onclick = () => {
        maxPlayers = parseInt(btn.getAttribute('data-count'));
        hostSetup.style.display = 'none';
        role = 'host'; myId = 1;

        if (maxPlayers === 1) {
            initPlayersSetup(1); gameStarted = true;
        } else {
            roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            roomInfoDisplay.innerText = "Oda: " + roomCode; roomInfoDisplay.style.display = 'block';
            
            waitingScreen.style.display = 'flex';
            document.getElementById('waitingCode').innerText = "KOD: " + roomCode;
            document.getElementById('waitingCount').innerText = `1 / ${maxPlayers}`;

            const roomRef = ref(db, 'rooms/' + roomCode);
            set(roomRef, {
                info: { max: maxPlayers, joined: 1, ready: false },
                inputs: { 2: {x:0, y:0}, 3: {x:0, y:0}, 4: {x:0, y:0} },
                state: []
            });
            onDisconnect(roomRef).remove();

            onValue(ref(db, 'rooms/' + roomCode + '/info/joined'), (snapshot) => {
                if(snapshot.exists()) {
                    let joined = snapshot.val();
                    document.getElementById('waitingCount').innerText = `${joined} / ${maxPlayers}`;
                    if (joined === maxPlayers && !gameStarted) {
                        set(ref(db, 'rooms/' + roomCode + '/info/ready'), true);
                        waitingScreen.style.display = 'none';
                        initPlayersSetup(maxPlayers); gameStarted = true;
                    }
                }
            });

            onValue(ref(db, 'rooms/' + roomCode + '/inputs'), (snapshot) => {
                if(snapshot.exists() && gameStarted) remoteInputs = snapshot.val();
            });
        }
    };
});

document.getElementById('btnJoin').onclick = () => {
    const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if (code.length === 4) {
        get(ref(db, 'rooms/' + code + '/info')).then((snapshot) => {
            if (snapshot.exists()) {
                let info = snapshot.val();
                if (info.joined < info.max && !info.ready) {
                    role = 'client'; roomCode = code; myId = info.joined + 1;
                    
                    set(ref(db, 'rooms/' + roomCode + '/info/joined'), myId);
                    mpMenu.style.display = 'none'; waitingScreen.style.display = 'flex';
                    document.getElementById('waitingCode').innerText = "KOD: " + roomCode;
                    document.getElementById('waitingCount').innerText = "Bağlanıldı, Kurucu Bekleniyor...";
                    
                    onValue(ref(db, 'rooms/' + roomCode + '/info/ready'), (snap) => {
                        if (snap.exists() && snap.val() === true) {
                            waitingScreen.style.display = 'none';
                            roomInfoDisplay.innerText = "Oda: " + roomCode;
                            roomInfoDisplay.style.display = 'block';
                            gameStarted = true;
                        }
                    });

                    // BİLGİSAYARDAN/TELEFONDAN KATILANDA SİYAH EKRAN OLMAMASI İÇİN CANLI VERİ OKUMA
                    onValue(ref(db, 'rooms/' + roomCode + '/state'), (snap) => {
                        if (snap.exists()) {
                            let data = snap.val();
                            players = (Array.isArray(data) ? data : Object.values(data)).filter(p => p !== null && p !== undefined);
                        } else if(gameStarted) {
                            alert("Kurucu oyundan çıktı."); window.location.reload();
                        }
                    });

                } else { alert("Oda tam dolu veya oyun çoktan başladı!"); }
            } else { alert("Geçersiz Oda Kodu!"); }
        });
    } else { alert("Lütfen 4 haneli kodu girin."); }
};

document.getElementById('btnRestartRound').onclick = () => {
    if (role === 'host') {
        initPlayersSetup(maxPlayers);
        gameOver = false;
        overlay.style.display = 'none';
        if (maxPlayers > 1) set(ref(db, 'rooms/' + roomCode + '/state'), players);
    }
};

// === KARAKTER KURULUMU (800x600 MERKEZLİ) ===
function initPlayersSetup(playerCount) {
    players = [];
    players.push({ id: 1, name: '1. Oyuncu', x: arena.x, y: arena.y - 100, radius: 25, color: '#0ea5e9', emoji: '😎', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: false, isDead: false });

    if (playerCount === 1) {
        players.push({ id: 2, name: 'Kırmızı Bot', x: arena.x, y: arena.y + 100, radius: 25, color: '#ef4444', emoji: '🤖', vx: 0, vy: 0, speed: 0.22, friction: 0.95, isBot: true, isDead: false });
        players.push({ id: 3, name: 'Yeşil Bot', x: arena.x - 100, y: arena.y, radius: 25, color: '#10b981', emoji: '🤖', vx: 0, vy: 0, speed: 0.25, friction: 0.95, isBot: true, isDead: false });
        players.push({ id: 4, name: 'Sarı Bot', x: arena.x + 100, y: arena.y, radius: 25, color: '#f59e0b', emoji: '🤖', vx: 0, vy: 0, speed: 0.2, friction: 0.95, isBot: true, isDead: false });
    } else {
        if(playerCount >= 2) players.push({ id: 2, name: '2. Oyuncu', x: arena.x, y: arena.y + 100, radius: 25, color: '#ef4444', emoji: '😈', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: false, isDead: false });
        if(playerCount >= 3) players.push({ id: 3, name: '3. Oyuncu', x: arena.x - 100, y: arena.y, radius: 25, color: '#10b981', emoji: '👽', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: false, isDead: false });
        if(playerCount === 4) players.push({ id: 4, name: '4. Oyuncu', x: arena.x + 100, y: arena.y, radius: 25, color: '#f59e0b', emoji: '🥶', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: false, isDead: false });
    }
}

function resolveCollision(p1, p2) {
    let dx = p2.x - p1.x; let dy = p2.y - p1.y;
    let distance = Math.hypot(dx, dy); let minDist = p1.radius + p2.radius;
    if (distance < minDist) {
        let angle = Math.atan2(dy, dx); let force = 3.5; let overlap = minDist - distance;
        p1.x -= Math.cos(angle) * (overlap / 2); p1.y -= Math.sin(angle) * (overlap / 2);
        p2.x += Math.cos(angle) * (overlap / 2); p2.y += Math.sin(angle) * (overlap / 2);
        p1.vx -= Math.cos(angle) * force; p1.vy -= Math.sin(angle) * force;
        p2.vx += Math.cos(angle) * force; p2.vy += Math.sin(angle) * force;
    }
}

function update() {
    if (!gameStarted) return;

    let alivePlayers = players.filter(p => !p.isDead);

    if (alivePlayers.length <= 1) {
        if (!gameOver) {
            gameOver = true;
            overlay.style.display = 'flex';
            if (alivePlayers.length === 1) winnerText.innerText = `🏆 ${alivePlayers[0].name} Kazandı!`;
            else winnerText.innerText = "🤝 Berabere!";
            
            if (role === 'host') {
                document.getElementById('btnRestartRound').style.display = 'block';
                document.getElementById('waitingHostText').style.display = 'none';
            } else {
                document.getElementById('btnRestartRound').style.display = 'none';
                document.getElementById('waitingHostText').style.display = 'block';
            }
        }
    } else {
        if (gameOver) {
            gameOver = false;
            overlay.style.display = 'none';
        }
    }

    if (gameOver) return;

    let now = Date.now();

    if (role === 'host') {
        players.forEach(p => {
            if (p.isDead) return;
            if (!p.isBot) {
                if (p.id === 1) { 
                    if (keys['ArrowUp'] || keys['w']) p.vy -= p.speed;
                    if (keys['ArrowDown'] || keys['s']) p.vy += p.speed;
                    if (keys['ArrowLeft'] || keys['a']) p.vx -= p.speed;
                    if (keys['ArrowRight'] || keys['d']) p.vx += p.speed;
                    p.vx += joystickData.x * 0.8; p.vy += joystickData.y * 0.8;
                } else {
                    if (remoteInputs[p.id]) {
                        p.vx += remoteInputs[p.id].x * 0.8; p.vy += remoteInputs[p.id].y * 0.8;
                    }
                }
            } else {
                let nearest = null; let minDistance = Infinity;
                players.forEach(target => {
                    if (target !== p && !target.isDead) {
                        let dist = Math.hypot(target.x - p.x, target.y - p.y);
                        if (dist < minDistance) { minDistance = dist; nearest = target; }
                    }
                });
                if (nearest) {
                    let angle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
                    p.vx += Math.cos(angle) * p.speed; p.vy += Math.sin(angle) * p.speed;
                }
            }

            p.vx *= p.friction; p.vy *= p.friction;
            p.x += p.vx; p.y += p.vy;
            if (Math.hypot(p.x - arena.x, p.y - arena.y) > arena.radius && !p.isDead) p.isDead = true;
        });

        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                if (!players[i].isDead && !players[j].isDead) resolveCollision(players[i], players[j]);
            }
        }

        if (maxPlayers > 1 && (now - lastHostWrite > SYNC_RATE)) {
            set(ref(db, 'rooms/' + roomCode + '/state'), players);
            lastHostWrite = now;
        }

    } else if (role === 'client') {
        // YENİ EKLENEN KISIM: KLAVYE VE JOYSTICK VERİSİNİ BİRLEŞTİRİYORUZ
        let clientInputX = joystickData.x;
        let clientInputY = joystickData.y;

        if (keys['ArrowLeft'] || keys['a']) clientInputX -= 1;
        if (keys['ArrowRight'] || keys['d']) clientInputX += 1;
        if (keys['ArrowUp'] || keys['w']) clientInputY -= 1;
        if (keys['ArrowDown'] || keys['s']) clientInputY += 1;
        if (now - lastClientWrite > SYNC_RATE) {
            if (lastSentJoystick.x !== clientInputX || lastSentJoystick.y !== clientInputY) {
                set(ref(db, 'rooms/' + roomCode + '/inputs/' + myId), { x: clientInputX, y: clientInputY });
                lastSentJoystick = { x: clientInputX, y: clientInputY };
                lastClientWrite = now;
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Arena Çizimi
    ctx.beginPath(); 
    ctx.arc(arena.x, arena.y, arena.radius, 0, Math.PI * 2);
    ctx.fillStyle = arena.color; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = arena.borderColor; ctx.stroke();

    // Oyuncular Oyun Başladıysa Çizilir
    if (gameStarted) {
        players.forEach(p => {
            if (!p.isDead) {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color; ctx.fill();
                ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();

                ctx.fillStyle = '#ffffff'; ctx.font = '24px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(p.emoji, p.x, p.y);
            }
        });
    }
}

// OYUN DÖNGÜSÜ KESİNTİSİZ ÇALIŞIR
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
