// CONFIGURATION
const GRID_SIZE = 10;
const HEX_SIZE = 32;
const HEX_WIDTH = HEX_SIZE * 2;
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
const CANVAS_WIDTH = 650;
const CANVAS_HEIGHT = 580;

// TERRAIN DEFINITIONS with defense bonuses (20% style)
const TERRAIN = {
    TUNDRA: { type: 'tundra', color: '#e8f4f8', label: 'Tundra', defenseBonus: 4 },
    PLAINS: { type: 'plains', color: '#90c956', label: 'Plains', defenseBonus: 0 },
    RAINFOREST: { type: 'rainforest', color: '#2d5a27', label: 'Rainforest', defenseBonus: 6, slowsKnight: true },
    WATER: { type: 'water', color: '#2980b9', label: 'Water', defenseBonus: 0 },
    MOUNTAIN: { type: 'mountain', color: '#6b7c85', label: 'Mountain', defenseBonus: 8 }
};

// UNIT TYPES - Warriors stronger, Archers ranged only
const UNIT_TYPES = {
    WARRIOR: { name: 'Warrior', icon: '⚔', maxHp: 70, attack: 18, defense: 14, moves: 1, range: 1, trainTime: 3 },
    ARCHER: { name: 'Archer', icon: '🏹', maxHp: 40, attack: 14, defense: 6, moves: 1, range: 2, trainTime: 3, rangedOnly: true },
    KNIGHT: { name: 'Knight', icon: '🐴', maxHp: 50, attack: 12, defense: 10, moves: 2, range: 1, trainTime: 3 }
};

// GAME STATE
let map = [];
let units = [];
let cities = [];
let floatingTexts = [];
let particles = [];
let turn = 1;
let isPlayerTurn = true;
let selectedUnit = null;
let gameOver = false;
let explored = [];
let currentlyVisible = [];
let trainingQueue = [];
let aiTrainingQueue = [];

// DOM ELEMENTS
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const turnDisplay = document.getElementById('turn-display');
const playerDisplay = document.getElementById('player-display');
const tileInfoDisplay = document.getElementById('tile-info');
const endTurnBtn = document.getElementById('end-turn-btn');
const restartBtn = document.getElementById('restart-btn');

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
canvas.style.width = CANVAS_WIDTH + 'px';
canvas.style.height = CANVAS_HEIGHT + 'px';

// --- HEX MATH ---

function hexToPixel(q, r) {
    const x = HEX_SIZE * (3/2 * q) + 50;
    const y = HEX_SIZE * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r) + 50;
    return { x, y };
}

function pixelToHex(px, py) {
    const x = px - 50;
    const y = py - 50;
    const q = (2/3 * x) / HEX_SIZE;
    const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
    return hexRound(q, r);
}

function hexRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    
    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);
    
    if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
    } else if (rDiff > sDiff) {
        rr = -rq - rs;
    }
    
    return { q: rq, r: rr };
}

function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

function getHexNeighbors(q, r) {
    const directions = [
        {q: 1, r: 0}, {q: 1, r: -1}, {q: 0, r: -1},
        {q: -1, r: 0}, {q: -1, r: 1}, {q: 0, r: 1}
    ];
    return directions.map(d => ({ q: q + d.q, r: r + d.r }));
}

function isValidHex(q, r) {
    return map[`${q},${r}`] !== undefined;
}

// --- INITIALIZATION ---

function initGame() {
    map = {};
    units = [];
    cities = [];
    floatingTexts = [];
    particles = [];
    turn = 1;
    isPlayerTurn = true;
    gameOver = false;
    selectedUnit = null;
    trainingQueue = [];
    aiTrainingQueue = [];
    explored = {};
    currentlyVisible = {};
    
    generateHexMap();
    spawnEntities();
    updateVision();
    updateUI();
    setupUnitButtons();
    
    requestAnimationFrame(gameLoop);
    
    endTurnBtn.disabled = false;
    endTurnBtn.textContent = "End Turn";
    restartBtn.style.display = 'none';
}

function generateHexMap() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let q = 0; q < GRID_SIZE; q++) {
            const rand = Math.random();
            let terrain;
            
            if (rand < 0.08) terrain = TERRAIN.WATER;
            else if (rand < 0.45) terrain = TERRAIN.PLAINS;
            else if (rand < 0.7) terrain = TERRAIN.RAINFOREST;
            else if (rand < 0.92) terrain = TERRAIN.TUNDRA;
            else terrain = TERRAIN.MOUNTAIN;

            map[`${q},${r}`] = { q, r, terrain, seed: Math.random() * 1000 };
        }
    }
}

