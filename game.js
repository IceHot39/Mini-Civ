// CONFIGURATION
const GRID_RADIUS = 5;
const HEX_SIZE = 34;
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 650;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;

// TERRAIN DEFINITIONS
const TERRAIN = {
    TUNDRA: { type: 'tundra', color: '#8B7355', label: 'Tundra', defenseBonus: 4 },
    PLAINS: { type: 'plains', color: '#90c956', label: 'Plains', defenseBonus: 0 },
    RAINFOREST: { type: 'rainforest', color: '#2d5a27', label: 'Rainforest', defenseBonus: 6, slowsKnight: true },
    WATER: { type: 'water', color: '#2980b9', label: 'Water', defenseBonus: 0, impassable: true },
    MOUNTAIN: { type: 'mountain', color: '#6b7c85', label: 'Mountain', defenseBonus: 8, impassable: true }
};

// UNIT TYPES
const UNIT_TYPES = {
    WARRIOR: { name: 'Warrior', icon: '⚔', maxHp: 70, attack: 18, defense: 14, moves: 1, range: 1, trainTime: 3 },
    ARCHER: { name: 'Archer', icon: '🏹', maxHp: 40, attack: 14, defense: 6, moves: 1, range: 2, trainTime: 3, rangedOnly: true },
    KNIGHT: { name: 'Knight', icon: '🐴', maxHp: 50, attack: 12, defense: 10, moves: 2, range: 1, trainTime: 3 }
};

// GAME STATE
let map = {};
let units = [];
let cities = [];
let floatingTexts = [];
let particles = [];
let turn = 1;
let isPlayerTurn = true;
let selectedUnit = null;
let gameOver = false;
let explored = {};
let currentlyVisible = {};
let trainingQueue = [];
let aiTrainingQueues = {};
let numAIs = 1;
let gameStarted = false;

// DOM ELEMENTS
let canvas, ctx, turnDisplay, playerDisplay, tileInfoDisplay, endTurnBtn, restartBtn;

function initDOM() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    turnDisplay = document.getElementById('turn-display');
    playerDisplay = document.getElementById('player-display');
    tileInfoDisplay = document.getElementById('tile-info');
    endTurnBtn = document.getElementById('end-turn-btn');
    restartBtn = document.getElementById('restart-btn');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
}

// --- HEX MATH (Pointy-top) ---

function hexToPixel(q, r) {
    const x = CENTER_X + HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const y = CENTER_Y + HEX_SIZE * 3 / 2 * r;
    return { x, y };
}

function pixelToHex(px, py) {
    const x = px - CENTER_X;
    const y = py - CENTER_Y;
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE;
    const r = (2 / 3 * y) / HEX_SIZE;
    return hexRound(q, r);
}

function hexRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const qDiff = Math.abs(rq - q), rDiff = Math.abs(rr - r), sDiff = Math.abs(rs - s);
    if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
    else if (rDiff > sDiff) rr = -rq - rs;
    return { q: rq, r: rr };
}

function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

