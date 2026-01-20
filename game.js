// CONFIGURATION
const GRID_SIZE = 12;
const TILE_SIZE = 50;
const ANIMATION_SPEED = 200;

// TERRAIN DEFINITIONS
const TERRAIN = {
    TUNDRA: { type: 'tundra', color: '#bdc3c7', label: 'Tundra', foodYield: 0, goldYield: 0 },
    PLAINS: { type: 'plains', color: '#2ecc71', label: 'Plains', foodYield: 2, goldYield: 1 },
    RAINFOREST: { type: 'rainforest', color: '#27ae60', label: 'Rainforest', foodYield: 1, goldYield: 0 },
    WATER: { type: 'water', color: '#3498db', label: 'Water', foodYield: 1, goldYield: 0 },
    MOUNTAIN: { type: 'mountain', color: '#95a5a6', label: 'Mountain', foodYield: 0, goldYield: 3 }
};

// UNIT TYPES
const UNIT_TYPES = {
    WARRIOR: { name: 'Warrior', cost: 40, maxHp: 50, attack: 10, defense: 10, moves: 2, color: '#3498db' },
    ARCHER: { name: 'Archer', cost: 50, maxHp: 35, attack: 15, defense: 5, moves: 2, color: '#9b59b6' },
    KNIGHT: { name: 'Knight', cost: 80, maxHp: 70, attack: 18, defense: 15, moves: 3, color: '#e67e22' }
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
let playerGold = 100;
let playerFood = 50;
let aiGold = 100;
let aiFood = 50;

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
    playerGold = 100;
    playerFood = 50;
    aiGold = 100;
    aiFood = 50;
    
    spawnEntities();
    updateUI();
    
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
            
            if (rand < 0.15) terrain = TERRAIN.WATER;
            else if (rand < 0.45) terrain = TERRAIN.PLAINS;
            else if (rand < 0.7) terrain = TERRAIN.RAINFOREST;
            else if (rand < 0.85) terrain = TERRAIN.TUNDRA;
            else terrain = TERRAIN.MOUNTAIN;

            row.push({ x, y, terrain });
        }
        newMap.push(row);
    }
    return newMap;
}

function spawnEntities() {
    function getValidSpawn(minY, maxY, avoidWater = true) {
        let x, y, attempts = 0;
        do {
            x = Math.floor(Math.random() * GRID_SIZE);
            y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
            attempts++;
            if (attempts > 100) {
                avoidWater = false;
            }
        } while (
            (avoidWater && (map[y][x].terrain === TERRAIN.WATER || map[y][x].terrain === TERRAIN.MOUNTAIN))
        );
        return { x, y };
    }

    // Player starting position
    const playerStart = getValidSpawn(Math.floor(GRID_SIZE * 0.7), GRID_SIZE - 1);
    cities.push({ 
        x: playerStart.x, 
        y: playerStart.y, 
        owner: 'player', 
        color: '#00ffff',
        name: 'Capital'
    });
    
    const warrior = createUnit('WARRIOR', playerStart.x, playerStart.y, 'player');
    units.push(warrior);

    // AI starting position
    const aiStart = getValidSpawn(0, Math.floor(GRID_SIZE * 0.3));
    cities.push({ 
        x: aiStart.x, 
        y: aiStart.y, 
        owner: 'ai', 
        color: '#e74c3c',
        name: 'Enemy City'
    });
    
    const aiWarrior = createUnit('WARRIOR', aiStart.x, aiStart.y, 'ai');
    aiWarrior.color = '#c0392b';
    units.push(aiWarrior);
}

function createUnit(typeName, x, y, owner) {
    const type = UNIT_TYPES[typeName];
    return {
        x, y, owner,
        type: typeName,
        name: type.name,
        maxHp: type.maxHp,
        hp: type.maxHp,
        attack: type.attack,
        defense: type.defense,
        moves: type.moves,
        maxMoves: type.moves,
        color: owner === 'player' ? type.color : '#c0392b'
    };
}

// --- HELPER FUNCTIONS ---

function randomNormal(mean, stdDev) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return Math.round(num * stdDev + mean);
}

