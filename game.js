// CONFIGURATION
const GRID_SIZE = 12;
const TILE_SIZE = 50;
const CANVAS_SIZE = GRID_SIZE * TILE_SIZE;

// TERRAIN DEFINITIONS
const TERRAIN = {
    TUNDRA: { type: 'tundra', color: '#e8f4f8', label: 'Tundra' },
    PLAINS: { type: 'plains', color: '#90c956', label: 'Plains' },
    RAINFOREST: { type: 'rainforest', color: '#2d5a27', label: 'Rainforest', slowsKnight: true },
    WATER: { type: 'water', color: '#2980b9', label: 'Water' },
    MOUNTAIN: { type: 'mountain', color: '#6b7c85', label: 'Mountain' }
};

// UNIT TYPES
const UNIT_TYPES = {
    WARRIOR: { name: 'Warrior', icon: '⚔', maxHp: 60, attack: 15, defense: 12, moves: 1, range: 1, trainTime: 3 },
    ARCHER: { name: 'Archer', icon: '🏹', maxHp: 40, attack: 12, defense: 6, moves: 1, range: 2, trainTime: 3 },
    KNIGHT: { name: 'Knight', icon: '🐴', maxHp: 50, attack: 10, defense: 10, moves: 2, range: 1, trainTime: 3 }
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
let fogOfWar = [];      // true = never seen (white fog)
let explored = [];      // true = has been seen before
let currentlyVisible = []; // true = can see right now
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

// Fix canvas size
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;
canvas.style.width = CANVAS_SIZE + 'px';
canvas.style.height = CANVAS_SIZE + 'px';

// --- INITIALIZATION ---

function initGame() {
    map = generateMap();
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
    
    initFogOfWar();
    spawnEntities();
    updateVision();
    updateUI();
    setupUnitButtons();
    
    requestAnimationFrame(gameLoop);
    
    endTurnBtn.disabled = false;
    endTurnBtn.textContent = "End Turn";
    restartBtn.style.display = 'none';
}

function generateMap() {
    let newMap = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        let row = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            const rand = Math.random();
            let terrain;
            
            if (rand < 0.08) terrain = TERRAIN.WATER;
            else if (rand < 0.45) terrain = TERRAIN.PLAINS;
            else if (rand < 0.7) terrain = TERRAIN.RAINFOREST;
            else if (rand < 0.92) terrain = TERRAIN.TUNDRA;
            else terrain = TERRAIN.MOUNTAIN;

            row.push({ x, y, terrain, seed: Math.random() * 1000 });
        }
        newMap.push(row);
    }
    return newMap;
}

function initFogOfWar() {
    fogOfWar = [];
    explored = [];
    currentlyVisible = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        let fogRow = [];
        let expRow = [];
        let visRow = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            fogRow.push(true);
            expRow.push(false);
            visRow.push(false);
        }
        fogOfWar.push(fogRow);
        explored.push(expRow);
        currentlyVisible.push(visRow);
    }
}

function updateVision() {
    // Reset current visibility
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            currentlyVisible[y][x] = false;
        }
    }
    
    const playerEntities = [
        ...units.filter(u => u.owner === 'player'),
        ...cities.filter(c => c.owner === 'player')
    ];
    
    playerEntities.forEach(entity => {
        const visionRange = 2; // Reduced from 3 to 2
        for (let dy = -visionRange; dy <= visionRange; dy++) {
            for (let dx = -visionRange; dx <= visionRange; dx++) {
                const nx = entity.x + dx;
                const ny = entity.y + dy;
                if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                    currentlyVisible[ny][nx] = true;
                    explored[ny][nx] = true;
                    fogOfWar[ny][nx] = false;
                }
            }
        }
    });
}