function getHexNeighbors(q, r) {
    const dirs = [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
    return dirs.map(d => ({ q: q + d.q, r: r + d.r })).filter(h => map[`${h.q},${h.r}`]);
}

// Pathfinding - can unit reach target without crossing impassable?
function canReachAdjacent(unit, targetQ, targetR) {
    const dist = hexDistance(unit.q, unit.r, targetQ, targetR);
    if (dist > unit.maxMoves) return false;
    if (dist === 1) {
        const tile = map[`${targetQ},${targetR}`];
        return tile && !tile.terrain.impassable;
    }
    // For knights (2 moves), check if path exists
    if (dist === 2 && unit.type === 'KNIGHT') {
        const neighbors = getHexNeighbors(unit.q, unit.r);
        for (const n of neighbors) {
            const nTile = map[`${n.q},${n.r}`];
            if (nTile && !nTile.terrain.impassable) {
                const finalNeighbors = getHexNeighbors(n.q, n.r);
                if (finalNeighbors.some(fn => fn.q === targetQ && fn.r === targetR)) {
                    const targetTile = map[`${targetQ},${targetR}`];
                    if (targetTile && !targetTile.terrain.impassable) return true;
                }
            }
        }
        return false;
    }
    return true;
}

// --- GAME START MENU ---

function showStartMenu() {
    initDOM();
    gameStarted = false;
    
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MINI CIV', CANVAS_WIDTH/2, 200);
    
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '20px Arial';
    ctx.fillText('Choose number of opponents:', CANVAS_WIDTH/2, 280);
    
    // Draw buttons
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(CANVAS_WIDTH/2 - 150, 320, 120, 50);
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(CANVAS_WIDTH/2 + 30, 320, 120, 50);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('1 AI', CANVAS_WIDTH/2 - 90, 352);
    ctx.fillText('2 AIs', CANVAS_WIDTH/2 + 90, 352);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = '#95a5a6';
    ctx.fillText('Capture enemy cities to win!', CANVAS_WIDTH/2, 420);
    
    canvas.onclick = handleStartClick;
}

function handleStartClick(e) {
    if (gameStarted) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (y >= 320 && y <= 370) {
        if (x >= CANVAS_WIDTH/2 - 150 && x <= CANVAS_WIDTH/2 - 30) {
            numAIs = 1;
            startGame();
        } else if (x >= CANVAS_WIDTH/2 + 30 && x <= CANVAS_WIDTH/2 + 150) {
            numAIs = 2;
            startGame();
        }
    }
}

function startGame() {
    gameStarted = true;
    canvas.onclick = null;
    initGame();
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
    aiTrainingQueues = {};
    explored = {};
    currentlyVisible = {};
    
    for (let i = 1; i <= numAIs; i++) {
        aiTrainingQueues[`ai${i}`] = [];
    }
    
    generateHexMap();
    spawnEntities();
    updateVision();
    updateUI();
    setupUnitButtons();
    
    canvas.addEventListener('click', handleCanvasClick);
    requestAnimationFrame(gameLoop);
    
    endTurnBtn.disabled = false;
    endTurnBtn.textContent = "End Turn";
    restartBtn.style.display = 'none';
}

function handleCanvasClick(e) {
    if (gameOver || !isPlayerTurn) return;
    const rect = canvas.getBoundingClientRect();
    const hex = pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
    if (map[`${hex.q},${hex.r}`]) handleHexClick(hex.q, hex.r);
}

function generateHexMap() {
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
        const r1 = Math.max(-GRID_RADIUS, -q - GRID_RADIUS);
        const r2 = Math.min(GRID_RADIUS, -q + GRID_RADIUS);
        for (let r = r1; r <= r2; r++) {
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
    const playerEntities = [...units.filter(u => u.owner === 'player'), ...cities.filter(c => c.owner === 'player')];
    playerEntities.forEach(entity => {
        for (let dq = -2; dq <= 2; dq++) {
            for (let dr = -2; dr <= 2; dr++) {
                if (hexDistance(0, 0, dq, dr) <= 2) {
                    const key = `${entity.q + dq},${entity.r + dr}`;
                    if (map[key]) { currentlyVisible[key] = true; explored[key] = true; }
                }
            }
        }
    });
}

function spawnEntities() {
    const allHexes = Object.values(map).filter(h => !h.terrain.impassable);
    
    // Player in bottom
    const playerHexes = allHexes.filter(h => h.r > 2);
    const playerStart = playerHexes[Math.floor(Math.random() * playerHexes.length)];
    cities.push({ q: playerStart.q, r: playerStart.r, owner: 'player', color: '#00ffff', name: 'Capital' });
    units.push(createUnit('WARRIOR', playerStart.q, playerStart.r, 'player'));

    // AI 1 in top
    const ai1Hexes = allHexes.filter(h => h.r < -2 && hexDistance(h.q, h.r, playerStart.q, playerStart.r) > 5);
    const ai1Start = ai1Hexes[Math.floor(Math.random() * ai1Hexes.length)] || allHexes.find(h => h.r < -1);
    cities.push({ q: ai1Start.q, r: ai1Start.r, owner: 'ai1', color: '#e74c3c', name: 'Red City' });
    units.push(createUnit('WARRIOR', ai1Start.q, ai1Start.r, 'ai1'));

    // AI 2 if enabled
    if (numAIs >= 2) {
        const ai2Hexes = allHexes.filter(h => 
            Math.abs(h.r) <= 2 && 
            hexDistance(h.q, h.r, playerStart.q, playerStart.r) > 4 &&
            hexDistance(h.q, h.r, ai1Start.q, ai1Start.r) > 4
        );
        const ai2Start = ai2Hexes[Math.floor(Math.random() * ai2Hexes.length)] || allHexes.find(h => h.q > 2);
        cities.push({ q: ai2Start.q, r: ai2Start.r, owner: 'ai2', color: '#9b59b6', name: 'Purple City' });
        units.push(createUnit('WARRIOR', ai2Start.q, ai2Start.r, 'ai2'));
    }
}

function createUnit(typeName, q, r, owner) {
    const type = UNIT_TYPES[typeName];
    let color = '#3498db';
    if (owner === 'ai1') color = '#c0392b';
    else if (owner === 'ai2') color = '#8e44ad';
    return {
        q, r, owner, type: typeName, name: type.name, icon: type.icon,
        maxHp: type.maxHp, hp: type.maxHp, attack: type.attack, defense: type.defense,
        moves: type.moves, maxMoves: type.moves, range: type.range,
        rangedOnly: type.rangedOnly || false, color
    };
}

function setupUnitButtons() {
    document.querySelectorAll('.unit-btn').forEach(btn => btn.remove());
    const oldQueue = document.getElementById('training-queue');
    if (oldQueue) oldQueue.remove();
    
    const controls = document.querySelector('.controls');
    if (!controls) return;
    
    const queueDiv = document.createElement('div');
    queueDiv.id = 'training-queue';
    queueDiv.style.cssText = 'margin-bottom:10px;padding:8px;background:rgba(0,0,0,0.3);border-radius:4px;';
    queueDiv.innerHTML = '<small>Training: None</small>';
    controls.insertBefore(queueDiv, controls.firstChild);
    
    Object.keys(UNIT_TYPES).forEach(typeName => {
        const type = UNIT_TYPES[typeName];
        const btn = document.createElement('button');
        btn.className = 'unit-btn';
        btn.innerHTML = `${type.icon} ${type.name} (${type.trainTime}t)`;
        btn.onclick = () => queueUnit(typeName);
        controls.appendChild(btn);
    });
}

function queueUnit(typeName) {
    if (!isPlayerTurn || gameOver) return;
    const playerCity = cities.find(c => c.owner === 'player');
    if (!playerCity || trainingQueue.length > 0) return;
    trainingQueue.push({ city: playerCity, unitType: typeName, turnsLeft: UNIT_TYPES[typeName].trainTime });
    const pos = hexToPixel(playerCity.q, playerCity.r);
    showFloatingText(pos.x, pos.y, `Training ${UNIT_TYPES[typeName].icon}...`, '#f1c40f');
    updateTrainingDisplay();
}

function updateTrainingDisplay() {
    const queueDiv = document.getElementById('training-queue');
    if (!queueDiv) return;
    if (trainingQueue.length === 0) queueDiv.innerHTML = '<small>Training: None</small>';
    else {
        const t = trainingQueue[0];
        queueDiv.innerHTML = `<small>Training: ${UNIT_TYPES[t.unitType].icon} - ${t.turnsLeft}t</small>`;
    }
}

function processTraining(queue, owner) {
    for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].turnsLeft--;
        if (queue[i].turnsLeft <= 0) {
            const t = queue[i];
            let spawnQ = t.city.q, spawnR = t.city.r;
            if (units.find(u => u.q === spawnQ && u.r === spawnR)) {
                const free = getHexNeighbors(t.city.q, t.city.r).find(n => {
                    const ter = map[`${n.q},${n.r}`].terrain;
                    return !ter.impassable && !units.find(u => u.q === n.q && u.r === n.r);
                });
                if (free) { spawnQ = free.q; spawnR = free.r; }
                else { queue.splice(i, 1); continue; }
            }
            const newUnit = createUnit(t.unitType, spawnQ, spawnR, owner);
            newUnit.moves = 0;
            units.push(newUnit);
            if (owner === 'player') {
                const pos = hexToPixel(spawnQ, spawnR);
                showFloatingText(pos.x, pos.y, `${UNIT_TYPES[t.unitType].icon} Ready!`, '#2ecc71');
            }
            queue.splice(i, 1);
        }
    }
}

