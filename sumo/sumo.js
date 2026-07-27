const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Ekran boyutunu ayarla
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Sumo Arenası Özellikleri
const arena = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) * 0.4, // Ekrana göre dinamik boyut
    color: '#334155',
    borderColor: '#38bdf8'
};

// Oyuncu Özellikleri
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 25,
    color: '#0ea5e9',
    vx: 0, // X eksenindeki hızı
    vy: 0, // Y eksenindeki hızı
    speed: 0.6, // İvmelenme hızı
    friction: 0.95 // Sürtünme (1'e yaklaştıkça daha çok kayar)
};

// Klavye Kontrollerini Dinleme
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

// Oyun Verilerini Güncelleme
function update() {
    // Yön tuşları veya WASD ile hızlanma
    if (keys['ArrowUp'] || keys['w']) player.vy -= player.speed;
    if (keys['ArrowDown'] || keys['s']) player.vy += player.speed;
    if (keys['ArrowLeft'] || keys['a']) player.vx -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.vx += player.speed;

    // Sürtünme kuvvetini uygula (Hızın zamanla yavaşlaması için)
    player.vx *= player.friction;
    player.vy *= player.friction;

    // Konumu hıza göre güncelle
    player.x += player.vx;
    player.y += player.vy;
}

// Ekrana Çizim Yapma
function draw() {
    // Her karede ekranı temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Arenayı Çiz
    ctx.beginPath();
    ctx.arc(arena.x, arena.y, arena.radius, 0, Math.PI * 2);
    ctx.fillStyle = arena.color;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = arena.borderColor;
    ctx.stroke();

    // 2. Oyuncuyu Çiz (Dış Görsel Yerine Şekil ve Metin/Emoji)
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Oyuncu üzerine emoji ekle
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('😎', player.x, player.y);
}

// Sürekli Çalışan Oyun Döngüsü
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop); // Monitör yenileme hızına (fps) göre döngüyü çağırır
}

// Oyunu başlat
gameLoop();

