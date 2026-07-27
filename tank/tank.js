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

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

let role = null;
let roomCode = "";
let myId = 1;
let gameStarted = false;
let gameOver = false;

let tanks = {};
let bullets = [];
let remoteInputs = { 2: { x: 0, y: 0, fire: false } };

let lastHostWrite = 0;
let lastClientWrite = 0;
const SYNC_RATE = 40;

// GİRDİ YÖNETİMİ
const keys = {};
let isShooting = false;
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.code === 'Space') isShooting = true;
});
window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    if (e.code === 'Space') isShooting = false;
});

document.getElementById('fireButton').addEventListener('touchstart', (e) => { e.preventDefault(); isShooting = true; });
document.getElementById('fireButton').addEventListener('touchend', (e) => { e.preventDefault(); isShooting = false; });
document.getElementById('fireButton').addEventListener('mousedown', () => isShooting = true);
document.getElementById('fireButton').addEventListener('mouseup', () => isShooting = false);

let joystickData = { x: 0, y: 0 };
const manager = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'dynamic', color: '#38bdf8', size: 120
});

manager.on('move', (evt, data) => {
    if (data && data.vector) {
        if (data.distance < 10) { joystickData = { x: 0, y: 0 }; return; }
        let angle = data.angle.radian;
        joystickData = { x: Math.cos(angle), y: -Math.sin(angle) };
    }
});
manager.on('end', () => { joystickData = { x: 0, y: 0 }; });

// ODA KURMA & KATILMA
document.getElementById('btnHostInit').onclick = () => {
    role = 'host'; myId = 1;
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    document.getElementById('mpMenu').style.display = 'none';
    document.getElementById('waitingScreen').style.display = 'flex';
    document.getElementById('waitingCode').innerText = "KOD: " + roomCode;

    const roomRef = ref(db, 'rooms_tank/' + roomCode);
    set(roomRef, { info: { joined: 1, ready: false }, inputs: { 2: { x: 0, y: 0, fire: false } } });
    onDisconnect(roomRef).remove();

    onValue(ref(db, 'rooms_tank/' + roomCode + '/info/joined'), (snap) => {
        if (snap.val() === 2 && !gameStarted) {
            set(ref(db, 'rooms_tank/' + roomCode + '/info/ready'), true);
            document.getElementById('waitingScreen').style.display = 'none';
            document.getElementById('roomInfoDisplay').innerText = "Oda: " + roomCode;
            document.getElementById('roomInfoDisplay').style.display = 'block';
            initTanks();
            gameStarted = true;
        }
    });

    onValue(ref(db, 'rooms_tank/' + roomCode + '/inputs/2'), (snap) => {
        if (snap.exists()) remoteInputs[2] = snap.val();
    });
};

document.getElementById('btnJoin').onclick = () => {
    const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if (code.length === 4) {
        get(ref(db, 'rooms_tank/' + code + '/info')).then((snap) => {
            if (snap.exists() && snap.val().joined === 1) {
                role = 'client'; myId = 2; roomCode = code;
                set(ref(db, 'rooms_tank/' + roomCode + '/info/joined'), 2);
                
                document.getElementById('mpMenu').style.display = 'none';
                document.getElementById('roomInfoDisplay').innerText = "Oda: " + roomCode;
                document.getElementById('roomInfoDisplay').style.display = 'block';

                onValue(ref(db, 'rooms_tank/' + roomCode + '/state'), (stateSnap) => {
                    if (stateSnap.exists()) {
                        let data = stateSnap.val();
                        tanks = data.tanks || {};
                        bullets = data.bullets || [];
                        gameStarted = true;
                    }
                });
            } else { alert("Oda bulunamadı veya dolu!"); }
        });
    }
};

function initTanks() {
    tanks = {
        1: { id: 1, x: 100, y: 300, angle: 0, color: '#38bdf8', hp: 3, lastShot: 0 },
        2: { id: 2, x: 700, y: 300, angle: Math.PI, color: '#ef4444', hp: 3, lastShot: 0 }
    };
    bullets = [];
}

function shootBullet(tank) {
    let now = Date.now();
    if (now - tank.lastShot > 400) { // Ateş etme bekleme süresi (400ms)
        bullets.push({
            x: tank.x + Math.cos(tank.angle) * 25,
            y: tank.y + Math.sin(tank.angle) * 25,
            vx: Math.cos(tank.angle) * 6,
            vy: Math.sin(tank.angle) * 6,
            ownerId: tank.id
        });
        tank.lastShot = now;
    }
}