function spawnEntities() {
    function getValidSpawn(minY, maxY) {
        let x, y, attempts = 0;
        do {
            x = Math.floor(Math.random() * GRID_SIZE);
            y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
            attempts++;
            if (attempts > 100) break;
        } while (map[y][x].terrain === TERRAIN.WATER || map[y][x].terrain === TERRAIN.MOUNTAIN);
        return { x, y };
    }

    const playerStart = getValidSpawn(Math.floor(GRID_SIZE * 0.7), GRID_SIZE - 1);
    cities.push({ x: playerStart.x, y: playerStart.y, owner: 'player', color: '#00ffff', name: 'Capital' });
    units.push(createUnit('WARRIOR', playerStart.x, playerStart.y, 'player'));

    const aiStart = getValidSpawn(0, Math.floor(GRID_SIZE * 0.3));
    cities.push({ x: aiStart.x, y: aiStart.y, owner: 'ai', color: '#e74c3c', name: 'Enemy City' });
    units.push(createUnit('WARRIOR', aiStart.x, aiStart.y, 'ai'));
}

function createUnit(typeName, x, y, owner) {
    const type = UNIT_TYPES[typeName];
    return {
        x, y, owner,
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
        btn.innerHTML = `${type.icon} ${type.name} (${type.trainTime} turns)`;
        btn.onclick = () => queueUnit(typeName);
        controls.appendChild(btn);
    });
}

function queueUnit(typeName) {
    if (!isPlayerTurn || gameOver) return;
    
    const playerCity = cities.find(c => c.owner === 'player');
    if (!playerCity) return;
    
    if (trainingQueue.length > 0) {
        showFloatingText(playerCity.x, playerCity.y, 'Already training!', '#e74c3c');
        return;
    }
    
    trainingQueue.push({
        city: playerCity,
        unitType: typeName,
        turnsLeft: UNIT_TYPES[typeName].trainTime
    });
    
    showFloatingText(playerCity.x, playerCity.y, `Training ${UNIT_TYPES[typeName].icon}...`, '#f1c40f');
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
        queueDiv.innerHTML = `<small>Training: ${type.icon} ${type.name} - ${t.turnsLeft} turn${t.turnsLeft > 1 ? 's' : ''}</small>`;
    }
}

function processTraining(queue, owner) {
    for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].turnsLeft--;
        
        if (queue[i].turnsLeft <= 0) {
            const t = queue[i];
            const occupied = units.find(u => u.x === t.city.x && u.y === t.city.y);
            
            if (!occupied) {
                const newUnit = createUnit(t.unitType, t.city.x, t.city.y, owner);
                newUnit.moves = 0;
                units.push(newUnit);
                
                if (owner === 'player') {
                    showFloatingText(t.city.x, t.city.y, `${UNIT_TYPES[t.unitType].icon} Ready!`, '#2ecc71');
                }
            } else {
                const adj = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
                for (const d of adj) {
                    const nx = t.city.x + d.x;
                    const ny = t.city.y + d.y;
                    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                        const ter = map[ny][nx].terrain;
                        if (ter !== TERRAIN.WATER && ter !== TERRAIN.MOUNTAIN) {
                            if (!units.find(u => u.x === nx && u.y === ny)) {
                                const newUnit = createUnit(t.unitType, nx, ny, owner);
                                newUnit.moves = 0;
                                units.push(newUnit);
                                if (owner === 'player') {
                                    showFloatingText(nx, ny, `${UNIT_TYPES[t.unitType].icon} Ready!`, '#2ecc71');
                                }
                                break;
                            }
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
    floatingTexts.push({
        x: x * TILE_SIZE + TILE_SIZE/2,
        y: y * TILE_SIZE + TILE_SIZE/2,
        text, color,
        life: 60,
        maxLife: 60
    });
}

function createParticle(x, y, color) {
    if (!currentlyVisible[y][x]) return;
    
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x * TILE_SIZE + TILE_SIZE/2,
            y: y * TILE_SIZE + TILE_SIZE/2,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 25,
            maxLife: 25,
            color,
            size: Math.random() * 4 + 2,
            tileX: x,
            tileY: y
        });
    }
}

// --- TERRAIN DRAWING ---

