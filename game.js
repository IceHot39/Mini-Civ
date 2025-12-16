// CONFIGURATION
const GRID_SIZE = 10;
const TILE_SIZE = 60; // Canvas is 600x600
const ANIMATION_SPEED = 200; // ms for AI delays

// TERRAIN DEFINITIONS
const TERRAIN = {
    TUNDRA: { type: 'tundra', color: '#bdc3c7', label: 'Tundra' },
    PLAINS: { type: 'plains', color: '#2ecc71', label: 'Plains' },
    RAINFOREST: { type: 'rainforest', color: '#27ae60', label: 'Rainforest' },
    WATER: { type: 'water', color: '#3498db', label: 'Water' }
};

// GAME STATE
let map = [];
let units = [];
let cities = [];
let floatingTexts = []; // { x, y, text, color, life, maxLife }
let turn = 1;
let isPlayerTurn = true;
let selectedTile = null;
let gameOver = false;

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
    turn = 1;
    isPlayerTurn = true;
    gameOver = false;
    selectedTile = null;

    spawnEntities();
    updateUI();
    
    // Start animation loop
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
            // Random terrain generation
            const rand = Math.random();
            let terrain;
            
            if (rand < 0.2) terrain = TERRAIN.WATER;
            else if (rand < 0.5) terrain = TERRAIN.PLAINS;
            else if (rand < 0.8) terrain = TERRAIN.RAINFOREST;
            else terrain = TERRAIN.TUNDRA;

            row.push({ x, y, terrain });
        }
        newMap.push(row);
    }
    return newMap;
}

function spawnEntities() {
    // Helper to find valid spawn (not water)
    function getValidSpawn(minY, maxY) {
        let x, y;
        do {
            x = Math.floor(Math.random() * GRID_SIZE);
            y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        } while (map[y][x].terrain === TERRAIN.WATER);
        return { x, y };
    }

    // Player (Bottom half)
    const playerStart = getValidSpawn(6, 9);
    cities.push({ x: playerStart.x, y: playerStart.y, owner: 'player', color: '#00ffff' });
    units.push({ x: playerStart.x, y: playerStart.y, owner: 'player', moves: 1, color: '#0000ff', hp: 50, maxHp: 50 });

    // AI (Top half)
    const aiStart = getValidSpawn(0, 3);
    cities.push({ x: aiStart.x, y: aiStart.y, owner: 'ai', color: '#e74c3c' });
    units.push({ x: aiStart.x, y: aiStart.y, owner: 'ai', moves: 1, color: '#c0392b', hp: 50, maxHp: 50 });
}

// --- HELPER FUNCTIONS ---

// Approximate normal distribution using Box-Muller transform
function randomNormal(mean, stdDev) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    num = num * stdDev + mean;
    return Math.round(num);
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
        ft.y -= 0.02; // Float up
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Map
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const tile = map[y][x];
            
            // Base Terrain
            ctx.fillStyle = tile.terrain.color;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            // Grid Lines (subtle)
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // Draw Cities
    cities.forEach(city => {
        // City shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(city.x * TILE_SIZE + 10, city.y * TILE_SIZE + 10, TILE_SIZE - 10, TILE_SIZE - 10);
        
        // City body
        ctx.fillStyle = city.color;
        const padding = 12;
        ctx.fillRect(
            city.x * TILE_SIZE + padding, 
            city.y * TILE_SIZE + padding, 
            TILE_SIZE - padding * 2, 
            TILE_SIZE - padding * 2
        );
        
        // City Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            city.x * TILE_SIZE + padding, 
            city.y * TILE_SIZE + padding, 
            TILE_SIZE - padding * 2, 
            TILE_SIZE - padding * 2
        );
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(city.owner === 'player' ? 'P' : 'AI', city.x * TILE_SIZE + TILE_SIZE/2, city.y * TILE_SIZE + TILE_SIZE/2 + 4);
    });

    // Draw Selection Highlight
    if (selectedTile) {
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 4;
        ctx.strokeRect(selectedTile.x * TILE_SIZE, selectedTile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
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

        // Unit Border
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        // Moves Indicator (Dot in center if has moves)
        if (unit.moves > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }

        // HP Bar
        const barWidth = TILE_SIZE - 10;
        const barHeight = 6;
        const barX = unit.x * TILE_SIZE + 5;
        const barY = unit.y * TILE_SIZE - 8;
        
        // Background
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health
        const hpPercent = Math.max(0, unit.hp / unit.maxHp);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
        
        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // HP Text
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.strokeText(unit.hp, cx, barY - 2);
        ctx.fillText(unit.hp, cx, barY - 2);
    });

    // Draw Floating Texts
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life / ft.maxLife;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 20px Arial';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x * TILE_SIZE + TILE_SIZE/2, ft.y * TILE_SIZE + TILE_SIZE/2);
        ctx.fillText(ft.text, ft.x * TILE_SIZE + TILE_SIZE/2, ft.y * TILE_SIZE + TILE_SIZE/2);
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
    const playerUnit = units.find(u => u.owner === 'player');
    
    // Select tile
    selectedTile = clickedTile;
    updateInfoPanel(clickedTile);

    if (!playerUnit) return; // Should not happen if game is running

    // Move Logic
    const dx = Math.abs(playerUnit.x - x);
    const dy = Math.abs(playerUnit.y - y);
    const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (isAdjacent && playerUnit.moves > 0 && clickedTile.terrain !== TERRAIN.WATER) {
        attemptMove(playerUnit, x, y);
    }
}