// --- HELPERS ---

function randomNormal(mean, stdDev) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.round(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdDev + mean);
}

function showFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 60, maxLife: 60 });
}

function createParticle(q, r, color) {
    if (!currentlyVisible[`${q},${r}`]) return;
    const pos = hexToPixel(q, r);
    for (let i = 0; i < 5; i++) {
        particles.push({ x: pos.x, y: pos.y, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4,
            life: 25, maxLife: 25, color, size: Math.random()*4+2, tileQ: q, tileR: r });
    }
}

// --- DRAWING ---

function drawHex(cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i - 90);
        const x = cx + size * Math.cos(angle);
        const y = cy + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawTerrainHex(tile, darkened) {
    const pos = hexToPixel(tile.q, tile.r);
    const seed = tile.seed;
    
    drawHex(pos.x, pos.y, HEX_SIZE);
    ctx.fillStyle = darkened ? shadeColor(tile.terrain.color, -30) : tile.terrain.color;
    ctx.fill();
    
    if (tile.terrain.type === 'plains') {
        ctx.fillStyle = darkened ? '#5a8030' : '#7db844';
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(pos.x - 12 + ((seed*(i+1)*7)%24), pos.y - 12 + ((seed*(i+2)*11)%24), 2, 4);
        }
    } else if (tile.terrain.type === 'rainforest') {
        for (let i = 0; i < 3; i++) {
            const tx = pos.x - 10 + ((seed*(i+1)*13)%20), ty = pos.y - 6 + ((seed*(i+3)*17)%12);
            ctx.fillStyle = darkened ? '#2a1a10' : '#4a3520';
            ctx.fillRect(tx+2, ty+5, 2, 4);
            ctx.fillStyle = darkened ? '#0f2810' : '#1e4620';
            ctx.beginPath(); ctx.moveTo(tx+3, ty); ctx.lineTo(tx+8, ty+6); ctx.lineTo(tx-2, ty+6); ctx.closePath(); ctx.fill();
        }
    } else if (tile.terrain.type === 'tundra') {
        ctx.fillStyle = darkened ? '#ddd' : '#fff';
        for (let i = 0; i < 8; i++) {
            const sx = pos.x - 14 + ((seed*(i+1)*7)%28), sy = pos.y - 14 + ((seed*(i+2)*11)%28);
            ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI*2); ctx.fill();
            ctx.fillRect(sx-3, sy-0.5, 6, 1); ctx.fillRect(sx-0.5, sy-3, 1, 6);
        }
    } else if (tile.terrain.type === 'water') {
        ctx.strokeStyle = darkened ? '#1a5a80' : '#3498db'; ctx.lineWidth = 2;
        const time = Date.now() / 1000;
        for (let i = 0; i < 2; i++) {
            const wy = pos.y - 6 + i * 12;
            ctx.beginPath(); ctx.moveTo(pos.x-15, wy + Math.sin(time+seed+i)*2);
            ctx.quadraticCurveTo(pos.x, wy-3+Math.sin(time+seed)*2, pos.x+15, wy+Math.sin(time+seed+i)*2); ctx.stroke();
        }
    } else if (tile.terrain.type === 'mountain') {
        ctx.fillStyle = darkened ? '#3a4a52' : '#5a6a72';
        ctx.beginPath(); ctx.moveTo(pos.x-10, pos.y+10); ctx.lineTo(pos.x-2, pos.y-10); ctx.lineTo(pos.x+6, pos.y+10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = darkened ? '#2a3a42' : '#4a5a62';
        ctx.beginPath(); ctx.moveTo(pos.x+2, pos.y+10); ctx.lineTo(pos.x+10, pos.y-5); ctx.lineTo(pos.x+18, pos.y+10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = darkened ? '#aaa' : '#fff';
        ctx.beginPath(); ctx.moveTo(pos.x-5, pos.y-5); ctx.lineTo(pos.x-2, pos.y-10); ctx.lineTo(pos.x+1, pos.y-5); ctx.closePath(); ctx.fill();
    }
    
    if (darkened) { drawHex(pos.x, pos.y, HEX_SIZE); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); }
    drawHex(pos.x, pos.y, HEX_SIZE); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();
}

