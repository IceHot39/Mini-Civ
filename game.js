// CONFIGURATION
const GRID_SIZE = 12;
const TILE_SIZE = 50;

// TERRAIN DEFINITIONS
const TERRAIN = {
    TUNDRA: { type: 'tundra', color: '#bdc3c7', label: 'Tundra' },
    PLAINS: { type: 'plains', color: '#2ecc71', label: 'Plains' },
    RAINFOREST: { type: 'rainforest', color: '#27ae60', label: 'Rainforest' },
    WATER: { type: 'water', color: '#3498db', label: 'Water' },
    MOUNTAIN: { type: 'mountain', color: '#7f8c8d', label: 'Mountain' }
};

// UNIT TYPES - Balanced
const UNIT_TYPES = {
    WARRIOR: { name: 'Warrior', icon: '⚔', maxHp: 60, attack: 15, defense: 12, moves: 1, range: 1 },
    ARCHER: { name: 'Archer', icon: '🏹', maxHp: 40, attack: 12, defense: 6, moves: 1, range: 2 },
    KNIGHT: { name: 'Knight', icon: '🐴', maxHp: 50, attack: 10, defense: 10, moves: 2, range: 1 }
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
let fogOfWar = [];

// DOM ELEMENTS
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const turnDisplay = document.getElementById('turn-display');
const playerDisplay = document.getElementById('player-display');
const tileInfoDisplay = document.getElementById('tile-info');
const endTurnBtn = document.getElementById('end-turn-btn');
const restartBtn = document.getElementById('restart-btn');

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
            
            if (rand < 0.12) terrain = TERRAIN.WATER;
            else if (rand < 0.45) terrain = TERRAIN.PLAINS;
            else if (rand < 0.7) terrain = TERRAIN.RAINFOREST;
            else if (rand < 0.88) terrain = TERRAIN.TUNDRA;
            else terrain = TERRAIN.MOUNTAIN;

            row.push({ x, y, terrain });
        }
        newMap.push(row);
    }
    return newMap;
}

function initFogOfWar() {
    fogOfWar = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        let row = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            row.push(true);
        }
        fogOfWar.push(row);
    }
}