function createParticle(x, y, color) {
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x * TILE_SIZE + TILE_SIZE/2,
            y: y * TILE_SIZE + TILE_SIZE/2,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 30,
            maxLife: 30,
            color: color,
            size: Math.random() * 3 + 2
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
    // Update floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.life--;
        ft.y -= 0.5;
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
    
    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life--;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
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

            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // Draw Cities
    cities.forEach(city => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(city.x * TILE_SIZE + 8, city.y * TILE_SIZE + 8, TILE_SIZE - 8, TILE_SIZE - 8);
        
        ctx.fillStyle = city.color;
        const padding = 10;
        ctx.fillRect(
            city.x * TILE_SIZE + padding, 
            city.y * TILE_SIZE + padding, 
            TILE_SIZE - padding * 2, 
            TILE_SIZE - padding * 2
        );
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            city.x * TILE_SIZE + padding, 
            city.y * TILE_SIZE + padding, 
            TILE_SIZE - padding * 2, 
            TILE_SIZE - padding * 2
        );
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(city.owner === 'player' ? 'P' : 'AI', 
            city.x * TILE_SIZE + TILE_SIZE/2, 
            city.y * TILE_SIZE + TILE_SIZE/2 + 4);
    });

    // Draw valid moves for selected unit
    if (selectedUnit && selectedUnit.owner === 'player' && isPlayerTurn) {
        const moves = getValidMoves(selectedUnit);
        moves.forEach(move => {
            ctx.fillStyle = 'rgba(241, 196, 15, 0.3)';
            ctx.fillRect(move.x * TILE_SIZE, move.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.strokeRect(move.x * TILE_SIZE, move.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        });
    }

    // Draw Units
    units.forEach(unit => {
        const cx = unit.x * TILE_SIZE + TILE_SIZE / 2;
        const cy = unit.y * TILE_SIZE + TILE_SIZE / 2;
        const radius = TILE_SIZE / 3;

        // Shadow
        ctx.beginPath();
        ctx.arc(cx + 2, cy + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Unit body
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = unit.color;
        ctx.fill();

        // Selection highlight
        if (selectedUnit === unit) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Moves indicator
        if (unit.moves > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }

        // HP Bar
        const barWidth = TILE_SIZE - 10;
        const barHeight = 5;
        const barX = unit.x * TILE_SIZE + 5;
        const barY = unit.y * TILE_SIZE - 6;
        
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        const hpPercent = Math.max(0, unit.hp / unit.maxHp);
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : (hpPercent > 0.25 ? '#f39c12' : '#e74c3c');
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Unit type indicator
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(unit.type[0], cx, cy + radius + 10);
    });

    // Draw Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Draw Floating Texts
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life / ft.maxLife;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 16px Arial';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.strokeText(ft.text, ft.x, ft.y);
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
    const clickedUnit = units.find(u => u.x === x && u.y === y && u.owner === 'player');
    const clickedCity = cities.find(c => c.x === x && c.y === y && c.owner === 'player');
    
    updateInfoPanel(clickedTile, clickedUnit, clickedCity);

    // Select unit
    if (clickedUnit && clickedUnit.moves > 0) {
        selectedUnit = clickedUnit;
        return;
    }

    // Move selected unit
    if (selectedUnit && selectedUnit.moves > 0) {
        const validMoves = getValidMoves(selectedUnit);
        const isValidMove = validMoves.some(m => m.x === x && m.y === y);
        
        if (isValidMove) {
            attemptMove(selectedUnit, x, y);
        }
    }
}

function getValidMoves(unit) {
    const moves = [];
    const range = unit.moves;
    
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > range) continue;
            if (dx === 0 && dy === 0) continue;
            
            const nx = unit.x + dx;
            const ny = unit.y + dy;
            
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            
            const terrain = map[ny][nx].terrain;
            if (terrain === TERRAIN.WATER || terrain === TERRAIN.MOUNTAIN) continue;
            
            moves.push({ x: nx, y: ny });
        }
    }
    
    return moves;
}

function attemptMove(unit, targetX, targetY) {
    const enemy = units.find(u => u.x === targetX && u.y === targetY && u.owner !== unit.owner);
    const enemyCity = cities.find(c => c.x === targetX && c.y === targetY && c.owner !== unit.owner);
    
    if (enemy) {
        resolveCombat(unit, enemy);
    } else if (enemyCity) {
        captureCity(unit, enemyCity);
    } else {
        unit.x = targetX;
        unit.y = targetY;
        unit.moves--;
        createParticle(targetX, targetY, unit.color);
        checkWinCondition();
    }
}

function captureCity(unit, city) {
    const oldOwner = city.owner;
    city.owner = unit.owner;
    city.color = unit.owner === 'player' ? '#00ffff' : '#e74c3c';
    
    floatingTexts.push({
        x: city.x * TILE_SIZE + TILE_SIZE/2,
        y: city.y * TILE_SIZE + TILE_SIZE/2,
        text: 'Captured!',
        color: '#f1c40f',
        life: 60,
        maxLife: 60
    });
    
    unit.x = city.x;
    unit.y = city.y;
    unit.moves = 0;
    
    createParticle(city.x, city.y, '#f1c40f');
    
    if (oldOwner === 'ai' && cities.filter(c => c.owner === 'ai').length === 0) {
        endGame("VICTORY!", "victory");
    } else if (oldOwner === 'player' && cities.filter(c => c.owner === 'player').length === 0) {
        endGame("DEFEAT!", "defeat");
    }
}