function updateVision() {
    currentlyVisible = {};
    
    const playerEntities = [
        ...units.filter(u => u.owner === 'player'),
        ...cities.filter(c => c.owner === 'player')
    ];
    
    playerEntities.forEach(entity => {
        const visionRange = 2;
        for (let dq = -visionRange; dq <= visionRange; dq++) {
            for (let dr = -visionRange; dr <= visionRange; dr++) {
                if (hexDistance(0, 0, dq, dr) <= visionRange) {
                    const nq = entity.q + dq;
                    const nr = entity.r + dr;
                    const key = `${nq},${nr}`;
                    if (map[key]) {
                        currentlyVisible[key] = true;
                        explored[key] = true;
                    }
                }
            }
        }
    });
}

function spawnEntities() {
    function getValidSpawn(minR, maxR) {
        let q, r, attempts = 0;
        do {
            q = Math.floor(Math.random() * GRID_SIZE);
            r = Math.floor(Math.random() * (maxR - minR + 1)) + minR;
            attempts++;
            if (attempts > 100) break;
        } while (!map[`${q},${r}`] || map[`${q},${r}`].terrain === TERRAIN.WATER || map[`${q},${r}`].terrain === TERRAIN.MOUNTAIN);
        return { q, r };
    }

    const playerStart = getValidSpawn(Math.floor(GRID_SIZE * 0.7), GRID_SIZE - 1);
    cities.push({ q: playerStart.q, r: playerStart.r, owner: 'player', color: '#00ffff', name: 'Capital' });
    units.push(createUnit('WARRIOR', playerStart.q, playerStart.r, 'player'));

    const aiStart = getValidSpawn(0, Math.floor(GRID_SIZE * 0.3));
    cities.push({ q: aiStart.q, r: aiStart.r, owner: 'ai', color: '#e74c3c', name: 'Enemy City' });
    units.push(createUnit('WARRIOR', aiStart.q, aiStart.r, 'ai'));
}

function createUnit(typeName, q, r, owner) {
    const type = UNIT_TYPES[typeName];
    return {
        q, r, owner,
        type: typeName,
        name: type.name,
        icon: type.icon,
        maxHp: type.maxHp,
        hp: type.maxHp,
        attack: type.attack,
        defense: type.defense,
        moves: type.moves,
        maxMoves: type.moves,
        range: type.range,
        rangedOnly: type.rangedOnly || false,
        color: owner === 'player' ? '#3498db' : '#c0392b'
    };
}

function setupUnitButtons() {
    const oldBtns = document.querySelectorAll('.unit-btn');
    oldBtns.forEach(btn => btn.remove());
    
    const oldQueue = document.getElementById('training-queue');
    if (oldQueue) oldQueue.remove();
    
    const controls = document.querySelector('.controls');
    if (!controls) return;
    
    const queueDiv = document.createElement('div');
    queueDiv.id = 'training-queue';
    queueDiv.style.cssText = 'margin-bottom:10px;padding:8px;background:rgba(0,0,0,0.3);border-radius:4px;min-height:20px;';
    queueDiv.innerHTML = '<small>Training: None</small>';
    controls.insertBefore(queueDiv, controls.firstChild);
    
    Object.keys(UNIT_TYPES).forEach(typeName => {
        const type = UNIT_TYPES[typeName];
        const btn = document.createElement('button');
        btn.className = 'unit-btn';
        btn.style.cssText = 'margin-top:5px;font-size:12px;padding:8px;';
        btn.innerHTML = `${type.icon} ${type.name} (${type.trainTime}t)`;
        btn.onclick = () => queueUnit(typeName);
        controls.appendChild(btn);
    });
}

function queueUnit(typeName) {
    if (!isPlayerTurn || gameOver) return;
    
    const playerCity = cities.find(c => c.owner === 'player');
    if (!playerCity) return;
    
    if (trainingQueue.length > 0) {
        const pos = hexToPixel(playerCity.q, playerCity.r);
        showFloatingText(pos.x, pos.y, 'Already training!', '#e74c3c');
        return;
    }
    
    trainingQueue.push({
        city: playerCity,
        unitType: typeName,
        turnsLeft: UNIT_TYPES[typeName].trainTime
    });
    
    const pos = hexToPixel(playerCity.q, playerCity.r);
    showFloatingText(pos.x, pos.y, `Training ${UNIT_TYPES[typeName].icon}...`, '#f1c40f');
    updateTrainingDisplay();
}