function shadeColor(color, percent) {
    const num = parseInt(color.replace('#',''),16), amt = Math.round(2.55*percent);
    const R = Math.max(0,Math.min(255,(num>>16)+amt)), G = Math.max(0,Math.min(255,((num>>8)&0xFF)+amt)), B = Math.max(0,Math.min(255,(num&0xFF)+amt));
    return `rgb(${R},${G},${B})`;
}

function drawFogHex(q, r) {
    const pos = hexToPixel(q, r);
    drawHex(pos.x, pos.y, HEX_SIZE); ctx.fillStyle = '#c8d0d8'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(pos.x-8+i*8, pos.y-4+(i%2)*8, 5, 0, Math.PI*2); ctx.fill(); }
    drawHex(pos.x, pos.y, HEX_SIZE); ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke();
}

function drawCity(city) {
    const key = `${city.q},${city.r}`;
    if (!explored[key]) return;
    if (city.owner !== 'player' && !currentlyVisible[key]) return;
    
    const pos = hexToPixel(city.q, city.r);
    const dark = !currentlyVisible[key];
    const wallColor = dark ? '#555' : '#d4c4a0';
    const roofColor = dark ? '#333' : (city.owner === 'player' ? '#2a6070' : (city.owner === 'ai1' ? '#702a2a' : '#4a2a6a'));
    
    ctx.fillStyle = wallColor;
    ctx.fillRect(pos.x-14, pos.y-2, 28, 14);
    ctx.fillRect(pos.x-6, pos.y-14, 12, 22);
    ctx.fillStyle = roofColor;
    ctx.beginPath(); ctx.moveTo(pos.x-8,pos.y-14); ctx.lineTo(pos.x,pos.y-22); ctx.lineTo(pos.x+8,pos.y-14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = wallColor;
    ctx.fillRect(pos.x-16,pos.y-8,6,14); ctx.fillRect(pos.x+10,pos.y-8,6,14);
    ctx.fillStyle = roofColor;
    ctx.beginPath(); ctx.moveTo(pos.x-17,pos.y-8); ctx.lineTo(pos.x-13,pos.y-14); ctx.lineTo(pos.x-9,pos.y-8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(pos.x+9,pos.y-8); ctx.lineTo(pos.x+13,pos.y-14); ctx.lineTo(pos.x+17,pos.y-8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark ? '#666' : city.color;
    ctx.fillRect(pos.x,pos.y-22,1,-6);
    ctx.beginPath(); ctx.moveTo(pos.x+1,pos.y-28); ctx.lineTo(pos.x+8,pos.y-25); ctx.lineTo(pos.x+1,pos.y-22); ctx.closePath(); ctx.fill();
}

function drawUnit(unit) {
    if (!currentlyVisible[`${unit.q},${unit.r}`]) return;
    const pos = hexToPixel(unit.q, unit.r), r = 12;
    ctx.beginPath(); ctx.arc(pos.x+2, pos.y+2, r, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI*2); ctx.fillStyle = unit.color; ctx.fill();
    ctx.strokeStyle = selectedUnit === unit ? '#f1c40f' : '#fff'; ctx.lineWidth = selectedUnit === unit ? 3 : 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(unit.icon, pos.x, pos.y);
    if (unit.moves > 0 && unit.owner === 'player') { ctx.beginPath(); ctx.arc(pos.x+8,pos.y-8,4,0,Math.PI*2); ctx.fillStyle = '#2ecc71'; ctx.fill(); }
    const bw=22, bh=3, bx=pos.x-11, by=pos.y-18;
    ctx.fillStyle = '#333'; ctx.fillRect(bx,by,bw,bh);
    const hp = Math.max(0, unit.hp/unit.maxHp);
    ctx.fillStyle = hp>0.5?'#2ecc71':(hp>0.25?'#f39c12':'#e74c3c'); ctx.fillRect(bx,by,bw*hp,bh);
}

function gameLoop() { update(); draw(); if (!gameOver) requestAnimationFrame(gameLoop); }

function update() {
    for (let i = floatingTexts.length-1; i >= 0; i--) { floatingTexts[i].life--; floatingTexts[i].y -= 0.8; if (floatingTexts[i].life <= 0) floatingTexts.splice(i,1); }
    for (let i = particles.length-1; i >= 0; i--) {
        if (!currentlyVisible[`${particles[i].tileQ},${particles[i].tileR}`]) { particles.splice(i,1); continue; }
        particles[i].x += particles[i].vx; particles[i].y += particles[i].vy; particles[i].vy += 0.15; particles[i].life--;
        if (particles[i].life <= 0) particles.splice(i,1);
    }
}

function draw() {
    ctx.fillStyle = '#1a252f'; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    for (const key in map) {
        const tile = map[key];
        if (!explored[key]) drawFogHex(tile.q, tile.r);
        else if (!currentlyVisible[key]) drawTerrainHex(tile, true);
        else drawTerrainHex(tile, false);
    }
    if (selectedUnit && selectedUnit.owner === 'player' && isPlayerTurn && selectedUnit.moves > 0) {
        getValidMoves(selectedUnit).forEach(m => {
            const pos = hexToPixel(m.q, m.r);
            drawHex(pos.x, pos.y, HEX_SIZE-2); ctx.fillStyle = 'rgba(241,196,15,0.4)'; ctx.fill();
            ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.stroke();
        });
        if (selectedUnit.range > 1) {
            getAttackTargets(selectedUnit).forEach(t => {
                const pos = hexToPixel(t.q, t.r);
                drawHex(pos.x, pos.y, HEX_SIZE-2); ctx.fillStyle = 'rgba(231,76,60,0.4)'; ctx.fill();
                ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2; ctx.stroke();
            });
        }
    }
    cities.forEach(c => drawCity(c));
    units.forEach(u => drawUnit(u));
    particles.forEach(p => { ctx.globalAlpha = p.life/p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; });
    floatingTexts.forEach(ft => { ctx.globalAlpha = ft.life/ft.maxLife; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(ft.text,ft.x,ft.y); ctx.fillStyle = ft.color; ctx.fillText(ft.text,ft.x,ft.y); ctx.globalAlpha = 1; });
}

// --- INTERACTION ---

function handleHexClick(q, r) {
    const key = `${q},${r}`, tile = map[key];
    const clickedUnit = units.find(u => u.q === q && u.r === r);
    const clickedCity = cities.find(c => c.q === q && c.r === r);
    updateInfoPanel(tile, clickedUnit, clickedCity);
    
    if (clickedUnit && clickedUnit.owner === 'player') { selectedUnit = clickedUnit; return; }
    
    if (selectedUnit && selectedUnit.moves > 0) {
        if (selectedUnit.rangedOnly && selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            if (targets.find(t => t.q === q && t.r === r)) {
                const enemy = units.find(u => u.q === q && u.r === r && u.owner !== selectedUnit.owner);
                if (enemy) { rangedAttack(selectedUnit, enemy); return; }
            }
            const moves = getValidMoves(selectedUnit);
            if (moves.find(m => m.q === q && m.r === r) && !units.find(u => u.q === q && u.r === r && u.owner !== selectedUnit.owner)) attemptMove(selectedUnit, q, r);
            return;
        }
        if (selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            if (targets.find(t => t.q === q && t.r === r)) {
                const enemy = units.find(u => u.q === q && u.r === r && u.owner !== selectedUnit.owner);
                if (enemy) { rangedAttack(selectedUnit, enemy); return; }
            }
        }
        const moves = getValidMoves(selectedUnit);
        if (moves.find(m => m.q === q && m.r === r)) attemptMove(selectedUnit, q, r);
    }
}

function getValidMoves(unit) {
    const moves = [];
    if (unit.maxMoves === 1) {
        // Single move units - just check neighbors
        const neighbors = getHexNeighbors(unit.q, unit.r);
        for (const n of neighbors) {
            const tile = map[`${n.q},${n.r}`];
            if (!tile || tile.terrain.impassable) continue;
            const occupant = units.find(u => u.q === n.q && u.r === n.r);
            if (unit.rangedOnly && occupant && occupant.owner !== unit.owner) continue;
            if (occupant && occupant.owner === unit.owner) continue;
            moves.push({ q: n.q, r: n.r });
        }
    } else {
        // Knights - must pathfind through valid terrain
        const visited = new Set([`${unit.q},${unit.r}`]);
        const queue = [{ q: unit.q, r: unit.r, dist: 0 }];
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.dist >= unit.maxMoves) continue;
            
            const neighbors = getHexNeighbors(current.q, current.r);
            for (const n of neighbors) {
                const key = `${n.q},${n.r}`;
                if (visited.has(key)) continue;
                visited.add(key);
                
                const tile = map[key];
                if (!tile || tile.terrain.impassable) continue;
                
                const occupant = units.find(u => u.q === n.q && u.r === n.r);
                if (occupant && occupant.owner === unit.owner) continue;
                
                // Knight slowed by rainforest - can only move 1 into it
                const newDist = current.dist + (tile.terrain.slowsKnight ? unit.maxMoves : 1);
                
                if (newDist <= unit.maxMoves) {
                    if (!(unit.rangedOnly && occupant && occupant.owner !== unit.owner)) {
                        moves.push({ q: n.q, r: n.r });
                    }
                    if (!tile.terrain.slowsKnight) {
                        queue.push({ q: n.q, r: n.r, dist: newDist });
                    }
                }
            }
        }
    }
    return moves;
}

function getAttackTargets(unit) {
    if (unit.range <= 1) return [];
    const targets = [];
    for (const key in map) {
        const tile = map[key];
        const dist = hexDistance(unit.q, unit.r, tile.q, tile.r);
        if (dist === 0 || dist > unit.range) continue;
        const enemy = units.find(u => u.q === tile.q && u.r === tile.r && u.owner !== unit.owner);
        if (enemy && currentlyVisible[key]) targets.push({ q: tile.q, r: tile.r });
    }
    return targets;
}

function rangedAttack(attacker, defender) {
    const dmg = Math.max(1, randomNormal(attacker.attack, 3));
    defender.hp -= dmg;
    const pos = hexToPixel(defender.q, defender.r);
    showFloatingText(pos.x, pos.y, `-${dmg}`, '#e74c3c');
    createParticle(defender.q, defender.r, '#e74c3c');
    attacker.moves = 0;
    if (defender.hp <= 0) { units = units.filter(u => u !== defender); showFloatingText(pos.x, pos.y, 'Killed!', '#e74c3c'); }
    updateVision(); checkVictory();
}

function attemptMove(unit, tq, tr) {
    const enemy = units.find(u => u.q === tq && u.r === tr && u.owner !== unit.owner);
    const enemyCity = cities.find(c => c.q === tq && c.r === tr && c.owner !== unit.owner);
    if (enemy) resolveCombat(unit, enemy);
    else if (enemyCity) { unit.q = tq; unit.r = tr; unit.moves = 0; captureCity(unit, enemyCity); }
    else { unit.q = tq; unit.r = tr; unit.moves = 0; createParticle(tq, tr, unit.color); }
    updateVision();
}

function captureCity(unit, city) {
    const pos = hexToPixel(city.q, city.r);
    showFloatingText(pos.x, pos.y, 'Captured!', '#f1c40f');
    createParticle(city.q, city.r, '#f1c40f');
    
    if (city.owner === 'player') {
        cities = cities.filter(c => c !== city);
        checkVictory();
    } else {
        city.owner = unit.owner;
        city.color = unit.owner === 'player' ? '#00ffff' : unit.color;
        checkVictory();
    }
}

function resolveCombat(attacker, defender) {
    const defTerrain = map[`${defender.q},${defender.r}`].terrain;
    const dmgToDef = Math.max(1, randomNormal(attacker.attack, 3));
    const dmgToAtk = Math.max(1, randomNormal(defender.attack + defTerrain.defenseBonus, 3));
    defender.hp -= dmgToDef; attacker.hp -= dmgToAtk;
    const defPos = hexToPixel(defender.q, defender.r), atkPos = hexToPixel(attacker.q, attacker.r);
    showFloatingText(defPos.x, defPos.y, `-${dmgToDef}`, '#e74c3c');
    showFloatingText(atkPos.x, atkPos.y, `-${dmgToAtk}`, '#e74c3c');
    createParticle(defender.q, defender.r, '#e74c3c'); createParticle(attacker.q, attacker.r, '#e74c3c');
    attacker.moves = 0;
    if (defender.hp <= 0 && attacker.hp > 0) { attacker.q = defender.q; attacker.r = defender.r; }
    units = units.filter(u => u.hp > 0);
    checkVictory();
}

function checkVictory() {
    const playerCities = cities.filter(c => c.owner === 'player');
    const aiCities = cities.filter(c => c.owner.startsWith('ai'));
    if (playerCities.length === 0) endGame("DEFEAT!", "defeat");
    else if (aiCities.length === 0) endGame("VICTORY!", "victory");
}

function endGame(msg, type) {
    if (gameOver) return;
    gameOver = true;
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
        ctx.fillStyle = type === 'victory' ? '#2ecc71' : '#e74c3c';
        ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
        ctx.strokeText(msg, CANVAS_WIDTH/2, CANVAS_HEIGHT/2); ctx.fillText(msg, CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        playerDisplay.textContent = msg; playerDisplay.style.color = ctx.fillStyle;
        endTurnBtn.disabled = true; restartBtn.style.display = 'block';
        restartBtn.onclick = () => showStartMenu();
    }, 200);
}