function resolveCombat(attacker, defender) {
    const defenderTerrain = map[defender.y][defender.x].terrain;
    
    let attackDamage = attacker.attack;
    let defenseDamage = defender.attack;
    
    // Terrain bonuses
    if (defenderTerrain.type === 'rainforest') {
        defenseDamage += 5;
    } else if (defenderTerrain.type === 'mountain') {
        defenseDamage += 8;
    }
    
    // Calculate damage with variance
    const damageToDefender = Math.max(0, randomNormal(attackDamage, 3));
    const damageToAttacker = Math.max(0, randomNormal(defenseDamage, 3));

    defender.hp -= damageToDefender;
    attacker.hp -= damageToAttacker;
    
    floatingTexts.push({
        x: defender.x * TILE_SIZE + TILE_SIZE/2,
        y: defender.y * TILE_SIZE + TILE_SIZE/2,
        text: `-${damageToDefender}`,
        color: '#e74c3c',
        life: 60,
        maxLife: 60
    });
    
    floatingTexts.push({
        x: attacker.x * TILE_SIZE + TILE_SIZE/2,
        y: attacker.y * TILE_SIZE + TILE_SIZE/2,
        text: `-${damageToAttacker}`,
        color: '#e74c3c',
        life: 60,
        maxLife: 60
    });
    
    createParticle(defender.x, defender.y, '#e74c3c');
    createParticle(attacker.x, attacker.y, '#e74c3c');
    
    attacker.moves = 0;

    if (attacker.hp <= 0 || defender.hp <= 0) {
        if (attacker.hp <= 0 && defender.hp <= 0) {
            if (attacker.owner === 'player') endGame("MUTUAL DESTRUCTION!", "defeat");
            else endGame("MUTUAL DESTRUCTION!", "victory");
        } else if (attacker.hp <= 0) {
            if (attacker.owner === 'player') endGame("UNIT LOST!", "defeat");
        } else if (defender.hp <= 0) {
            if (defender.owner === 'player') endGame("UNIT LOST!", "defeat");
            else {
                attacker.x = defender.x;
                attacker.y = defender.y;
            }
        }
        
        units = units.filter(u => u.hp > 0);
        
        if (units.filter(u => u.owner === 'player').length === 0) {
            endGame("ALL UNITS LOST!", "defeat");
        } else if (units.filter(u => u.owner === 'ai').length === 0) {
            endGame("ENEMY DEFEATED!", "victory");
        }
    }
}

// --- GAME LOGIC ---

function checkWinCondition() {
    const playerCities = cities.filter(c => c.owner === 'player');
    const aiCities = cities.filter(c => c.owner === 'ai');
    
    if (aiCities.length === 0) {
        endGame("VICTORY!", "victory");
    } else if (playerCities.length === 0) {
        endGame("DEFEAT!", "defeat");
    }
}

function endGame(message, type) {
    if (gameOver) return;
    gameOver = true;
    const color = type === 'victory' ? '#2ecc71' : '#e74c3c';
    
    draw();
    
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = color;
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 5;
        ctx.strokeText(message, canvas.width/2, canvas.height/2);
        ctx.fillText(message, canvas.width/2, canvas.height/2);
        
        playerDisplay.textContent = message;
        playerDisplay.style.color = color;
        
        endTurnBtn.disabled = true;
        restartBtn.style.display = 'block';
    }, 100);
}

function updateInfoPanel(tile, unit, city) {
    let content = `
        <p><strong>Pos:</strong> (${tile.x}, ${tile.y})</p>
        <p><strong>Terrain:</strong> <span style="color:${tile.terrain.color}">${tile.terrain.label}</span></p>
    `;

    if (city) {
        content += `<p><strong>City:</strong> ${city.name}</p>`;
        content += `<p><strong>Owner:</strong> ${city.owner.toUpperCase()}</p>`;
    }
    
    if (unit) {
        content += `<p><strong>Unit:</strong> ${unit.name}</p>`;
        content += `<p><strong>HP:</strong> ${unit.hp}/${unit.maxHp}</p>`;
        content += `<p><strong>Moves:</strong> ${unit.moves}/${unit.maxMoves}</p>`;
        content += `<p><strong>Attack:</strong> ${unit.attack} <strong>Def:</strong> ${unit.defense}</p>`;
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
    
    setTimeout(aiTurn, 800);
}

function aiTurn() {
    if (gameOver) return;

    const aiUnits = units.filter(u => u.owner === 'ai');
    const playerUnits = units.filter(u => u.owner === 'player');
    const playerCities = cities.filter(c => c.owner === 'player');
    
    if (aiUnits.length === 0) return;

    // AI takes actions with each unit
    aiUnits.forEach(unit => {
        if (unit.moves > 0) {
            aiMoveUnit(unit, playerUnits, playerCities);
        }
    });

    if (gameOver) return;

    // End AI turn
    turn++;
    isPlayerTurn = true;
    
    // Reset moves
    units.forEach(u => u.moves = u.maxMoves);
    
    updateUI();
}

function aiMoveUnit(unit, playerUnits, playerCities) {
    const target = playerCities.length > 0 ? playerCities[0] : (playerUnits.length > 0 ? playerUnits[0] : null);
    if (!target) return;

    const validMoves = getValidMoves(unit);
    if (validMoves.length === 0) return;

    // Check if can attack
    const attackTarget = playerUnits.find(p => 
        validMoves.some(m => m.x === p.x && m.y === p.y)
    );

    if (attackTarget) {
        attemptMove(unit, attackTarget.x, attackTarget.y);
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
}

// Start game
initGame();