function updateVision() {
    // Reset fog
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            fogOfWar[y][x] = true;
        }
    }
    
    // Reveal around player units and cities
    const playerEntities = [
        ...units.filter(u => u.owner === 'player'),
        ...cities.filter(c => c.owner === 'player')
    ];
    
    playerEntities.forEach(entity => {
        const visionRange = 3;
        for (let dy = -visionRange; dy <= visionRange; dy++) {
            for (let dx = -visionRange; dx <= visionRange; dx++) {
                const nx = entity.x + dx;
                const ny = entity.y + dy;
                if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
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

    // Player
    const playerStart = getValidSpawn(Math.floor(GRID_SIZE * 0.7), GRID_SIZE - 1);
    cities.push({ x: playerStart.x, y: playerStart.y, owner: 'player', color: '#00ffff', name: 'Capital' });
    units.push(createUnit('WARRIOR', playerStart.x, playerStart.y, 'player'));

    // AI
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
    // Remove old buttons if they exist
    const oldBtns = document.querySelectorAll('.unit-btn');
    oldBtns.forEach(btn => btn.remove());
    
    // Create unit buttons
    const controls = document.querySelector('.controls');
    if (!controls) return;
    
    Object.keys(UNIT_TYPES).forEach(typeName => {
        const type = UNIT_TYPES[typeName];
        const btn = document.createElement('button');
        btn.className = 'unit-btn';
        btn.innerHTML = `${type.icon} ${type.name}`;
        btn.onclick = () => trainUnit(typeName);
        controls.appendChild(btn);
    });
}

function trainUnit(typeName) {
    if (!isPlayerTurn || gameOver) return;
    
    const playerCity = cities.find(c => c.owner === 'player');
    if (!playerCity) return;
    
    // Check if tile is occupied
    const occupied = units.find(u => u.x === playerCity.x && u.y === playerCity.y);
    if (occupied) {
        showFloatingText(playerCity.x, playerCity.y, 'City Occupied!', '#e74c3c');
        return;
    }
    
    const newUnit = createUnit(typeName, playerCity.x, playerCity.y, 'player');
    newUnit.moves = 0; // Can't move on the turn it's created
    units.push(newUnit);
    
    showFloatingText(playerCity.x, playerCity.y, `${UNIT_TYPES[typeName].icon} Trained!`, '#2ecc71');
    updateVision();
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
        text: text,
        color: color,
        life: 60,
        maxLife: 60
    });
}

function createParticle(x, y, color) {
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x * TILE_SIZE + TILE_SIZE/2,
            y: y * TILE_SIZE + TILE_SIZE/2,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 25,
            maxLife: 25,
            color: color,
            size: Math.random() * 4 + 2
        });
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
        particles[i].x += particles[i].vx;
        particles[i].y += particles[i].vy;
        particles[i].vy += 0.15;
        particles[i].life--;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Map
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const tile = map[y][x];
            
            ctx.fillStyle = tile.terrain.color;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            // Fog of War
            if (fogOfWar[y][x]) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }

            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
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
        
        // Draw attack range for archers
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

    // Draw Cities
    cities.forEach(city => {
        if (fogOfWar[city.y][city.x] && city.owner === 'ai') return;
        
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(city.x * TILE_SIZE + 6, city.y * TILE_SIZE + 6, TILE_SIZE - 6, TILE_SIZE - 6);
        
        ctx.fillStyle = city.color;
        ctx.fillRect(city.x * TILE_SIZE + 8, city.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(city.x * TILE_SIZE + 8, city.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(city.owner === 'player' ? 'P' : 'E', city.x * TILE_SIZE + TILE_SIZE/2, city.y * TILE_SIZE + TILE_SIZE/2);
    });

    // Draw Units
    units.forEach(unit => {
        if (fogOfWar[unit.y][unit.x] && unit.owner === 'ai') return;
        
        const cx = unit.x * TILE_SIZE + TILE_SIZE / 2;
        const cy = unit.y * TILE_SIZE + TILE_SIZE / 2;
        const radius = TILE_SIZE / 2.5;

        // Shadow
        ctx.beginPath();
        ctx.arc(cx + 2, cy + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = unit.color;
        ctx.fill();

        // Selection
        if (selectedUnit === unit) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
        }
        ctx.stroke();

        // Icon
        ctx.fillStyle = '#fff';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.icon, cx, cy);

        // Moves indicator
        if (unit.moves > 0 && unit.owner === 'player') {
            ctx.beginPath();
            ctx.arc(cx + radius - 2, cy - radius + 2, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#2ecc71';
            ctx.fill();
        }

        // HP Bar
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) * scaleY / TILE_SIZE);

    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        handleTileClick(x, y);
    }
});