function attemptMove(unit, targetX, targetY) {
    const enemy = units.find(u => u.x === targetX && u.y === targetY && u.owner !== unit.owner);
    
    if (enemy) {
        resolveCombat(unit, enemy);
    } else {
        unit.x = targetX;
        unit.y = targetY;
        unit.moves--;
        checkWinCondition();
    }
}

function resolveCombat(attacker, defender) {
    // 1. Calculate Damage to Defender
    // Base avg 10. 
    // Tundra: avg 12. Rainforest: avg 8.
    
    const defenderTile = map[defender.y][defender.x];
    let meanDamage = 10;
    
    if (defenderTile.terrain.type === 'tundra') meanDamage = 12;
    if (defenderTile.terrain.type === 'rainforest') meanDamage = 8;
    
    const damageToDefender = Math.max(0, randomNormal(meanDamage, 2)); // StdDev 2 for some variance
    
    // 2. Calculate Damage to Attacker
    // "always around 10"
    const damageToAttacker = Math.max(0, randomNormal(10, 2));

    // 3. Apply Damage
    defender.hp -= damageToDefender;
    attacker.hp -= damageToAttacker;
    
    // 4. Visuals (Floating Text)
    // Damage numbers
    floatingTexts.push({
        x: defender.x,
        y: defender.y,
        text: `-${damageToDefender}`,
        color: '#e74c3c',
        life: 60,
        maxLife: 60
    });
    
    floatingTexts.push({
        x: attacker.x,
        y: attacker.y,
        text: `-${damageToAttacker}`,
        color: '#e74c3c',
        life: 60,
        maxLife: 60
    });
    
    // Attacker loses move
    attacker.moves--;

    // 5. Check Death
    if (attacker.hp <= 0 || defender.hp <= 0) {
        // Find who died
        if (attacker.hp <= 0 && defender.hp <= 0) {
             // Both died - draw? or who died first?
             // Prompt says: "if either unit is killed that player loses"
             // If both die, maybe just end game based on who attacked? 
             // Let's say if Player dies, Player loses.
             if (attacker.owner === 'player') endGame("YOU DIED!", "defeat");
             else endGame("YOU WON!", "victory");
        } else if (attacker.hp <= 0) {
             endGame(attacker.owner === 'player' ? "YOU DIED!" : "YOU WON!", attacker.owner === 'player' ? "defeat" : "victory");
        } else if (defender.hp <= 0) {
             endGame(defender.owner === 'player' ? "YOU DIED!" : "YOU WON!", defender.owner === 'player' ? "defeat" : "victory");
        }
        
        // Remove dead units
        units = units.filter(u => u.hp > 0);
    }
}

// --- GAME LOGIC ---

function checkWinCondition() {
    const playerUnit = units.find(u => u.owner === 'player');
    const aiUnit = units.find(u => u.owner === 'ai');
    
    if (!playerUnit || !aiUnit) return; // Handled in combat resolution

    const playerCity = cities.find(c => c.owner === 'player');
    const aiCity = cities.find(c => c.owner === 'ai');

    if (playerUnit.x === aiCity.x && playerUnit.y === aiCity.y) {
        endGame("CITY CAPTURED!", "victory");
    } else if (aiUnit.x === playerCity.x && aiUnit.y === playerCity.y) {
        endGame("CITY LOST!", "defeat");
    }
}