function updateTrainingDisplay() {
    const queueDiv = document.getElementById('training-queue');
    if (!queueDiv) return;
    
    if (trainingQueue.length === 0) {
        queueDiv.innerHTML = '<small>Training: None</small>';
    } else {
        const t = trainingQueue[0];
        const type = UNIT_TYPES[t.unitType];
        queueDiv.innerHTML = `<small>Training: ${type.icon} ${type.name} - ${t.turnsLeft}t</small>`;
    }
}

function processTraining(queue, owner) {
    for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].turnsLeft--;
        
        if (queue[i].turnsLeft <= 0) {
            const t = queue[i];
            const occupied = units.find(u => u.q === t.city.q && u.r === t.city.r);
            
            if (!occupied) {
                const newUnit = createUnit(t.unitType, t.city.q, t.city.r, owner);
                newUnit.moves = 0;
                units.push(newUnit);
                
                if (owner === 'player') {
                    const pos = hexToPixel(t.city.q, t.city.r);
                    showFloatingText(pos.x, pos.y, `${UNIT_TYPES[t.unitType].icon} Ready!`, '#2ecc71');
                }
            } else {
                const neighbors = getHexNeighbors(t.city.q, t.city.r);
                for (const n of neighbors) {
                    const key = `${n.q},${n.r}`;
                    if (map[key] && map[key].terrain !== TERRAIN.WATER && map[key].terrain !== TERRAIN.MOUNTAIN) {
                        if (!units.find(u => u.q === n.q && u.r === n.r)) {
                            const newUnit = createUnit(t.unitType, n.q, n.r, owner);
                            newUnit.moves = 0;
                            units.push(newUnit);
                            if (owner === 'player') {
                                const pos = hexToPixel(n.q, n.r);
                                showFloatingText(pos.x, pos.y, `${UNIT_TYPES[t.unitType].icon} Ready!`, '#2ecc71');
                            }
                            break;
                        }
                    }
                }
            }
            queue.splice(i, 1);
        }
    }
}

// --- HELPER FUNCTIONS ---

function randomNormal(mean, stdDev) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return Math.round(num * stdDev + mean);
}

function showFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 60, maxLife: 60 });
}

function createParticle(q, r, color) {
    const key = `${q},${r}`;
    if (!currentlyVisible[key]) return;
    
    const pos = hexToPixel(q, r);
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: pos.x, y: pos.y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 25, maxLife: 25,
            color, size: Math.random() * 4 + 2,
            tileQ: q, tileR: r
        });
    }
}

// --- HEX DRAWING ---