function handleTileClick(x, y) {
    const clickedTile = map[y][x];
    const clickedUnit = units.find(u => u.x === x && u.y === y);
    const clickedCity = cities.find(c => c.x === x && c.y === y);
    
    updateInfoPanel(clickedTile, clickedUnit, clickedCity);

    // If clicking own unit, select it
    if (clickedUnit && clickedUnit.owner === 'player') {
        selectedUnit = clickedUnit;
        return;
    }

    // If unit selected and clicking valid move
    if (selectedUnit && selectedUnit.moves > 0) {
        const validMoves = getValidMoves(selectedUnit);
        const isValidMove = validMoves.some(m => m.x === x && m.y === y);
        
        // Check ranged attack for archers
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
            
            // Can move to empty or enemy occupied tiles
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
            if (enemy && !fogOfWar[ny][nx]) {
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
        checkWinCondition();
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
    city.owner = unit.owner;
    city.color = unit.owner === 'player' ? '#00ffff' : '#e74c3c';
    
    showFloatingText(city.x, city.y, 'Captured!', '#f1c40f');
    createParticle(city.x, city.y, '#f1c40f');
    
    checkWinCondition();
}

function resolveCombat(attacker, defender) {
    const defenderTerrain = map[defender.y][defender.x].terrain;
    
    let atkDamage = attacker.attack;
    let defDamage = defender.attack;
    
    // Terrain bonus for defender
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

    // Handle deaths
    const attackerDied = attacker.hp <= 0;
    const defenderDied = defender.hp <= 0;
    
    if (defenderDied && !attackerDied) {
        attacker.x = defender.x;
        attacker.y = defender.y;
    }
    
    units = units.filter(u => u.hp > 0);
    checkWinCondition();
}

function checkWinCondition() {
    const playerUnits = units.filter(u => u.owner === 'player');
    const aiUnits = units.filter(u => u.owner === 'ai');
    const playerCities = cities.filter(c => c.owner === 'player');
    const aiCities = cities.filter(c => c.owner === 'ai');
    
    if (aiCities.length === 0 || aiUnits.length === 0) {
        endGame("VICTORY!", "victory");
    } else if (playerCities.length === 0 || playerUnits.length === 0) {
        endGame("DEFEAT!", "defeat");
    }
}

function endGame(message, type) {
    if (gameOver) return;
    gameOver = true;
    
    const color = type === 'victory' ? '#2ecc71' : '#e74c3c';
    
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = color;
        ctx.font = 'bold 42px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(message, canvas.width/2, canvas.height/2);
        ctx.fillText(message, canvas.width/2, canvas.height/2);
        
        playerDisplay.textContent = message;
        playerDisplay.style.color = color;
        
        endTurnBtn.disabled = true;
        restartBtn.style.display = 'block';
    }, 200);
}

function updateInfoPanel(tile, unit, city) {
    let content = `<p><strong>Pos:</strong> (${tile.x}, ${tile.y})</p>`;
    content += `<p><strong>Terrain:</strong> <span style="color:${tile.terrain.color}">${tile.terrain.label}</span></p>`;

    if (city) {
        content += `<p><strong>City:</strong> ${city.name}</p>`;
    }
    
    if (unit) {
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
    updateUI();
    
    setTimeout(aiTurn, 600);
}

function aiTurn() {
    if (gameOver) return;

    // AI trains units
    const aiCity = cities.find(c => c.owner === 'ai');
    if (aiCity && Math.random() > 0.5) {
        const occupied = units.find(u => u.x === aiCity.x && u.y === aiCity.y);
        if (!occupied) {
            const types = ['WARRIOR', 'ARCHER', 'KNIGHT'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const newUnit = createUnit(randomType, aiCity.x, aiCity.y, 'ai');
            newUnit.moves = 0;
            units.push(newUnit);
        }
    }

    // AI moves units
    const aiUnits = units.filter(u => u.owner === 'ai' && u.moves > 0);
    const playerUnits = units.filter(u => u.owner === 'player');
    const playerCities = cities.filter(c => c.owner === 'player');
    
    aiUnits.forEach(unit => {
        if (gameOver || unit.moves <= 0) return;
        
        // Archers try ranged attack first
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
        
        const target = playerUnits[0] || playerCities[0];
        if (!target) return;

        const validMoves = getValidMoves(unit);
        if (validMoves.length === 0) return;

        // Attack if possible
        const attackMove = validMoves.find(m => {
            const enemy = playerUnits.find(p => p.x === m.x && p.y === m.y);
            return enemy !== undefined;
        });

        if (attackMove) {
            attemptMove(unit, attackMove.x, attackMove.y);
            return;
        }

        // Move towards target
        let bestMove = null;
        let minDist = Infinity;

        validMoves.forEach(move => {
            const dist = Math.abs(move.x - target.x) + Math.abs(move.y - target.y);
            if (dist < minDist) {
                minDist = dist;
                bestMove = move;
            }
        });

        if (bestMove) {
            attemptMove(unit, bestMove.x, bestMove.y);
        }
    });

    if (gameOver) return;

    // End AI turn
    turn++;
    isPlayerTurn = true;
    units.forEach(u => u.moves = u.maxMoves);
    updateUI();
    updateVision();
}

// Start
initGame();



