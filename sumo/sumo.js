// Firebase SDK'larını içe aktarıyoruz
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

// Senin Firebase Konfigürasyonun
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

// Firebase'i Başlat
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Oyun ve Ağ Değişkenleri
let role = null; // 'host' veya 'client'
let roomCode = "";
let p2RemoteInput = { x: 0, y: 0 }; // 2. Oyuncunun (Client) telefondan gelen joystick verisi

// HTML Elemanları
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const mpMenu = document.getElementById('mpMenu');
const roomInfoDisplay = document.getElementById('roomInfoDisplay');
const overlay = document.getElementById('gameOverlay');
const winnerText = document.getElementById('winnerText');

// Arena
const arena = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) * 0.4,
    color: '#334155',
    borderColor: '#38bdf8'
};

// Oyuncular (Host hesaplar, Client sadece kopyalar)
let players = [
    { id: 1, name: '1. Oyuncu (Host)', x: arena.x, y: arena.y - 100, radius: 25, color: '#0ea5e9', emoji: '😎', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: false, isDead: false },
    { id: 2, name: '2. Oyuncu (Client)', x: arena.x, y: arena.y + 100, radius: 25, color: '#ef4444', emoji: '😈', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: true, isDead: false }, // Birisi katılana kadar kırmızı karakter bot olarak davranır
    { id: 3, name: 'Yeşil Bot', x: arena.x - 150, y: arena.y, radius: 25, color: '#10b981', emoji: '🤖', vx: 0, vy: 0, speed: 0.25, friction: 0.95, isBot: true, isDead: false },
    { id: 4, name: 'Sarı Bot', x: arena.x + 150, y: arena.y, radius: 25, color: '#f59e0b', emoji: '🤖', vx: 0, vy: 0, speed: 0.2, friction: 0.95, isBot: true, isDead: false }
];

let gameOver = false;

// Kontroller
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

let joystickData = { x: 0, y: 0 };
const manager = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'dynamic',
    color: '#38bdf8',
    size: 150
});
manager.on('move', (evt, data) => {
    if (data.vector) { joystickData = { x: data.vector.x, y: -data.vector.y }; }
});
manager.on('end', () => { joystickData = { x: 0, y: 0 }; });

// === MULTIPLAYER BAĞLANTI MANTIĞI ===

// 1. Oda Kurma (Host)
document.getElementById('btnHost').onclick = () => {
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    role = 'host';
    mpMenu.style.display = 'none';
    roomInfoDisplay.innerText = "Oda Kodu: " + roomCode;
    roomInfoDisplay.style.display = 'block';

    const roomRef = ref(db, 'rooms/' + roomCode);
    
    // Odayı Veritabanında oluştur ve tarayıcı kapanırsa odayı sil
    set(roomRef, { state: players, p2Input: { x: 0, y: 0 } });
    onDisconnect(roomRef).remove();

    // 2. Oyuncunun (Client) joystick verilerini dinle
    onValue(ref(db, 'rooms/' + roomCode + '/p2Input'), (snapshot) => {
        if (snapshot.exists()) {
            p2RemoteInput = snapshot.val();
            players[1].isBot = false; // Birisi bağlandığında Kırmızı karakter bot olmaktan çıkar
        }
    });

    gameLoop();
};

// 2. Odaya Katılma (Client)
document.getElementById('btnJoin').onclick = () => {
    const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if (code.length === 4) {
        roomCode = code;
        role = 'client';
        mpMenu.style.display = 'none';
        roomInfoDisplay.innerText = "Bağlanıldı: " + roomCode;
        roomInfoDisplay.style.display = 'block';

        // Host'un hesapladığı anlık konum verilerini dinle (Sadece ekrana çizeceğiz)
        onValue(ref(db, 'rooms/' + roomCode + '/state'), (snapshot) => {
            if (snapshot.exists()) {
                players = snapshot.val();
            } else {
                alert("Oyun bitti veya oda kapatıldı.");
                window.location.reload();
            }
        });

        gameLoop();
    } else {
        alert("Lütfen 4 haneli oda kodunu girin.");
    }
};