function update() {
    if (!gameStarted || gameOver) return;
    let now = Date.now();

    if (role === 'host') {
        // TANK 1 (HOST) KONTROLÜ
        let inputX = joystickData.x;
        let inputY = joystickData.y;
        if (keys['a'] || keys['ArrowLeft']) inputX -= 1;
        if (keys['d'] || keys['ArrowRight']) inputX += 1;
        if (keys['w'] || keys['ArrowUp']) inputY -= 1;
        if (keys['s'] || keys['ArrowDown']) inputY += 1;

        if (inputX !== 0 || inputY !== 0) {
            tanks[1].angle = Math.atan2(inputY, inputX);
            tanks[1].x += Math.cos(tanks[1].angle) * 2.5;
            tanks[1].y += Math.sin(tanks[1].angle) * 2.5;
        }
        if (isShooting) shootBullet(tanks[1]);

        // TANK 2 (CLIENT) KONTROLÜ
        if (remoteInputs[2]) {
            let rX = remoteInputs[2].x;
            let rY = remoteInputs[2].y;
            if (rX !== 0 || rY !== 0) {
                tanks[2].angle = Math.atan2(rY, rX);
                tanks[2].x += Math.cos(tanks[2].angle) * 2.5;
                tanks[2].y += Math.sin(tanks[2].angle) * 2.5;
            }
            if (remoteInputs[2].fire) shootBullet(tanks[2]);
        }

        // SINIR KONTROLLERİ
        [1, 2].forEach(id => {
            tanks[id].x = Math.max(20, Math.min(GAME_WIDTH - 20, tanks[id].x));
            tanks[id].y = Math.max(20, Math.min(GAME_HEIGHT - 20, tanks[id].y));
        });

        // MERMİ FİZİĞİ & ÇARPIŞMALAR
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.x += b.vx; b.y += b.vy;

            // Ekran dışı mermileri sil
            if (b.x < 0 || b.x > GAME_WIDTH || b.y < 0 || b.y > GAME_HEIGHT) {
                bullets.splice(i, 1);
                continue;
            }

            // Tanklara vurma kontrolü
            [1, 2].forEach(targetId => {
                if (b.ownerId !== targetId) {
                    let dist = Math.hypot(b.x - tanks[targetId].x, b.y - tanks[targetId].y);
                    if (dist < 22) { // Vurulma gerçekleşti
                        tanks[targetId].hp -= 1;
                        bullets.splice(i, 1);
                        if (tanks[targetId].hp <= 0) {
                            gameOver = true;
                            document.getElementById('winnerText').innerText = `🏆 ${b.ownerId}. Oyuncu Kazandı!`;
                            document.getElementById('gameOverlay').style.display = 'flex';
                        }
                    }
                }
            });
        }

        // PAKET GÖNDERİMİ
        if (now - lastHostWrite > SYNC_RATE) {
            set(ref(db, 'rooms_tank/' + roomCode + '/state'), { tanks, bullets });
            lastHostWrite = now;
        }

    } else if (role === 'client') {
        let inputX = joystickData.x;
        let inputY = joystickData.y;
        if (keys['a'] || keys['ArrowLeft']) inputX -= 1;
        if (keys['d'] || keys['ArrowRight']) inputX += 1;
        if (keys['w'] || keys['ArrowUp']) inputY -= 1;
        if (keys['s'] || keys['ArrowDown']) inputY += 1;

        if (now - lastClientWrite > SYNC_RATE) {
            set(ref(db, 'rooms_tank/' + roomCode + '/inputs/2'), {
                x: Math.round(inputX * 100) / 100,
                y: Math.round(inputY * 100) / 100,
                fire: isShooting
            });
            lastClientWrite = now;
        }
    }
}

function drawTank(t) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);

    // Tank Gövdesi
    ctx.fillStyle = t.color;
    ctx.fillRect(-18, -14, 36, 28);

    // Paletler
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-20, -17, 40, 6);
    ctx.fillRect(-20, 11, 40, 6);

    // Namlu
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, -3, 24, 6);

    // Kubbe
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();

    // Can Barı
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(t.x - 20, t.y - 28, 40, 5);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(t.x - 20, t.y - 28, (40 * t.hp) / 3, 5);
}

function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    if (gameStarted) {
        Object.values(tanks).forEach(t => drawTank(t));

        // Mermiler
        ctx.fillStyle = '#f59e0b';
        bullets.forEach(b => {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