function endGame(message, type) {
    if (gameOver) return; // Prevent double ending
    gameOver = true;
    const color = type === 'victory' ? '#2ecc71' : '#e74c3c';
    
    // One final draw to show dead units removed or HP updated
    draw(); 
    
    // Overlay text on canvas
    setTimeout(() => { // Slight delay to let animation finish a frame
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = color;
        ctx.font = '60px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(type === 'victory' ? 'VICTORY' : 'DEFEAT', canvas.width/2, canvas.height/2);
        
        playerDisplay.textContent = message;
        playerDisplay.style.color = color;
        
        endTurnBtn.disabled = true;
        restartBtn.style.display = 'block';
    }, 100);
}

function updateInfoPanel(tile) {
    let content = `
        <p><strong>Pos:</strong> (${tile.x}, ${tile.y})</p>
        <p><strong>Terrain:</strong> <span style="color:${tile.terrain.color}; text-shadow: 1px 1px 0 #000;">${tile.terrain.label}</span></p>
    `;

    // Check for units/cities
    const unit = units.find(u => u.x === tile.x && u.y === tile.y);
    const city = cities.find(c => c.x === tile.x && c.y === tile.y);

    if (city) content += `<p><strong>City:</strong> ${city.owner.toUpperCase()}</p>`;
    if (unit) {
        content += `<p><strong>Unit:</strong> ${unit.owner.toUpperCase()}</p>`;
        content += `<p><strong>HP:</strong> ${unit.hp}/${unit.maxHp}</p>`;
    }

    tileInfoDisplay.innerHTML = content;
}

function updateUI() {
    turnDisplay.textContent = `Turn: ${turn}`;
    playerDisplay.textContent = isPlayerTurn ? "Player's Turn" : "AI Thinking...";
    playerDisplay.className = isPlayerTurn ? "player-turn" : "enemy-turn";
    endTurnBtn.disabled = !isPlayerTurn || gameOver;
}

// --- TURN SYSTEM ---

endTurnBtn.addEventListener('click', () => {
    if (!isPlayerTurn || gameOver) return;
    
    isPlayerTurn = false;
    updateUI();
    
    setTimeout(aiTurn, 1000); // Small delay for "thinking"
});

function aiTurn() {
    if (gameOver) return;

    const aiUnit = units.find(u => u.owner === 'ai');
    const playerUnit = units.find(u => u.owner === 'player');
    const playerCity = cities.find(c => c.owner === 'player');
    
    if (!aiUnit) return; // AI dead

    // AI LOGIC: 
    // 1. If can attack player, do it (aggressive)
    // 2. Else move towards city
    
    const moves = [
        { x: aiUnit.x, y: aiUnit.y - 1 }, // Up
        { x: aiUnit.x, y: aiUnit.y + 1 }, // Down
        { x: aiUnit.x - 1, y: aiUnit.y }, // Left
        { x: aiUnit.x + 1, y: aiUnit.y }  // Right
    ];

    let bestMove = null;
    let minDist = Infinity;
    let attackMove = null;

    for (let move of moves) {
        // Boundary Check
        if (move.x < 0 || move.x >= GRID_SIZE || move.y < 0 || move.y >= GRID_SIZE) continue;
        
        // Water Check
        if (map[move.y][move.x].terrain === TERRAIN.WATER) continue;

        // Check if player is here
        if (playerUnit && move.x === playerUnit.x && move.y === playerUnit.y) {
            attackMove = move;
            break; // Always prioritize attack
        }

        // Calculate distance to target (City)
        const dist = Math.abs(move.x - playerCity.x) + Math.abs(move.y - playerCity.y);
        
        if (dist < minDist) {
            minDist = dist;
            bestMove = move;
        }
    }

    if (attackMove) {
        attemptMove(aiUnit, attackMove.x, attackMove.y);
    } else if (bestMove) {
        attemptMove(aiUnit, bestMove.x, bestMove.y);
    } else {
        console.log("AI stuck!");
    }

    if (gameOver) return;

    // End AI Turn
    turn++;
    isPlayer