function updateInfoPanel(tile, unit, city) {
    const key = `${tile.q},${tile.r}`;
    if (!explored[key]) { tileInfoDisplay.innerHTML = '<p><em>Unknown</em></p>'; return; }
    let c = `<p><b>Terrain:</b> ${tile.terrain.label}</p><p><b>Defense:</b> +${tile.terrain.defenseBonus}</p>`;
    if (city && (city.owner === 'player' || currentlyVisible[key])) c += `<p><b>City:</b> ${city.name}</p>`;
    if (unit && currentlyVisible[key]) c += `<p><b>Unit:</b> ${unit.icon} ${unit.name}</p><p><b>HP:</b> ${unit.hp}/${unit.maxHp}</p>`;
    tileInfoDisplay.innerHTML = c;
}

function updateUI() {
    turnDisplay.textContent = `Turn: ${turn}`;
    playerDisplay.textContent = isPlayerTurn ? "Your Turn" : "AI Thinking...";
    playerDisplay.className = isPlayerTurn ? "player-turn" : "enemy-turn";
    endTurnBtn.disabled = !isPlayerTurn || gameOver;
    updateTrainingDisplay();
}

// --- TURN SYSTEM ---

document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    endTurnBtn.addEventListener('click', () => { if (isPlayerTurn && !gameOver) endPlayerTurn(); });
    restartBtn.addEventListener('click', () => showStartMenu());
    showStartMenu();
});