function drawTerrain(x, y, tile, darkened) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const seed = tile.seed;
    
    ctx.fillStyle = tile.terrain.color;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    
    if (tile.terrain.type === 'plains') {
        ctx.fillStyle = darkened ? '#5a8030' : '#7db844';
        for (let i = 0; i < 8; i++) {
            const gx = px + ((seed * (i + 1) * 7) % TILE_SIZE);
            const gy = py + ((seed * (i + 2) * 11) % TILE_SIZE);
            ctx.fillRect(gx, gy, 2, 4);
        }
    }
    else if (tile.terrain.type === 'rainforest') {
        for (let i = 0; i < 5; i++) {
            const tx = px + 5 + ((seed * (i + 1) * 13) % (TILE_SIZE - 15));
            const ty = py + 10 + ((seed * (i + 3) * 17) % (TILE_SIZE - 20));
            ctx.fillStyle = darkened ? '#2a1a10' : '#4a3520';
            ctx.fillRect(tx + 4, ty + 8, 3, 6);
            ctx.fillStyle = darkened ? '#0f2810' : '#1e4620';
            ctx.beginPath();
            ctx.moveTo(tx + 5, ty);
            ctx.lineTo(tx + 12, ty + 10);
            ctx.lineTo(tx - 2, ty + 10);
            ctx.closePath();
            ctx.fill();
        }
    }
    else if (tile.terrain.type === 'tundra') {
        ctx.fillStyle = darkened ? '#aaa' : '#fff';
        for (let i = 0; i < 12; i++) {
            const sx = px + ((seed * (i + 1) * 7) % TILE_SIZE);
            const sy = py + ((seed * (i + 2) * 11) % TILE_SIZE);
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = darkened ? 'rgba(200,200,200,0.4)' : 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(px + 15 + (seed % 20), py + 25, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (tile.terrain.type === 'water') {
        ctx.strokeStyle = darkened ? '#1a5a80' : '#3498db';
        ctx.lineWidth = 2;
        const time = Date.now() / 1000;
        for (let i = 0; i < 3; i++) {
            const wy = py + 12 + i * 14;
            ctx.beginPath();
            ctx.moveTo(px, wy + Math.sin(time + seed + i) * 3);
            ctx.quadraticCurveTo(px + 12, wy - 4 + Math.sin(time + seed) * 2, px + 25, wy + Math.sin(time + seed + i) * 3);
            ctx.quadraticCurveTo(px + 37, wy + 4 + Math.sin(time + seed) * 2, px + 50, wy + Math.sin(time + seed + i) * 3);
            ctx.stroke();
        }
    }
    else if (tile.terrain.type === 'mountain') {
        ctx.fillStyle = darkened ? '#3a4a52' : '#5a6a72';
        ctx.beginPath();
        ctx.moveTo(px + 5, py + TILE_SIZE);
        ctx.lineTo(px + 20, py + 8);
        ctx.lineTo(px + 35, py + TILE_SIZE);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = darkened ? '#2a3a42' : '#4a5a62';
        ctx.beginPath();
        ctx.moveTo(px + 25, py + TILE_SIZE);
        ctx.lineTo(px + 40, py + 15);
        ctx.lineTo(px + 50, py + TILE_SIZE);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = darkened ? '#aaa' : '#fff';
        ctx.beginPath();
        ctx.moveTo(px + 15, py + 15);
        ctx.lineTo(px + 20, py + 8);
        ctx.lineTo(px + 25, py + 15);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(px + 35, py + 20);
        ctx.lineTo(px + 40, py + 15);
        ctx.lineTo(px + 45, py + 22);
        ctx.closePath();
        ctx.fill();
    }
    
    // Apply darkening overlay for explored but not visible
    if (darkened) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
}

function drawFog(x, y) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    
    ctx.fillStyle = '#d0d8e0';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const seed = x * 100 + y;
    for (let i = 0; i < 6; i++) {
        const fx = px + ((seed * (i + 1) * 7) % TILE_SIZE);
        const fy = py + ((seed * (i + 2) * 11) % TILE_SIZE);
        ctx.beginPath();
        ctx.arc(fx, fy, 8 + (i % 3) * 4, 0, Math.PI * 2);
        ctx.fill();
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
        if (!currentlyVisible[particles[i].tileY][particles[i].tileX]) {
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
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw Map
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (!explored[y][x]) {
                // Never seen - white fog
                drawFog(x, y);
            } else if (!currentlyVisible[y][x]) {
                // Explored but not currently visible - darkened terrain
                drawTerrain(x, y, map[y][x], true);
            } else {
                // Currently visible - normal terrain
                drawTerrain(x, y, map[y][x], false);
            }
            
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // Draw valid moves
    if (selectedUnit && selectedUnit.owner === 'player' && isPlayerTurn && selectedUnit.moves > 0) {
        const moves = getValidMoves(selectedUnit);
        moves.forEach(move => {
            ctx.fillStyle = 'rgba(241, 196, 15, 0.4)';
            ctx.fillRect(move.x * TILE_SIZE, move.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.strokeRect(move.x * TILE_SIZE + 1, move.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        });
        
        if (selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            targets.forEach(t => {
                ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
                ctx.fillRect(t.x * TILE_SIZE, t.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 2;
                ctx.strokeRect(t.x * TILE_SIZE + 1, t.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            });
        }
    }

    // Draw Cities (only if currently visible or explored for player cities)
    cities.forEach(city => {
        if (!explored[city.y][city.x]) return;
        if (city.owner === 'ai' && !currentlyVisible[city.y][city.x]) return;
        
        const darkened = !currentlyVisible[city.y][city.x];
        
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(city.x * TILE_SIZE + 6, city.y * TILE_SIZE + 6, TILE_SIZE - 6, TILE_SIZE - 6);
        
        ctx.fillStyle = darkened ? '#007788' : city.color;
        ctx.fillRect(city.x * TILE_SIZE + 8, city.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        
        ctx.strokeStyle = darkened ? '#aaa' : '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(city.x * TILE_SIZE + 8, city.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        
        ctx.fillStyle = darkened ? '#aaa' : '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(city.owner === 'player' ? 'P' : 'E', city.x * TILE_SIZE + TILE_SIZE/2, city.y * TILE_SIZE + TILE_SIZE/2);
    });

    // Draw Units (only if currently visible)
    units.forEach(unit => {
        if (!currentlyVisible[unit.y][unit.x]) return;
        
        const cx = unit.x * TILE_SIZE + TILE_SIZE / 2;
        const cy = unit.y * TILE_SIZE + TILE_SIZE / 2;
        const radius = TILE_SIZE / 2.5;

        ctx.beginPath();
        ctx.arc(cx + 2, cy + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.icon, cx, cy);

        if (unit.moves > 0 && unit.owner === 'player') {
            ctx.beginPath();
            ctx.arc(cx + radius - 2, cy - radius + 2, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#2ecc71';
            ctx.fill();
        }

        const barWidth = TILE_SIZE - 8;
        const barHeight = 4;
        const barX = unit.x * TILE_SIZE + 4;
        const barY = unit.y * TILE_SIZE - 6;
        
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
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        handleTileClick(x, y);
    }
});

function handleTileClick(x, y) {
    const clickedTile = map[y][x];
    const clickedUnit = units.find(u => u.x === x && u.y === y);
    const clickedCity = cities.find(c => c.x === x && c.y === y);
    
    updateInfoPanel(clickedTile, clickedUnit, clickedCity);

    if (clickedUnit && clickedUnit.owner === 'player') {
        selectedUnit = clickedUnit;
        return;
    }

    if (selectedUnit && selectedUnit.moves > 0) {
        const validMoves = getValidMoves(selectedUnit);
        const isValidMove = validMoves.some(m => m.x === x && m.y === y);
        
        if (selectedUnit.range > 1) {
            const targets = getAttackTargets(selectedUnit);
            const rangedTarget = targets.find(t => t.x === x && t.y === y);
            if (rangedTarget) {
                const enemy = units.find(u => u.x === x && u.y === y && u.owner !== selectedUnit.owner);
                if (enemy) {
                    rangedAttack(selectedUnit, enemy);
                    return;
                }
            }
        }
        
        if (isValidMove) {
            attemptMove(selectedUnit, x, y);
        }
    }
}

function getValidMoves(unit) {
    const moves = [];
    const range = unit.maxMoves;
    
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist === 0 || dist > range) continue;
            
            const nx = unit.x + dx;
            const ny = unit.y + dy;
            
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            
            const terrain = map[ny][nx].terrain;
            if (terrain === TERRAIN.WATER || terrain === TERRAIN.MOUNTAIN) continue;
            
            if (unit.type === 'KNIGHT' && terrain.slowsKnight && dist > 1) continue;
            
            const occupant = units.find(u => u.x === nx && u.y === ny);
            if (occupant && occupant.owner === unit.owner) continue;
            
            moves.push({ x: nx, y: ny });
        }
    }
    
    return moves;
}

function getAttackTargets(unit) {
    const targets = [];
    if (unit.range <= 1) return targets;
    
    const range = unit.range;
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist === 0 || dist > range) continue;
            
            const nx = unit.x + dx;
            const ny = unit.y + dy;
            
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            
            const enemy = units.find(u => u.x === nx && u.y === ny && u.owner !== unit.owner);
            if (enemy && currentlyVisible[ny][nx]) {
                targets.push({ x: nx, y: ny });
            }
        }
    }
    
    return targets;
}

function rangedAttack(attacker, defender) {
    const damage = Math.max(1, randomNormal(attacker.attack, 3));
    defender.hp -= damage;
    
    showFloatingText(defender.x, defender.y, `-${damage}`, '#e74c3c');
    createParticle(defender.x, defender.y, '#e74c3c');
    
    attacker.moves = 0;
    
    if (defender.hp <= 0) {
        units = units.filter(u => u !== defender);
        showFloatingText(defender.x, defender.y, 'Killed!', '#e74c3c');
    }
    
    updateVision();
}

function attemptMove(unit, targetX, targetY) {
    const enemy = units.find(u => u.x === targetX && u.y === targetY && u.owner !== unit.owner);
    const enemyCity = cities.find(c => c.x === targetX && c.y === targetY && c.owner !== unit.owner);
    
    if (enemy) {
        resolveCombat(unit, enemy);
    } else if (enemyCity && !enemy) {
        unit.x = targetX;
        unit.y = targetY;
        unit.moves = 0;
        captureCity(unit, enemyCity);
    } else {
        unit.x = targetX;
        unit.y = targetY;
        unit.moves = 0;
        createParticle(targetX, targetY, unit.color);
    }
    
    updateVision();
}

function captureCity(unit, city) {
    const oldOwner = city.owner;
    city.owner = unit.owner;
    city.color = unit.owner === 'player' ? '#00ffff' : '#e74c3c';
    
    showFloatingText(city.x, city.y, 'Captured!', '#f1c40f');
    createParticle(city.x, city.y, '#f1c40f');
    
    // Win by capturing city
    if (oldOwner === 'ai') {
        endGame("VICTORY!", "victory");
    } else if (oldOwner === 'player') {
        endGame("DEFEAT!", "defeat");
    }
}

function resolveCombat(attacker, defender) {
    const defenderTerrain = map[defender.y][defender.x].terrain;
    
    let atkDamage = attacker.attack;
    let defDamage = defender.attack;
    
    if (defenderTerrain.type === 'rainforest') defDamage += 3;
    if (defenderTerrain.type === 'tundra') defDamage += 2;
    
    const damageToDefender = Math.max(1, randomNormal(atkDamage, 3));
    const damageToAttacker = Math.max(1, randomNormal(defDamage, 3));

    defender.hp -= damageToDefender;
    attacker.hp -= damageToAttacker;
    
    showFloatingText(defender.x, defender.y, `-${damageToDefender}`, '#e74c3c');
    showFloatingText(attacker.x, attacker.y, `-${damageToAttacker}`, '#e74c3c');
    
    createParticle(defender.x, defender.y, '#e74c3c');
    createParticle(attacker.x, attacker.y, '#e74c3c');
    
    attacker.moves = 0;

    const attackerDied = attacker.hp <= 0;
    const defenderDied = defender.hp <= 0;
    
    if (defenderDied && !attackerDied) {
        attacker.x = defender.x;
        attacker.y = defender.y;
    }
    
    units = units.filter(u => u.hp > 0);
}

function endGame(message, type) {
    if (gameOver) return;
    gameOver = true;
    
    const color = type === 'victory' ? '#2ecc71' : '#e74c3c';
    
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        ctx.fillStyle = color;
        ctx.font = 'bold 42px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(message, CANVAS_SIZE/2, CANVAS_SIZE/2);
        ctx.fillText(message, CANVAS_SIZE/2, CANVAS_SIZE/2);
        
        playerDisplay.textContent = message;
        playerDisplay.style.color = color;
        
        endTurnBtn.disabled = true;
        restartBtn.style.display = 'block';
    }, 200);
}

function updateInfoPanel(tile, unit, city) {
    if (!explored[tile.y][tile.x]) {
        tileInfoDisplay.innerHTML = '<p><em>Unknown territory</em></p>';
        return;
    }
    
    let content = `<p><strong>Pos:</strong> (${tile.x}, ${tile.y})</p>`;
    content += `<p><strong>Terrain:</strong> ${tile.terrain.label}</p>`;

    if (city && (city.owner === 'player' || currentlyVisible[city.y][city.x])) {
        content += `<p><strong>City:</strong> ${city.name}</p>`;
    }
    
    if (unit && currentlyVisible[unit.y][unit.x]) {
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
        
        // Check if player is threatening AI city - prioritize defense
        if (aiCity) {
            const playerNearCity = playerUnits.find(p => {
                const dist = Math.abs(p.x - aiCity.x) + Math.abs(p.y - aiCity.y);
                return dist <= 3;
            });
            
            if (playerNearCity) {
                // Try to attack the threatening player unit
                const validMoves = getValidMoves(unit);
                const attackMove = validMoves.find(m => m.x === playerNearCity.x && m.y === playerNearCity.y);
                
                if (attackMove) {
                    attemptMove(unit, attackMove.x, attackMove.y);
                    return;
                }
                
                // Move towards the threat
                let bestMove = null;
                let minDist = Infinity;
                
                validMoves.forEach(move => {
                    const dist = Math.abs(move.x - playerNearCity.x) + Math.abs(move.y - playerNearCity.y);
                    if (dist < minDist) {
                        minDist = dist;
                        bestMove = move;
                    }
                });
                
                if (bestMove) {
                    attemptMove(unit, bestMove.x, bestMove.y);
                    return;
                }
            }
        }
        
        // Archers try ranged attack
        if (unit.range > 1) {
            const targets = getAttackTargets(unit);
            if (targets.length > 0) {
                const target = targets[0];
                const enemy = units.find(u => u.x === target.x && u.y === target.y);
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

        const attackMove = validMoves.find(m => playerUnits.find(p => p.x === m.x && p.y === m.y));

        if (attackMove) {
            attemptMove(unit, attackMove.x, attackMove.y);
            return;
        }

        let bestMove = null;
        let minDist = Infinity;

        validMoves.forEach(move => {
            const dist = Math.abs(move.x - target.x) + Math.abs(move.y - target.y);
            if (dist < minDist) {
                minDist = dist;
                bestMove = move;
            }
        });

        if (bestMove) attemptMove(unit, bestMove.x, bestMove.y);
    });

    if (gameOver) return;

    turn++;
    isPlayerTurn = true;
    units.forEach(u => u.moves = u.maxMoves);
    updateUI();
    updateVision();
}

initGame();
