// === CONFIGURATION ===
const CONFIG = {
    CORE: {
        BASE_SPEED: 400,
        MAX_SPEED: 900,
        FLUSH_TIME: 1.0,
    },
    GAMEPLAY: {
        PSYCHO_LIMIT: 15,
        MAX_SANITY_ERRORS: 10,
        SCORE_PER_SEC: 10,
    },
    MEMORY: {
        MAX_PARTICLES: 100,
    }
};
// === 核心 DOM 元素 ===
const canvas = document.getElementById('gameCanvas');
const noiseCanvas = document.getElementById('static-noise');
const ctx = canvas.getContext('2d', { alpha: false });
const noiseCtx = noiseCanvas.getContext('2d');
const overlay = document.getElementById('overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const statusText = document.getElementById('status-text');
const gameAudio = document.getElementById('game-bgm');
const menuAudio = document.getElementById('menu-bgm');
gameAudio.volume = 0;
menuAudio.volume = 0.5;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
noiseCanvas.width = window.innerWidth;
noiseCanvas.height = window.innerHeight;
const PALETTE = {
    PINK: "#ff0055", CYAN: "#00ffff", YELLOW: "#fcee09",
    GRID: "rgba(255, 0, 85, 0.3)",
    WARN: "rgba(255, 200, 0, 0.4)",
    OBSTACLE_COLORS: ["#ff0055", "#00ffff", "#fcee09", "#39ff14", "#be00fe", "#ff5f1f"]
};
const HORIZON_Y = canvas.height * 0.5;
const PLAYER_HITBOX = { x: canvas.width/2 - 150, y: canvas.height - 150, w: 300, h: 150 };
// === 纯代码音效系统 ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SfxSystem = {
    playTone: (freq, type, duration) => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    shoot: () => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    },
    explosion: () => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const bufferSize = audioCtx.sampleRate * 0.5;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        noise.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start();
    },
    alert: () => {
        SfxSystem.playTone(400, 'square', 0.1);
        setTimeout(() => SfxSystem.playTone(300, 'square', 0.1), 100);
    },
    reboot: () => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const t = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(800, t);
        osc1.frequency.exponentialRampToValueAtTime(50, t + 0.5);
        gain1.gain.setValueAtTime(0.5, t);
        gain1.gain.linearRampToValueAtTime(0, t + 0.5);
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(2000, t);
        osc2.frequency.linearRampToValueAtTime(100, t + 0.1);
        gain2.gain.setValueAtTime(0.1, t);
        gain2.gain.linearRampToValueAtTime(0, t + 0.1);
        osc1.connect(gain1); gain1.connect(audioCtx.destination);
        osc2.connect(gain2); gain2.connect(audioCtx.destination);
        osc1.start(); osc1.stop(t + 0.6);
        osc2.start(); osc2.stop(t + 0.2);
    }
};
// === 资源加载 ===
const assets = {
    cityBg: new Image(),
    enemy: new Image(),
    road: new Image(),
    tree: new Image(),
    ground: new Image(),
    moon: new Image(),
    loaded: false
};
assets.cityBg.src = '/city.jpg';
assets.enemy.src = '/plain.png';
assets.road.src = '/road.png';
assets.tree.src = '/tree.png';
assets.ground.src = '/ground.png';
assets.moon.src = '/moon.png';
let loadedCount = 0;
const checkLoad = () => {
    loadedCount++;
    if(loadedCount === 6) {
        assets.loaded = true;
        statusText.innerText = "SYSTEM: READY";
        switchMusic('MENU');
    }
};
assets.cityBg.onload = checkLoad;
assets.enemy.onload = checkLoad;
assets.road.onload = checkLoad;
assets.tree.onload = checkLoad;
assets.ground.onload = checkLoad;
assets.moon.onload = checkLoad;
// === 游戏变量 ===
let gameState = "MENU";
let lastTime = 0;
let input = { tilt: 0, aimX: 0.5, aimY: 0.5, isFiring: false, hasGun: false, cdProgress: 1.0, isCharging: false, flushTrigger: false };
let speed = CONFIG.CORE.BASE_SPEED;
let worldZ = 0;
let score = 0;
let heatLevel = 1;
let sanityCount = 0;
let isCyberPsycho = false;
let psychoTimer = 0;
let rebootIntensity = 0;
let obstacles = [];
let maxtacUnits = [];
let particles = [];
let errorPopups = [];
let rebootStartTime = 0;
let decorations = [];
// === 报错弹窗类 ===
class GlitchPopup {
    constructor() {
        this.text = ["FATAL ERROR", "CORRUPTION", "0xFA3C", "SYNAPSE BREAK", "OVERHEAT"][Math.floor(Math.random()*5)];
        ctx.save();
        ctx.font = "24px VT323";
        const metrics = ctx.measureText(this.text);
        const textWidth = metrics.width;
        ctx.restore();
        this.w = textWidth + 100 + Math.random() * 40;
        this.h = 60 + Math.random() * 20;
        this.x = Math.random() * (canvas.width - this.w);
        this.y = Math.random() * (canvas.height - this.h);
        this.color = PALETTE.PINK;
        this.seed = Math.random();
    }
    draw(dt) {
        let shakeX = (Math.random() - 0.5) * 10;
        let shakeY = (Math.random() - 0.5) * 10;
        this.color = Math.random() > 0.5 ? PALETTE.PINK : (Math.random() > 0.5 ? PALETTE.CYAN : PALETTE.YELLOW);
        ctx.save();
        ctx.translate(this.x + shakeX, this.y + shakeY);
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.w, this.h);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "24px VT323";
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, this.w / 2, this.h / 2 - 8);
        ctx.font = "14px Courier";
        ctx.fillStyle = "#fff";
        ctx.fillText(`ADDR: 0x${Math.floor(Date.now()%10000)}`, this.w / 2, this.h / 2 + 12);
        if(Math.random() < 0.3) {
            ctx.beginPath();
            ctx.moveTo(0, Math.random()*this.h);
            ctx.lineTo(this.w, Math.random()*this.h);
            ctx.strokeStyle = this.color;
            ctx.stroke();
        }
        ctx.restore();
    }
}
// === 输入轮询 ===
async function fetchInput() {
    if(gameState !== "PLAYING") return;
    try {
        let res = await fetch('/api/status');
        let data = await res.json();
        input.tilt += (data.head_tilt - input.tilt) * 0.2;
        input.aimX += (data.aim_x - input.aimX) * 0.3;
        input.aimY += (data.aim_y - input.aimY) * 0.3;
        input.hasGun = data.has_gun;
        input.cdProgress = data.flush_cd_progress;
        input.isCharging = data.is_charging;
        if (data.is_firing && !input.isFiring) fireGun();
        input.isFiring = data.is_firing;
        if (data.flush_trigger) systemReboot();
    } catch(e){}
}
// === 核心控制逻辑 ===
function startGame() {
    gameState = "PLAYING";
    overlay.style.display = 'none';
    noiseCanvas.style.display = 'none';
    if(audioCtx.state === 'suspended') audioCtx.resume();
    gameAudio.playbackRate = 1.0;
    switchMusic('GAME');
    resetVariables();
    lastTime = performance.now();
    requestAnimationFrame(loop);
    if(!window.fetchInterval) window.fetchInterval = setInterval(fetchInput, 30);
}
function backToMenu() {
    gameState = "MENU";
    noiseCanvas.style.display = 'none';
    overlay.style.display = 'flex';
    switchMusic('MENU');
    resetVariables();
}
function resetVariables() {
    speed = CONFIG.CORE.BASE_SPEED;
    score = 100;
    heatLevel = 1;
    sanityCount = 0;
    isCyberPsycho = false;
    psychoTimer = 0;
    rebootIntensity = 0;
    input.tilt = 0;
    obstacles = [];
    maxtacUnits = [];
    particles = [];
    errorPopups = [];
    decorations = [];
}
function systemReboot() {
    if(gameState === "FLATLINED") return;
    sanityCount = 0;
    isCyberPsycho = false;
    psychoTimer = 0;
    errorPopups = [];
    rebootIntensity = 15.0;
    rebootStartTime = Date.now();
    SfxSystem.reboot();
    gameAudio.playbackRate = 1.0;
}
function fireGun() {
    SfxSystem.shoot();
    let gx = input.aimX * canvas.width;
    let gy = input.aimY * canvas.height;
    for(let i=0; i<5; i++) particles.push({ x: gx, y: gy, vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15, life: 1.0, color: PALETTE.YELLOW });
    maxtacUnits.forEach((unit, i) => {
        if (Math.abs(gx - unit.x) < 60 && Math.abs(gy - unit.y) < 60) {
            unit.hp -= 25; unit.isHit = true;
            if (unit.hp <= 0) {
                SfxSystem.explosion();
                for(let k=0; k<15; k++) particles.push({ x: unit.x, y: unit.y, vx: (Math.random()-0.5)*30, vy: (Math.random()-0.5)*30, life: 1.5, color: "red" });
                maxtacUnits.splice(i, 1);
                score += 100;
            }
        }
    });
}
function triggerCollision() {
    sanityCount++;
    SfxSystem.alert();
    errorPopups.push(new GlitchPopup());
    let shake = 40;
    ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
    setTimeout(()=>ctx.setTransform(1,0,0,1,0,0), 50);
    if(sanityCount >= CONFIG.GAMEPLAY.MAX_SANITY_ERRORS && !isCyberPsycho) {
        isCyberPsycho = true;
        gameAudio.playbackRate = 0.6;
    }
}
// === 事件监听 ===
document.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (gameState === "MENU" && menuAudio.paused) {
        menuAudio.play();
        menuAudio.volume = 0.5;
    }
    if (gameState === "MENU" && assets.loaded) {
        startGame();
    } else if (gameState === "FLATLINED") {
        backToMenu();
    }
});
window.addEventListener('keydown', (e) => {
    if (e.code === "Space") {
        if (gameState === "PLAYING") {
            gameState = "PAUSED";
            pauseOverlay.style.display = 'flex';
            gameAudio.pause();
        } else if (gameState === "PAUSED") {
            gameState = "PLAYING";
            pauseOverlay.style.display = 'none';
            lastTime = performance.now();
            gameAudio.play();
            requestAnimationFrame(loop);
        }
    }
});
// === 渲染与更新循环 ===
function loop(timestamp) {
    if(gameState === "PAUSED") return;
    if(gameState === "FLATLINED") {
        drawFlatlineSnow();
        requestAnimationFrame(loop);
        return;
    }
    if (score >= 500 && gameState === "PLAYING") {
        gameState = "VICTORY";
        finishGame();
        return;
    }
    if(gameState !== "PLAYING") return;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if(dt > 0.1) dt = 0.1;
    worldZ += speed * dt;
    score += CONFIG.GAMEPLAY.SCORE_PER_SEC * dt;
    if (speed < CONFIG.CORE.MAX_SPEED) speed += 20 * dt;

    if (score < 0 && !isCyberPsycho) {
        isCyberPsycho = true;
        gameAudio.playbackRate = 0.6;
    }
    obstacles = obstacles.filter(o => o.z > 0 && !o.hit);
    particles = particles.filter(p => p.life > 0);
    decorations = decorations.filter(d => d.z > 0);
    if(Math.random() < 0.03) {
        decorations.push({ x: -6, z: 3000, scale: 1.0 + Math.random()*0.5 });
        decorations.push({ x: 6, z: 3000, scale: 1.0 + Math.random()*0.5 });
    }
    if(Math.random() < 0.02) {
        let randomColorIdx = Math.floor(Math.random() * PALETTE.OBSTACLE_COLORS.length);
        let selectedColor = PALETTE.OBSTACLE_COLORS[randomColorIdx];
        obstacles.push({
            x: (Math.random()-0.5)*5,
            z: 3000,
            hit: false,
            color: selectedColor
        });
    }
    if(maxtacUnits.length < Math.floor(score/1000) + 1 && Math.random() < 0.01) {
        maxtacUnits.push({
            x: -100, y: Math.random() * HORIZON_Y,
            vx: 100 + Math.random() * 100, vy: 0,
            hp: 100, isHit: false
        });
    }
    ctx.clearRect(0,0,canvas.width, canvas.height);
    drawSynthwaveRoad(dt);
    drawDecorations(dt);
    drawHoloObstacles(dt);
    drawEnemies(dt);
    for(let p of particles) {
        p.x += p.vx; p.y += p.vy; p.life -= dt * 2;
        ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
    }
    errorPopups.forEach(p => p.draw(dt));
    // === 赛博精神病特效 ===
    if(isCyberPsycho) {
        psychoTimer += dt;
        applyCyberpsychosisEffect(ctx, canvas.width, canvas.height, 1.0 + Math.sin(Date.now()/50)*0.5);
        ctx.fillStyle = "rgba(255, 0, 0, 0.15)"; ctx.fillRect(0,0,canvas.width, canvas.height);
        ctx.fillStyle = "red"; ctx.font = "bold 60px Orbitron"; ctx.textAlign = "center";
        ctx.fillText((CONFIG.GAMEPLAY.PSYCHO_LIMIT - psychoTimer).toFixed(1), canvas.width/2, 100);
        if(Math.random() < 0.1) errorPopups.push(new GlitchPopup());
        if(psychoTimer >= CONFIG.GAMEPLAY.PSYCHO_LIMIT) {
            gameState = "FLATLINED";
            gameAudio.pause();
            SfxSystem.playTone(100, 'sawtooth', 1.0);
        }
    }
    // === 重启特效 ===
    if (rebootIntensity > 0.01) {
        let elapsed = (Date.now() - rebootStartTime) / 1000;
        let wave = Math.cos(elapsed * 20);
        let currentShift = rebootIntensity * wave;
        applyCyberpsychosisEffect(ctx, canvas.width, canvas.height, currentShift);
        rebootIntensity *= 0.95;
    }
    drawHUD();
    requestAnimationFrame(loop);
}
// === 辅助渲染函数 ===
function drawSynthwaveRoad(dt) {
    let distortion = isCyberPsycho ? Math.sin(Date.now()/100)*50 : 0;
    ctx.save();
    if (assets.loaded) {
        const img = assets.cityBg;
        const aspectWidth = img.width * (HORIZON_Y / img.height);
        let bgX = (worldZ * 0.2) % aspectWidth;
        let currentX = -bgX;
        while (currentX < canvas.width) {
            ctx.drawImage(img, currentX, 0, aspectWidth, HORIZON_Y);
            currentX += aspectWidth;
        }
    } else {
        ctx.fillStyle = "#100020"; ctx.fillRect(0, 0, canvas.width, HORIZON_Y);
    }
    ctx.restore();
    if (assets.loaded && assets.road.complete && assets.ground.complete) {
        const imgRoad = assets.road;
        const imgGround = assets.ground;
        const stripSize = 2;
        for (let y = canvas.height; y > HORIZON_Y; y -= stripSize) {
            let p = (y - HORIZON_Y) / (canvas.height - HORIZON_Y);
            if (p <= 0) continue;
            let tiltOffset = input.tilt * 800 * p;
            let distortion = isCyberPsycho ? Math.sin(Date.now()/100)*50 : 0;
            let groundTexY = (worldZ * 20 + (1000 / p)) % imgGround.height;
            if (groundTexY < 0) groundTexY += imgGround.height;
            let roadTexY = (worldZ * 50 + (1000 / p)) % imgRoad.height;
            if (roadTexY < 0) roadTexY += imgRoad.height;
            let groundDrawW = canvas.width * (1.5 + 5.0 * p);
            let groundDrawX = (canvas.width - groundDrawW) / 2 - tiltOffset + distortion;
            ctx.drawImage(
                imgGround,
                0, groundTexY, imgGround.width, 1,
                groundDrawX, y, groundDrawW, stripSize
            );
            let roadDrawW = canvas.width * (0.1 + 1.3 * p);
            let roadDrawX = (canvas.width - roadDrawW) / 2 - tiltOffset + distortion;
            ctx.drawImage(
                imgRoad,
                0, roadTexY, imgRoad.width, 1,
                roadDrawX, y, roadDrawW, stripSize
            );
        }
        let fade = ctx.createLinearGradient(0, HORIZON_Y, 0, canvas.height);
        fade.addColorStop(0, "rgba(0,0,0, 1.0)");
        fade.addColorStop(0.3, "rgba(0,0,0, 0.5)");
        fade.addColorStop(1, "rgba(0,0,0, 0.0)");
        ctx.fillStyle = fade;
        ctx.fillRect(0, HORIZON_Y, canvas.width, canvas.height - HORIZON_Y);
    } else {
        let grad = ctx.createLinearGradient(0, HORIZON_Y, 0, canvas.height);
        grad.addColorStop(0, "#0a0010"); grad.addColorStop(1, "#2a0040");
        ctx.fillStyle = grad; ctx.fillRect(0, HORIZON_Y, canvas.width, canvas.height - HORIZON_Y);
    }
}
function drawHoloObstacles(dt) {
    obstacles.sort((a, b) => b.z - a.z);
    obstacles.forEach(obs => {
        obs.z -= speed * dt;
        let scale = 800 / (obs.z + 50);
        let screenY = HORIZON_Y + (20 * scale);
        let p = (screenY - HORIZON_Y) / (canvas.height - HORIZON_Y);
        p = Math.max(0, Math.min(1, p));
        let currentRoadW = canvas.width * (0.1 + 1.3 * p);
        let tiltOffset = input.tilt * 800 * p;
        let distortion = isCyberPsycho ? Math.sin(Date.now()/100)*50 : 0;
        let screenX = (canvas.width / 2) - tiltOffset + distortion + (obs.x / 3.5) * (currentRoadW / 2);
        let size = 40 * scale;
        obs.screenRect = { x: screenX - size/2, y: screenY - size, w: size, h: size };
        if (obs.z < 200 && obs.z > 0 && !obs.hit) {
             if (Math.abs(screenX - canvas.width/2) < size * 0.4) {
                obs.hit = true;
                score -= 30;
                triggerCollision();
            }
        }
        if (obs.z > 0) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = obs.color;
            ctx.shadowBlur = 15;
            ctx.shadowColor = obs.color;
            ctx.fillRect(screenX - size/2, screenY - size, size, size);
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.textAlign="center";
            ctx.textBaseline = "middle";
            ctx.font=`bold ${45*scale}px Orbitron`;
            ctx.fillText("!", screenX, screenY - size/2);
            ctx.restore();
        }
    });
}
function drawEnemies(dt) {
    maxtacUnits.forEach(unit => {
        unit.x += unit.vx * dt;
        unit.y += Math.sin(Date.now() / 200) * 2 + unit.vy * dt;
        if (Math.random() < 0.05) {
            unit.vy = (Math.random() - 0.5) * 200;
            unit.vx += (Math.random() - 0.5) * 50;
        }
        if (unit.y < 50) { unit.y = 50; unit.vy = Math.abs(unit.vy); }
        if (unit.y > HORIZON_Y - 50) { unit.y = HORIZON_Y - 50; unit.vy = -Math.abs(unit.vy); }
        if (unit.x > canvas.width + 100) unit.x = -100;
        if (unit.x < -100) unit.x = canvas.width + 100;
        ctx.save();
        ctx.shadowBlur = 20; ctx.shadowColor = "red";
        if(unit.isHit) ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(assets.enemy, unit.x - 50, unit.y - 50, 100, 100);
        ctx.restore();
        unit.isHit = false;
    });
}
function drawLinearGyro() {
    const barW = 300;
    const barH = 20;
    const x = (canvas.width - barW) / 2;
    const y = canvas.height - 50;
    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barW, barH);
    ctx.beginPath();
    ctx.moveTo(x + barW/2, y - 10);
    ctx.lineTo(x + barW/2, y + barH + 10);
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    for(let i=1; i<5; i++) {
        let step = barW/10 * i;
        ctx.fillRect(x + barW/2 + step, y + 5, 2, 10);
        ctx.fillRect(x + barW/2 - step, y + 5, 2, 10);
    }
    let indicatorX = (canvas.width/2) + (input.tilt * (barW/2));
    indicatorX = Math.max(x, Math.min(x + barW, indicatorX));
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.shadowBlur = 10; ctx.shadowColor = PALETTE.YELLOW;
    ctx.fillRect(indicatorX - 5, y - 5, 10, barH + 10);
    ctx.font = "16px Orbitron";
    ctx.fillStyle = PALETTE.CYAN;
    ctx.textAlign = "right"; ctx.fillText("L", x - 10, y + 16);
    ctx.textAlign = "left";  ctx.fillText("R", x + barW + 10, y + 16);
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.textAlign = "center"; ctx.font = "12px Orbitron";
    ctx.fillText("NEURAL STABILIZER", canvas.width/2, y - 15);
    ctx.restore();
}
function drawHUD() {
    ctx.fillStyle = "#fff"; ctx.font = "30px Orbitron"; ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${Math.floor(score)}`, 20, 50);
    if(input.hasGun) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(input.aimX*canvas.width, input.aimY*canvas.height, 20, 0, Math.PI*2); ctx.stroke();
    }
    if(input.cdProgress < 1.0 || input.isCharging) {
        let cx = 60, cy = canvas.height - 60;
        ctx.strokeStyle = PALETTE.YELLOW; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cx, cy, 30, -Math.PI/2, -Math.PI/2+input.cdProgress*Math.PI*2); ctx.stroke();
        ctx.fillStyle="#fff"; ctx.font="12px Arial"; ctx.fillText(input.isCharging?"CHARGING":"CD", cx-25, cy+40);
    }
    drawLinearGyro();
}

function drawFlatlineSnow() {
    const w = noiseCanvas.width, h = noiseCanvas.height;
    noiseCanvas.style.display = 'block';
    const idata = noiseCtx.createImageData(w, h);
    const buffer = new Uint32Array(idata.data.buffer);
    for(let i=0; i<buffer.length; i++) {
        let val = Math.random() < 0.5 ? 0 : 255;
        buffer[i] = (255 << 24) | (val << 16) | (val << 8) | val;
    }
    noiseCtx.putImageData(idata, 0, 0);
    noiseCtx.fillStyle = "red"; noiseCtx.font = "bold 80px Orbitron"; noiseCtx.textAlign = "center";
    noiseCtx.fillText("SIGNAL LOST", w/2, h/2);
    noiseCtx.font = "30px VT323"; noiseCtx.fillStyle = "#fff";
    noiseCtx.fillText("SUBJECT FLATLINED", w/2, h/2 + 60);
    noiseCtx.font = "20px Orbitron"; noiseCtx.fillStyle = PALETTE.YELLOW;
    noiseCtx.fillText("[ CLICK TO RETURN TO MENU ]", w/2, h/2 + 100);
}
function applyCyberpsychosisEffect(ctx, width, height, intensity) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);
    const offset = Math.floor(intensity * 10);
    for (let y = 0; y < height; y++) {
        let jitterX = 0;
        if (Math.random() < 0.05) {
            jitterX = Math.floor((Math.random() - 0.5) * intensity * 50);
        }
        const rY = Math.min(height - 1, Math.max(0, y + offset));
        const bY = Math.min(height - 1, Math.max(0, y - offset));
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            const rX = Math.min(width - 1, Math.max(0, x + offset - jitterX));
            const bX = Math.min(width - 1, Math.max(0, x - offset - jitterX));

            data[index] = copy[(rY * width + rX) * 4];
            data[index + 2] = copy[(bY * width + bX) * 4 + 2];
        }
    }
    ctx.putImageData(imageData, 0, 0);
}
function drawDecorations(dt) {
    decorations.sort((a, b) => b.z - a.z);
    decorations.forEach(obj => {
        obj.z -= speed * dt;
        let scale = 800 / (obj.z + 50);
        let screenY = HORIZON_Y + (80 * scale);
        let p = (screenY - HORIZON_Y) / (canvas.height - HORIZON_Y);
        p = Math.max(0.01, Math.min(1.2, p));
        let currentRoadW = canvas.width * (0.1 + 1.3 * p);
        let tiltOffset = input.tilt * 800 * p;
        let distortion = isCyberPsycho ? Math.sin(Date.now()/100)*50 : 0;
        let screenX = (canvas.width / 2) - tiltOffset + distortion + (obj.x / 3.5) * (currentRoadW / 2);
        if (obj.z > 0 && obj.z < 2500 && assets.loaded) {
            let treeW = 250 * scale * obj.scale;
            let treeH = 450 * scale * obj.scale;
            ctx.save();
            let fadeIn = 1.0 - Math.max(0, (obj.z - 1500) / 1000);
            ctx.globalAlpha = fadeIn;
            ctx.drawImage(assets.tree, screenX - treeW/2, screenY - treeH, treeW, treeH);
            ctx.restore();
        }
    });
}
// === 胜利结算 ===
function finishGame() {
    switchMusic('MENU');
    let opacity = 0.0;
    const winLoop = () => {
        if (gameState !== "VICTORY") return;
        if (opacity < 1.0) opacity += 0.01;
        let currentAlpha = Math.min(opacity, 1.0);
        drawSynthwaveRoad(0);
        ctx.fillStyle = `rgba(0, 0, 0, ${currentAlpha * 0.85})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = currentAlpha;
        if (assets.moon.complete) {
            const moonSize = 400;
            const x = (canvas.width - moonSize) / 2;
            const y = (canvas.height - moonSize) / 2;
            const floatOffset = (1.0 - currentAlpha) * 50;
            ctx.drawImage(assets.moon, x, y + floatOffset, moonSize, moonSize);
        }
        ctx.textAlign = "center";
        ctx.font = "bold 60px Orbitron";
        ctx.fillStyle = "#fcee09";
        ctx.fillText("MISSION COMPLETE", canvas.width/2, canvas.height/2 + 250);
        ctx.font = "20px Orbitron";
        ctx.fillStyle = "#fff";
        ctx.fillText(`FINAL SCORE: ${Math.floor(score)}`, canvas.width/2, canvas.height/2 + 300);
        if (opacity >= 1.0) {
            ctx.font = "16px Orbitron";
            ctx.fillStyle = "#00ffff";
            if (Math.floor(Date.now() / 500) % 2 === 0) {
                ctx.fillText("[ CLICK TO RETURN ]", canvas.width/2, canvas.height/2 + 350);
            }
        }
        ctx.restore();
        requestAnimationFrame(winLoop);
    };
    const restartHandler = () => {
        if (gameState === "VICTORY" && opacity > 0.8) {
            document.removeEventListener('click', restartHandler);
            backToMenu();
        }
    };
    document.addEventListener('click', restartHandler);
    winLoop();
}
// === 音频交叉淡变系统 ===
let fadeInterval = null;
function switchMusic(targetState) {
    const fadeInTrack = targetState === 'MENU' ? menuAudio : gameAudio;
    const fadeOutTrack = targetState === 'MENU' ? gameAudio : menuAudio;
    let playPromise = fadeInTrack.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.log("Audio play blocked until interaction");
        });
    }
    if (fadeInterval) clearInterval(fadeInterval);
    fadeInterval = setInterval(() => {
        let completed = true;
        const step = 0.05;
        if (fadeInTrack.volume < 0.5) {
            fadeInTrack.volume = Math.min(0.5, fadeInTrack.volume + step);
            completed = false;
        }
        if (fadeOutTrack.volume > 0) {
            fadeOutTrack.volume = Math.max(0, fadeOutTrack.volume - step);
            completed = false;
        }
        if (completed) {
            clearInterval(fadeInterval);
            fadeOutTrack.pause();
            fadeOutTrack.currentTime = 0;
            fadeInTrack.loop = true;
        }
    }, 50);
}