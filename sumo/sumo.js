const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Sumo Arenası Özellikleri
const arena = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) * 0.4,
    color: '#334155',
    borderColor: '#38bdf8'
};

// 4 Oyuncuyu (1 Sen + 3 Bot) Tanımlayan Liste
let players = [
    { id: 1, x: arena.x, y: arena.y - 100, radius: 25, color: '#0ea5e9', emoji: '😎', vx: 0, vy: 0, speed: 0.6, friction: 0.95, isBot: false, isDead: false },
    { id: 2, x: arena.x + 150, y: arena.y + 50, radius: 25, color: '#ef4444', emoji: '🤖', vx: 0, vy: 0, speed: 0.2, friction: 0.95, isBot: true, isDead: false },
    { id: 3, x: arena.x - 150, y: arena.y + 50, radius: 25, color: '#10b981', emoji: '🤖', vx: 0, vy: 0, speed: 0.25, friction: 0.95, isBot: true, isDead: false },
    { id: 4, x: arena.x, y: arena.y + 150, radius: 25, color: '#f59e0b', emoji: '🤖', vx: 0, vy: 0, speed: 0.2, friction: 0.95, isBot: true, isDead: false }
];

// Klavye Kontrollerini Dinleme
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

// Joystick (NippleJS) Kontrolleri
let joystickData = { x: 0, y: 0 };
const manager = nipplejs.create({
    zone: document.body,
    mode: 'dynamic',
    color: '#38bdf8',
    size: 150
});

manager.on('move', (evt, data) => {
    if (data.vector) {
        joystickData.x = data.vector.x;
        joystickData.y = -data.vector.y;
    }
});
manager.on('end', () => { joystickData = { x: 0, y: 0 }; });

// Çarpışma Hesaplama Fonksiyonu (Fizik Motoru)
function resolveCollision(p1, p2) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let distance = Math.hypot(dx, dy);
    let minDist = p1.radius + p2.radius;

    // Eğer iki daire birbirine girmişse
    if (distance < minDist) {
        let angle = Math.atan2(dy, dx);
        
        // Çarpışma kuvveti (sekme hissi)
        let force = 3; 

        // İçe geçmeyi engellemek için karakterleri bir miktar geri it
        let overlap = minDist - distance;
        p1.x -= Math.cos(angle) * (overlap / 2);
        p1.y -= Math.sin(angle) * (overlap / 2);
        p2.x += Math.cos(angle) * (overlap / 2);
        p2.y += Math.sin(angle) * (overlap / 2);

        // Hızları tersine çevirerek sekme yarat
        p1.vx -= Math.cos(angle) * force;
        p1.vy -= Math.sin(angle) * force;
        p2.vx += Math.cos(angle) * force;
        p2.vy += Math.sin(angle) * force;
    }
}

// Oyun Verilerini Güncelleme
function update() {
    let mainPlayer = players[0];

    // 1. Ana Oyuncu (Sen) Hareketi
    if (!mainPlayer.isDead) {
        if (keys['ArrowUp'] || keys['w']) mainPlayer.vy -= mainPlayer.speed;
        if (keys['ArrowDown'] || keys['s']) mainPlayer.vy += mainPlayer.speed;
        if (keys['ArrowLeft'] || keys['a']) mainPlayer.vx -= mainPlayer.speed;
        if (keys['ArrowRight'] || keys['d']) mainPlayer.vx += mainPlayer.speed;

        mainPlayer.vx += joystickData.x * 0.8;
        mainPlayer.vy += joystickData.y * 0.8;
    }

    // 2. Botların (Yapay Zeka) Hareketi
    players.forEach(p => {
        if (p.isBot && !p.isDead && !mainPlayer.isDead) {
            // Botlar doğrudan ana oyuncuya doğru yönelir
            let dx = mainPlayer.x - p.x;
            let dy = mainPlayer.y - p.y;
            let angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * p.speed;
            p.vy += Math.sin(angle) * p.speed;
        }
        
        // 3. Sürtünme ve Hareket Uygulama
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.x += p.vx;
        p.y += p.vy;

        // 4. Arenadan Düşme Kontrolü
        const distFromCenter = Math.hypot(p.x - arena.x, p.y - arena.y);
        if (distFromCenter > arena.radius && !p.isDead) {
            p.isDead = true; // Arenadan düşen ölür
        }
    });

    // 5. Oyuncular Arası Çarpışmaları Kontrol Et
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            if (!players[i].isDead && !players[j].isDead) {
                resolveCollision(players[i], players[j]);
            }
        }
    }
}

// Ekrana Çizim Yapma
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Arenayı Çiz
    ctx.beginPath();
    ctx.arc(arena.x, arena.y, arena.radius, 0, Math.PI * 2);
    ctx.fillStyle = arena.color;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = arena.borderColor;
    ctx.stroke();

    // Hayatta Kalan Oyuncuları Çiz
    players.forEach(p => {
        if (!p.isDead) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // Karakter emojisini ekle
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

gameLoop();