function drawHex(cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i - 30);
        const x = cx + size * Math.cos(angle);
        const y = cy + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawTerrainHex(q, r, tile, darkened) {
    const pos = hexToPixel(q, r);
    const seed = tile.seed;
    
    // Base hex
    drawHex(pos.x, pos.y, HEX_SIZE);
    ctx.fillStyle = tile.terrain.color;
    ctx.fill();
    
    if (tile.terrain.type === 'plains') {
        ctx.fillStyle = darkened ? '#5a8030' : '#7db844';
        for (let i = 0; i < 6; i++) {
            const gx = pos.x - 15 + ((seed * (i + 1) * 7) % 30);
            const gy = pos.y - 15 + ((seed * (i + 2) * 11) % 30);
            ctx.fillRect(gx, gy, 2, 4);
        }
    }
    else if (tile.terrain.type === 'rainforest') {
        for (let i = 0; i < 4; i++) {
            const tx = pos.x - 12 + ((seed * (i + 1) * 13) % 24);
            const ty = pos.y - 8 + ((seed * (i + 3) * 17) % 16);
            ctx.fillStyle = darkened ? '#2a1a10' : '#4a3520';
            ctx.fillRect(tx + 3, ty + 6, 2, 5);
            ctx.fillStyle = darkened ? '#0f2810' : '#1e4620';
            ctx.beginPath();
            ctx.moveTo(tx + 4, ty);
            ctx.lineTo(tx + 10, ty + 8);
            ctx.lineTo(tx - 2, ty + 8);
            ctx.closePath();
            ctx.fill();
        }
    }
    else if (tile.terrain.type === 'tundra') {
        ctx.fillStyle = darkened ? '#aaa' : '#fff';
        for (let i = 0; i < 8; i++) {
            const sx = pos.x - 15 + ((seed * (i + 1) * 7) % 30);
            const sy = pos.y - 15 + ((seed * (i + 2) * 11) % 30);
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    else if (tile.terrain.type === 'water') {
        ctx.strokeStyle = darkened ? '#1a5a80' : '#3498db';
        ctx.lineWidth = 2;
        const time = Date.now() / 1000;
        for (let i = 0; i < 2; i++) {
            const wy = pos.y - 8 + i * 16;
            ctx.beginPath();
            ctx.moveTo(pos.x - 20, wy + Math.sin(time + seed + i) * 3);
            ctx.quadraticCurveTo(pos.x, wy - 4 + Math.sin(time + seed) * 2, pos.x + 20, wy + Math.sin(time + seed + i) * 3);
            ctx.stroke();
        }
    }
    else if (tile.terrain.type === 'mountain') {
        ctx.fillStyle = darkened ? '#3a4a52' : '#5a6a72';
        ctx.beginPath();
        ctx.moveTo(pos.x - 15, pos.y + 15);
        ctx.lineTo(pos.x - 5, pos.y - 12);
        ctx.lineTo(pos.x + 5, pos.y + 15);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = darkened ? '#2a3a42' : '#4a5a62';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y + 15);
        ctx.lineTo(pos.x + 10, pos.y - 8);
        ctx.lineTo(pos.x + 20, pos.y + 15);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = darkened ? '#aaa' : '#fff';
        ctx.beginPath();
        ctx.moveTo(pos.x - 8, pos.y - 6);
        ctx.lineTo(pos.x - 5, pos.y - 12);
        ctx.lineTo(pos.x - 2, pos.y - 6);
        ctx.closePath();
        ctx.fill();
    }
    
    if (darkened) {
        drawHex(pos.x, pos.y, HEX_SIZE);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
    }
    
    // Hex border
    drawHex(pos.x, pos.y, HEX_SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawFogHex(q, r) {
    const pos = hexToPixel(q, r);
    
    drawHex(pos.x, pos.y, HEX_SIZE);
    ctx.fillStyle = '#d0d8e0';
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const seed = q * 100 + r;
    for (let i = 0; i < 4; i++) {
        const fx = pos.x - 10 + ((seed * (i + 1) * 7) % 20);
        const fy = pos.y - 10 + ((seed * (i + 2) * 11) % 20);
        ctx.beginPath();
        ctx.arc(fx, fy, 6 + (i % 2) * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawHex(pos.x, pos.y, HEX_SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawCity(city) {
    const key = `${city.q},${city.r}`;
    if (!explored[key]) return;
    if (city.owner === 'ai' && !currentlyVisible[key]) return;
    
    const pos = hexToPixel(city.q, city.r);
    const darkened = !currentlyVisible[key];
    
    // Draw medieval buildings
    const baseColor = city.owner === 'player' ? '#4a90a0' : '#904a4a';
    const roofColor = city.owner === 'player' ? '#2a6070' : '#702a2a';
    const wallColor = darkened ? '#555' : '#d4c4a0';
    
    // Castle wall base
    ctx.fillStyle = darkened ? '#444' : wallColor;
    ctx.fillRect(pos.x - 18, pos.y - 5, 36, 20);
    
    // Main tower (center)
    ctx.fillStyle = darkened ? '#555' : wallColor;
    ctx.fillRect(pos.x - 8, pos.y - 18, 16, 28);
    
    // Tower roof
    ctx.fillStyle = darkened ? '#333' : roofColor;
    ctx.beginPath();
    ctx.moveTo(pos.x - 10, pos.y - 18);
    ctx.lineTo(pos.x, pos.y - 28);
    ctx.lineTo(pos.x + 10, pos.y - 18);
    ctx.closePath();
    ctx.fill();
    
    // Side towers
    ctx.fillStyle = darkened ? '#555' : wallColor;
    ctx.fillRect(pos.x - 20, pos.y - 10, 8, 18);
    ctx.fillRect(pos.x + 12, pos.y - 10, 8, 18);
    
    // Side tower roofs
    ctx.fillStyle = darkened ? '#333' : roofColor;
    ctx.beginPath();
    ctx.moveTo(pos.x - 22, pos.y - 10);
    ctx.lineTo(pos.x - 16, pos.y - 18);
    ctx.lineTo(pos.x - 10, pos.y - 10);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(pos.x + 10, pos.y - 10);
    ctx.lineTo(pos.x + 16, pos.y - 18);
    ctx.lineTo(pos.x + 22, pos.y - 10);
    ctx.closePath();
    ctx.fill();
    
    // Windows
    ctx.fillStyle = darkened ? '#222' : '#2a1a10';
    ctx.fillRect(pos.x - 3, pos.y - 12, 6, 8);
    ctx.fillRect(pos.x - 18, pos.y - 5, 4, 5);
    ctx.fillRect(pos.x + 14, pos.y - 5, 4, 5);
    
    // Flag
    ctx.fillStyle = darkened ? '#666' : (city.owner === 'player' ? '#00ffff' : '#e74c3c');
    ctx.fillRect(pos.x, pos.y - 28, 1, -8);
    ctx.beginPath();
    ctx.moveTo(pos.x + 1, pos.y - 36);
    ctx.lineTo(pos.x + 10, pos.y - 33);
    ctx.lineTo(pos.x + 1, pos.y - 30);
    ctx.closePath();
    ctx.fill();
    
    // Battlements
    ctx.fillStyle = darkened ? '#555' : wallColor;
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(pos.x - 18 + i * 9, pos.y - 8, 4, 3);
    }
}

// --- RENDERING ---

function gameLoop() {
    update();
    draw();
    if (!gameOver) {
        requestAnimationFrame(gameLoop);
    }
}

function update() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].life--;
        floatingTexts[i].y -= 0.8;
        if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const key = `${particles[i].tileQ},${particles[i].tileR}`;
        if (!currentlyVisible[key]) {
            particles.splice(i, 1);
            continue;
        }
        particles[i].x += particles[i].vx;
        particles[i].y += particles[i].vy;
        particles[i].vy += 0.15;
        particles[i].life--;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function draw() {
    ctx.fillStyle = '#1a2530';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Map
    for (const key in map) {
        const tile = map[key];
        if (!explored[key]) {
            drawFogHex(tile.q, tile.r);
        } else if (!currentlyVisible[key]) {
            drawTerrainHex(tile.q, tile.r, tile, true);
        } else {
            drawTerrainHex(tile.q, tile.r, tile, false);
        }
    }

    // Draw valid moves
    if (selectedUnit && selectedUnit.owner === 'player' && isPlayerTurn && selectedUnit.moves > 0) {
        const moves = getValidMoves(selectedUnit);
        moves.forEach(move => {
            const pos = hexToPixel(move.q, move.r);
            drawHex(pos.x, pos.y, HEX_SIZE - 2);
            ctx.fillStyle = 'rgba(241, 196, 15, 0.4)';
            ctx.fill();
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
        
        if (selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            targets.forEach(t => {
                const pos = hexToPixel(t.q, t.r);
                drawHex(pos.x, pos.y, HEX_SIZE - 2);
                ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
                ctx.fill();
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        }
    }

    // Draw Cities
    cities.forEach(city => drawCity(city));

    // Draw Units
    units.forEach(unit => {
        const key = `${unit.q},${unit.r}`;
        if (!currentlyVisible[key]) return;
        
        const pos = hexToPixel(unit.q, unit.r);
        const radius = 14;

        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = unit.color;
        ctx.fill();

        if (selectedUnit === unit) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
        }
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.icon, pos.x, pos.y);

        if (unit.moves > 0 && unit.owner === 'player') {
            ctx.beginPath();
            ctx.arc(pos.x + 10, pos.y - 10, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#2ecc71';
            ctx.fill();
        }

        // HP Bar
        const barWidth = 28;
        const barHeight = 4;
        const barX = pos.x - 14;
        const barY = pos.y - 22;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        const hpPercent = Math.max(0, unit.hp / unit.maxHp);
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : (hpPercent > 0.25 ? '#f39c12' : '#e74c3c');
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    });

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Floating Texts
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life / ft.maxLife;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1.0;
    });
}

// --- INTERACTION ---

canvas.addEventListener('click', (e) => {
    if (gameOver || !isPlayerTurn) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    
    const hex = pixelToHex(px, py);
    
    if (map[`${hex.q},${hex.r}`]) {
        handleHexClick(hex.q, hex.r);
    }
});

function handleHexClick(q, r) {
    const key = `${q},${r}`;
    const clickedTile = map[key];
    const clickedUnit = units.find(u => u.q === q && u.r === r);
    const clickedCity = cities.find(c => c.q === q && c.r === r);
    
    updateInfoPanel(clickedTile, clickedUnit, clickedCity);

    if (clickedUnit && clickedUnit.owner === 'player') {
        selectedUnit = clickedUnit;
        return;
    }

    if (selectedUnit && selectedUnit.moves > 0) {
        // Archers can only do ranged attacks
        if (selectedUnit.rangedOnly && selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            const rangedTarget = targets.find(t => t.q === q && t.r === r);
            if (rangedTarget) {
                const enemy = units.find(u => u.q === q && u.r === r && u.owner !== selectedUnit.owner);
                if (enemy) {
                    rangedAttack(selectedUnit, enemy);
                    return;
                }
            }
            // Archers can still move to empty tiles
            const validMoves = getValidMoves(selectedUnit);
            const isValidMove = validMoves.some(m => m.q === q && m.r === r);
            const enemyOnTile = units.find(u => u.q === q && u.r === r && u.owner !== selectedUnit.owner);
            if (isValidMove && !enemyOnTile) {
                attemptMove(selectedUnit, q, r);
            }
            return;
        }
        
        // Non-archer units
        if (selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            const rangedTarget = targets.find(t => t.q === q && t.r === r);
            if (rangedTarget) {
                const enemy = units.find(u => u.q === q && u.r === r && u.owner !== selectedUnit.owner);
                if (enemy) {
                    rangedAttack(selectedUnit, enemy);
                    return;
                }
            }
        }
        
        const validMoves = getValidMoves(selectedUnit);
        const isValidMove = validMoves.some(m => m.q === q && m.r === r);
        
        if (isValidMove) {
            attemptMove(selectedUnit, q, r);
        }
    }
}

function getValidMoves(unit) {
    const moves = [];
    const range = unit.maxMoves;
    
    for (let dq = -range; dq <= range; dq++) {
        for (let dr = -range; dr <= range; dr++) {
            const dist = hexDistance(0, 0, dq, dr);
            if (dist === 0 || dist > range) continue;
            
            const nq = unit.q + dq;
            const nr = unit.r + dr;
            const key = `${nq},${nr}`;
            
            if (!map[key]) continue;
            
            const terrain = map[key].terrain;
            
            // Knights cannot cross water or mountains
            if (unit.type === 'KNIGHT' && (terrain === TERRAIN.WATER || terrain === TERRAIN.MOUNTAIN)) continue;
            
            // Other units can't go on water/mountains either
            if (terrain === TERRAIN.WATER || terrain === TERRAIN.MOUNTAIN) continue;
            
            // Knight slowed by rainforest
            if (unit.type === 'KNIGHT' && terrain.slowsKnight && dist > 1) continue;
            
            const occupant = units.find(u => u.q === nq && u.r === nr);
            
            // Archers can't melee attack
            if (unit.rangedOnly && occupant && occupant.owner !== unit.owner) continue;
            
            if (occupant && occupant.owner === unit.owner) continue;
            
            moves.push({ q: nq, r: nr });
        }
    }
    
    return moves;
}

function getAttackTargets(unit) {
    const targets = [];
    if (unit.range <= 1) return targets;
    
    const range = unit.range;
    for (let dq = -range; dq <= range; dq++) {
        for (let dr = -range; dr <= range; dr++) {
            const dist = hexDistance(0, 0, dq, dr);
            if (dist === 0 || dist > range) continue;
            
            const nq = unit.q + dq;
            const nr = unit.r + dr;
            const key = `${nq},${nr}`;
            
            if (!map[key]) continue;
            
            const enemy = units.find(u => u.q === nq && u.r === nr && u.owner !== unit.owner);
            if (enemy && currentlyVisible[key]) {
                targets.push({ q: nq, r: nr });
            }
        }
    }
    
    return targets;
}

function rangedAttack(attacker, defender) {
    const damage = Math.max(1, randomNormal(attacker.attack, 3));
    defender.hp -= damage;
    
    const pos = hexToPixel(defender.q, defender.r);
    showFloatingText(pos.x, pos.y, `-${damage}`, '#e74c3c');
    createParticle(defender.q, defender.r, '#e74c3c');
    
    attacker.moves = 0;
    
    if (defender.hp <= 0) {
        units = units.filter(u => u !== defender);
        showFloatingText(pos.x, pos.y, 'Killed!', '#e74c3c');
    }
    
    updateVision();
}

function attemptMove(unit, targetQ, targetR) {
    const enemy = units.find(u => u.q === targetQ && u.r === targetR && u.owner !== unit.owner);
    const enemyCity = cities.find(c => c.q === targetQ && c.r === targetR && c.owner !== unit.owner);
    
    if (enemy) {
        resolveCombat(unit, enemy);
    } else if (enemyCity && !enemy) {
        unit.q = targetQ;
        unit.r = targetR;
        unit.moves = 0;
        captureCity(unit, enemyCity);
    } else {
        unit.q = targetQ;
        unit.r = targetR;
        unit.moves = 0;
        createParticle(targetQ, targetR, unit.color);
    }
    
    updateVision();
}

function captureCity(unit, city) {
    const oldOwner = city.owner;
    city.owner = unit.owner;
    city.color = unit.owner === 'player' ? '#00ffff' : '#e74c3c';
    
    const pos = hexToPixel(city.q, city.r);
    showFloatingText(pos.x, pos.y, 'Captured!', '#f1c40f');
    createParticle(city.q, city.r, '#f1c40f');
    
    if (oldOwner === 'ai') {
        endGame("VICTORY!", "victory");
    } else if (oldOwner === 'player') {
        endGame("DEFEAT!", "defeat");
    }
}

function resolveCombat(attacker, defender) {
    const defenderKey = `${defender.q},${defender.r}`;
    const defenderTerrain = map[defenderKey].terrain;
    
    let atkDamage = attacker.attack;
    let defDamage = defender.attack;
    
    // Apply terrain defense bonus (20% style)
    defDamage += defenderTerrain.defenseBonus;
    
    const damageToDefender = Math.max(1, randomNormal(atkDamage, 3));
    const damageToAttacker = Math.max(1, randomNormal(defDamage, 3));

    defender.hp -= damageToDefender;
    attacker.hp -= damageToAttacker;
    
    const defPos = hexToPixel(defender.q, defender.r);
    const atkPos = hexToPixel(attacker.q, attacker.r);
    
    showFloatingText(defPos.x, defPos.y, `-${damageToDefender}`, '#e74c3c');
    showFloatingText(atkPos.x, atkPos.y, `-${damageToAttacker}`, '#e74c3c');
    
    createParticle(defender.q, defender.r, '#e74c3c');
    createParticle(attacker.q, attacker.r, '#e74c3c');
    
    attacker.moves = 0;

    const attackerDied = attacker.hp <= 0;
    const defenderDied = defender.hp <= 0;
    
    if (defenderDied && !attackerDied) {
        attacker.q = defender.q;
        attacker.r = defender.r;
    }
    
    units = units.filter(u => u.hp > 0);
}

function endGame(message, type) {
    if (gameOver) return;
    gameOver = true;
    
    const color = type === 'victory' ? '#2ecc71' : '#e74c3c';
    
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.fillStyle = color;
        ctx.font = 'bold 42px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(message, CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        ctx.fillText(message, CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        
        playerDisplay.textContent = message;
        playerDisplay.style.color = color;
        
        endTurnBtn.disabled = true;
        restartBtn.style.display = 'block';
    }, 200);
}

function updateInfoPanel(tile, unit, city) {
    const key = `${tile.q},${tile.r}`;
    if (!explored[key]) {
        tileInfoDisplay.innerHTML = '<p><em>Unknown territory</em></p>';
        return;
    }
    
    let content = `<p><strong>Terrain:</strong> ${tile.terrain.label}</p>`;
    content += `<p><strong>Defense:</strong> +${tile.terrain.defenseBonus}</p>`;

    if (city && (city.owner === 'player' || currentlyVisible[key])) {
        content += `<p><strong>City:</strong> ${city.name}</p>`;
    }
    
    if (unit && currentlyVisible[key]) {
        content += `<p><strong>Unit:</strong> ${unit.icon} ${unit.name}</p>`;
        content += `<p><strong>HP:</strong> ${unit.hp}/${unit.maxHp}</p>`;
        content += `<p><strong>ATK:</strong> ${unit.attack} <strong>DEF:</strong> ${unit.defense}</p>`;
        if (unit.range > 1) content += `<p><strong>Range:</strong> ${unit.range}</p>`;
    }

    tileInfoDisplay.innerHTML = content;
}

function updateUI() {
    turnDisplay.textContent = `Turn: ${turn}`;
    playerDisplay.textContent = isPlayerTurn ? "Your Turn" : "AI Thinking...";
    playerDisplay.className = isPlayerTurn ? "player-turn" : "enemy-turn";
    endTurnBtn.disabled = !isPlayerTurn || gameOver;
    updateTrainingDisplay();
}

// --- TURN SYSTEM ---

endTurnBtn.addEventListener('click', () => {
    if (!isPlayerTurn || gameOver) return;
    endPlayerTurn();
});

restartBtn.addEventListener('click', () => {
    initGame();
});

function endPlayerTurn() {
    isPlayerTurn = false;
    selectedUnit = null;
    
    processTraining(trainingQueue, 'player');
    updateUI();
    
    setTimeout(aiTurn, 600);
}

function aiTurn() {
    if (gameOver) return;

    processTraining(aiTrainingQueue, 'ai');

    const aiCity = cities.find(c => c.owner === 'ai');
    if (aiCity && aiTrainingQueue.length === 0 && Math.random() > 0.4) {
        const types = ['WARRIOR', 'ARCHER', 'KNIGHT'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        aiTrainingQueue.push({
            city: aiCity,
            unitType: randomType,
            turnsLeft: UNIT_TYPES[randomType].trainTime
        });
    }

    const aiUnits = units.filter(u => u.owner === 'ai' && u.moves > 0);
    const playerUnits = units.filter(u => u.owner === 'player');
    const playerCities = cities.filter(c => c.owner === 'player');
    
    aiUnits.forEach(unit => {
        if (gameOver || unit.moves <= 0) return;
        
        // PRIORITY: Defend city if player can capture it
        if (aiCity) {
            const playerCanCapture = playerUnits.find(p => {
                const dist = hexDistance(p.q, p.r, aiCity.q, aiCity.r);
                return dist <= p.maxMoves;
            });
            
            if (playerCanCapture) {
                // Try to attack the threatening player
                if (unit.rangedOnly && unit.range > 1) {
                    const targets = getAttackTargets(unit);
                    const threat = targets.find(t => t.q === playerCanCapture.q && t.r === playerCanCapture.r);
                    if (threat) {
                        rangedAttack(unit, playerCanCapture);
                        return;
                    }
                }
                
                const validMoves = getValidMoves(unit);
                const attackMove = validMoves.find(m => m.q === playerCanCapture.q && m.r === playerCanCapture.r);
                
                if (attackMove && !unit.rangedOnly) {
                    attemptMove(unit, attackMove.q, attackMove.r);
                    return;
                }
                
                // Move towards threat
                let bestMove = null;
                let minDist = Infinity;
                
                validMoves.forEach(move => {
                    const dist = hexDistance(move.q, move.r, playerCanCapture.q, playerCanCapture.r);
                    if (dist < minDist) {
                        minDist = dist;
                        bestMove = move;
                    }
                });
                
                if (bestMove) {
                    attemptMove(unit, bestMove.q, bestMove.r);
                    return;
                }
            }
        }
        
        // Archers ranged attack
        if (unit.rangedOnly && unit.range > 1) {
            const targets = getAttackTargets(unit);
            if (targets.length > 0) {
                const target = targets[0];
                const enemy = units.find(u => u.q === target.q && u.r === target.r);
                if (enemy) {
                    rangedAttack(unit, enemy);
                    return;
                }
            }
        }
        
        // Default: move towards player city
        const target = playerCities[0] || playerUnits[0];
        if (!target) return;

        const validMoves = getValidMoves(unit);
        if (validMoves.length === 0) return;

        if (!unit.rangedOnly) {
            const attackMove = validMoves.find(m => playerUnits.find(p => p.q === m.q && p.r === m.r));
            if (attackMove) {
                attemptMove(unit, attackMove.q, attackMove.r);
                return;
            }
        }

        let bestMove = null;
        let minDist = Infinity;

        validMoves.forEach(move => {
            const dist = hexDistance(move.q, move.r, target.q, target.r);
            if (dist < minDist) {
                minDist = dist;
                bestMove = move;
            }
        });

        if (bestMove) attemptMove(unit, bestMove.q, bestMove.r);
    });

    if (gameOver) return;

    turn++;
    isPlayerTurn = true;
    units.forEach(u => u.moves = u.maxMoves);
    updateUI();
    updateVision();
}

initGame();