// Çarpışma Fiziği (Sadece Host çalıştırır)
function resolveCollision(p1, p2) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let distance = Math.hypot(dx, dy);
    let minDist = p1.radius + p2.radius;

    if (distance < minDist) {
        let angle = Math.atan2(dy, dx);
        let force = 3.5; 
        let overlap = minDist - distance;
        
        p1.x -= Math.cos(angle) * (overlap / 2);
        p1.y -= Math.sin(angle) * (overlap / 2);
        p2.x += Math.cos(angle) * (overlap / 2);
        p2.y += Math.sin(angle) * (overlap / 2);

        p1.vx -= Math.cos(angle) * force;
        p1.vy -= Math.sin(angle) * force;
        p2.vx += Math.cos(angle) * force;
        p2.vy += Math.sin(angle) * force;
    }
}

function getNearestTarget(bot) {
    let nearest = null;
    let minDistance = Infinity;
    players.forEach(p => {
        if (p !== bot && !p.isDead) {
            let dist = Math.hypot(p.x - bot.x, p.y - bot.y);
            if (dist < minDistance) { minDistance = dist; nearest = p; }
        }
    });
    return nearest;
}

// === OYUN DÖNGÜSÜ ===
function update() {
    if (gameOver) return;

    if (role === 'host') {
        // --- 1. Oyuncu (Host/Sen) Hareketi ---
        let p1 = players[0];
        if (!p1.isDead) {
            if (keys['ArrowUp'] || keys['w']) p1.vy -= p1.speed;
            if (keys['ArrowDown'] || keys['s']) p1.vy += p1.speed;
            if (keys['ArrowLeft'] || keys['a']) p1.vx -= p1.speed;
            if (keys['ArrowRight'] || keys['d']) p1.vx += p1.speed;
            p1.vx += joystickData.x * 0.8;
            p1.vy += joystickData.y * 0.8;
        }

        // --- 2. Oyuncu (Client/Oğlun) Hareketi ---
        // Eğer bağlanmışsa, telefondan gelen veriyi kırmızı karaktere uygula
        let p2 = players[1];
        if (!p2.isBot && !p2.isDead) {
            p2.vx += p2RemoteInput.x * 0.8;
            p2.vy += p2RemoteInput.y * 0.8;
        }

        // --- Bot ve Ortak Hareketler ---
        players.forEach(p => {
            if (p.isBot && !p.isDead) {
                let target = getNearestTarget(p);
                if (target) {
                    let angle = Math.atan2(target.y - p.y, target.x - p.x);
                    p.vx += Math.cos(angle) * p.speed;
                    p.vy += Math.sin(angle) * p.speed;
                }
            }

            p.vx *= p.friction;
            p.vy *= p.friction;
            p.x += p.vx;
            p.y += p.vy;

            // Arenadan düşme
            if (Math.hypot(p.x - arena.x, p.y - arena.y) > arena.radius && !p.isDead) {
                p.isDead = true;
            }
        });

        // Çarpışmalar
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                if (!players[i].isDead && !players[j].isDead) {
                    resolveCollision(players[i], players[j]);
                }
            }
        }

        // Host yeni konumları Firebase'e yazar (60fps)
        set(ref(db, 'rooms/' + roomCode + '/state'), players);
        
        // Oyun Bitti Kontrolü
        let alivePlayers = players.filter(p => !p.isDead);
        if (alivePlayers.length <= 1) {
            gameOver = true;
            overlay.style.display = 'flex';
            if (alivePlayers.length === 1) {
                winnerText.innerText = `🏆 ${alivePlayers[0].name} Kazandı!`;
            } else {
                winnerText.innerText = "🤝 Berabere!";
            }
        }

    } else if (role === 'client') {
        // Client (Telefondan katılan) sadece kendi joystick hareketini Firebase'e gönderir.
        // Fizik hesaplamaz, ekrana çizmeyi onValue() ile yapar.
        set(ref(db, 'rooms/' + roomCode + '/p2Input'), joystickData);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(arena.x, arena.y, arena.radius, 0, Math.PI * 2);
    ctx.fillStyle = arena.color;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = arena.borderColor;
    ctx.stroke();

    players.forEach(p => {
        if (!p.isDead) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.emoji, p.x, p.y);
        }
    });
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