function endPlayerTurn() {
    isPlayerTurn = false; selectedUnit = null;
    processTraining(trainingQueue, 'player');
    updateUI();
    setTimeout(() => runAITurns(), 400);
}

function runAITurns() {
    const aiList = [];
    for (let i = 1; i <= numAIs; i++) {
        if (cities.some(c => c.owner === `ai${i}`)) aiList.push(`ai${i}`);
    }
    
    let idx = 0;
    function nextAI() {
        if (idx >= aiList.length || gameOver) {
            finishTurn();
            return;
        }
        aiTurn(aiList[idx]);
        idx++;
        setTimeout(nextAI, 300);
    }
    nextAI();
}

function finishTurn() {
    if (gameOver) return;
    turn++; isPlayerTurn = true;
    units.forEach(u => u.moves = u.maxMoves);
    updateUI(); updateVision();
}

// --- STRATEGIC AI ---

function aiTurn(aiOwner) {
    if (gameOver) return;
    
    const queue = aiTrainingQueues[aiOwner];
    processTraining(queue, aiOwner);
    
    const myCity = cities.find(c => c.owner === aiOwner);
    const myUnits = units.filter(u => u.owner === aiOwner && u.moves > 0);
    const enemyUnits = units.filter(u => u.owner !== aiOwner);
    const enemyCities = cities.filter(c => c.owner !== aiOwner);
    
    // Train units
    if (myCity && queue.length === 0 && Math.random() > 0.3) {
        const types = ['WARRIOR', 'ARCHER', 'KNIGHT'];
        queue.push({ city: myCity, unitType: types[Math.floor(Math.random() * 3)], turnsLeft: 3 });
    }
    
    // Evaluate threats and opportunities for each unit
    myUnits.forEach(unit => {
        if (gameOver || unit.moves <= 0) return;
        
        const validMoves = getValidMoves(unit);
        const attackTargets = unit.rangedOnly ? [] : validMoves.filter(m => enemyUnits.find(e => e.q === m.q && e.r === m.r));
        const rangedTargets = unit.range > 1 ? getAttackTargets(unit) : [];
        
        // === EVALUATE SITUATION ===
        
        // Can I capture an enemy city this turn?
        const captureableCity = enemyCities.find(ec => validMoves.some(m => m.q === ec.q && m.r === ec.r) && !units.find(u => u.q === ec.q && u.r === ec.r && u.owner !== aiOwner));
        
        // Is my city under threat?
        let cityThreat = null;
        let cityDefender = null;
        if (myCity) {
            cityDefender = units.find(u => u.owner === aiOwner && u.q === myCity.q && u.r === myCity.r);
            cityThreat = enemyUnits.find(e => {
                const dist = hexDistance(e.q, e.r, myCity.q, myCity.r);
                return dist <= e.maxMoves;
            });
        }
        
        // Can I move to my city?
        const canMoveToCity = myCity && validMoves.some(m => m.q === myCity.q && m.r === myCity.r);
        
        // === DECISION TREE (Human-like thinking) ===
        
        // 1. CAPTURE ENEMY CITY IF POSSIBLE (Winning move!)
        if (captureableCity && !unit.rangedOnly) {
            attemptMove(unit, captureableCity.q, captureableCity.r);
            return;
        }
        
        // 2. DEFEND MY CITY IF THREATENED AND UNDEFENDED
        if (cityThreat && !cityDefender && canMoveToCity) {
            attemptMove(unit, myCity.q, myCity.r);
            return;
        }
        
        // 3. ATTACK THREATENING UNIT IF CITY THREATENED
        if (cityThreat && myCity) {
            // Ranged attack
            if (rangedTargets.find(t => t.q === cityThreat.q && t.r === cityThreat.r)) {
                rangedAttack(unit, cityThreat);
                return;
            }
            // Melee attack
            if (!unit.rangedOnly && attackTargets.find(m => m.q === cityThreat.q && m.r === cityThreat.r)) {
                attemptMove(unit, cityThreat.q, cityThreat.r);
                return;
            }
            // Move towards threat
            let best = null, minD = Infinity;
            validMoves.forEach(m => {
                const d = hexDistance(m.q, m.r, cityThreat.q, cityThreat.r);
                if (d < minD) { minD = d; best = m; }
            });
            if (best && minD < hexDistance(unit.q, unit.r, cityThreat.q, cityThreat.r)) {
                attemptMove(unit, best.q, best.r);
                return;
            }
        }
        
        // 4. ATTACK ANY ENEMY IN RANGE (Opportunistic)
        if (rangedTargets.length > 0) {
            // Prefer low HP targets
            let bestTarget = null, lowestHp = Infinity;
            rangedTargets.forEach(t => {
                const enemy = units.find(u => u.q === t.q && u.r === t.r);
                if (enemy && enemy.hp < lowestHp) { lowestHp = enemy.hp; bestTarget = enemy; }
            });
            if (bestTarget) { rangedAttack(unit, bestTarget); return; }
        }
        
        if (attackTargets.length > 0 && !unit.rangedOnly) {
            // Prefer low HP targets
            let bestTarget = null, lowestHp = Infinity;
            attackTargets.forEach(m => {
                const enemy = enemyUnits.find(e => e.q === m.q && e.r === m.r);
                if (enemy && enemy.hp < lowestHp) { lowestHp = enemy.hp; bestTarget = { q: m.q, r: m.r }; }
            });
            if (bestTarget) { attemptMove(unit, bestTarget.q, bestTarget.r); return; }
        }
        
        // 5. ADVANCE TOWARDS NEAREST ENEMY CITY
        const targetCity = enemyCities.reduce((nearest, c) => {
            const d = hexDistance(unit.q, unit.r, c.q, c.r);
            return (!nearest || d < nearest.dist) ? { city: c, dist: d } : nearest;
        }, null);
        
        if (targetCity && validMoves.length > 0) {
            let best = null, minD = Infinity;
            validMoves.forEach(m => {
                // Avoid moving into enemy units for archers
                if (unit.rangedOnly && enemyUnits.find(e => e.q === m.q && e.r === m.r)) return;
                const d = hexDistance(m.q, m.r, targetCity.city.q, targetCity.city.r);
                if (d < minD) { minD = d; best = m; }
            });
            if (best) { attemptMove(unit, best.q, best.r); return; }
        }
        
        // 6. FALLBACK: Move towards any enemy
        const nearestEnemy = enemyUnits.reduce((nearest, e) => {
            const d = hexDistance(unit.q, unit.r, e.q, e.r);
            return (!nearest || d < nearest.dist) ? { unit: e, dist: d } : nearest;
        }, null);
        
        if (nearestEnemy && validMoves.length > 0) {
            let best = null, minD = Infinity;
            validMoves.forEach(m => {
                if (unit.rangedOnly && enemyUnits.find(e => e.q === m.q && e.r === m.r)) return;
                const d = hexDistance(m.q, m.r, nearestEnemy.unit.q, nearestEnemy.unit.r);
                if (d < minD) { minD = d; best = m; }
            });
            if (best) attemptMove(unit, best.q, best.r);
        }
    });
}
