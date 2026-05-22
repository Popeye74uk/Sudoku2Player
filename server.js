/**
 * Sudoku Duel Native Sync & Static Server
 * A zero-dependency server hosting client assets and syncing multiplayer state.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;

// Simple mime types lookup
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// In-memory room store (roomCode -> gameState)
const rooms = new Map();
// SSE active connections map: roomCode -> Array of { playerId, res }
const connections = new Map();

/**
 * Broadcasts an SSE event to all connected players in a room
 */
function broadcastToRoom(roomCode, eventType, data) {
  const roomConnections = connections.get(roomCode);
  if (!roomConnections) return;

  const payload = JSON.stringify({ type: eventType, data });
  roomConnections.forEach(conn => {
    try {
      conn.res.write(`event: ${eventType}\ndata: ${payload}\n\n`);
    } catch (e) {
      console.error(`[Server] Broadcast fail to ${conn.playerId}:`, e.message);
    }
  });
}

const server = http.createServer((req, res) => {
  // Parse URL safely
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Set CORS headers for local testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. API Endpoints
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');

        // A. CREATE ROOM
        if (pathname === '/api/create-room') {
          const gameState = payload;
          const roomCode = gameState.gameId;
          rooms.set(roomCode, gameState);
          console.log(`[Server] Game Room Created: ${roomCode}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, roomCode }));
          return;
        }

        // B. JOIN ROOM
        if (pathname === '/api/join-room') {
          const { roomCode, playerName } = payload;
          const gameState = rooms.get(roomCode);
          if (!gameState) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Room not found' }));
            return;
          }
          if (gameState.players.player2) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Room is full' }));
            return;
          }

          // Initialize Player 2 state
          gameState.players.player2 = {
            name: playerName,
            score: 0,
            grid: JSON.parse(JSON.stringify(gameState.puzzle)), // Copy clues
            notes: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [])), // empty serialization arrays
            cellsPlaced: 0,
            correctPlacements: 0,
            incorrectPlacements: 0,
            completedRows: [],
            completedCols: [],
            completedBoxes: [],
            connected: true,
            lastCorrectTime: null,
            streakMultiplier: 1
          };
          gameState.status = 'playing';
          gameState.startTime = Date.now();

          rooms.set(roomCode, gameState);
          console.log(`[Server] Player 2 joined room ${roomCode}: ${playerName}`);

          // Alert Player 1 immediately
          broadcastToRoom(roomCode, 'player_joined', gameState.players.player2);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, gameState }));
          return;
        }

        // C. SYNC MOVE
        if (pathname === '/api/sync-move') {
          const { roomCode, playerId, playerData, scoredCells, status, winner } = payload;
          const gameState = rooms.get(roomCode);
          if (!gameState) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Room not found' }));
            return;
          }

          // Update active room stats
          gameState.players[playerId] = playerData;
          gameState.scoredCells = scoredCells;
          gameState.status = status;
          if (winner) {
            gameState.winner = winner;
            gameState.endTime = Date.now();
          }

          rooms.set(roomCode, gameState);

          // Broadcast state to opponent
          broadcastToRoom(roomCode, 'state_update', {
            status: gameState.status,
            winner: gameState.winner,
            scoredCells: gameState.scoredCells,
            players: gameState.players,
            startTime: gameState.startTime,
            endTime: gameState.endTime
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // Catch-all POST
        res.writeHead(404);
        res.end();
      } catch (err) {
        console.error('[Server] API error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
      }
    });
    return;
  }

  // 1.5 GET API Endpoints (Ping and Network IP discovery)
  if (req.method === 'GET' && pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, serverTime: Date.now() }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/network-ips') {
    const ips = getNetworkIPs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ips }));
    return;
  }

  // 2. Server-Sent Events (SSE) stream
  if (req.method === 'GET' && pathname === '/api/events') {
    const roomCode = parsedUrl.searchParams.get('roomCode');
    const playerId = parsedUrl.searchParams.get('playerId');

    if (!roomCode || !playerId) {
      res.writeHead(400);
      res.end('Missing parameters');
      return;
    }

    // Keep stream alive
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('\n');

    // Register connection
    if (!connections.has(roomCode)) {
      connections.set(roomCode, []);
    }
    const roomConns = connections.get(roomCode);
    const connObj = { playerId, res };
    roomConns.push(connObj);

    console.log(`[Server] Live SSE Link Established: ${playerId} in room ${roomCode}`);

    // Update connection status
    const gameState = rooms.get(roomCode);
    if (gameState && gameState.players[playerId]) {
      gameState.players[playerId].connected = true;
      rooms.set(roomCode, gameState);
      broadcastToRoom(roomCode, 'state_update', {
        status: gameState.status,
        winner: gameState.winner,
        scoredCells: gameState.scoredCells,
        players: gameState.players,
        startTime: gameState.startTime,
        endTime: gameState.endTime
      });
    }

    // Handle Client Disconnect
    req.on('close', () => {
      console.log(`[Server] Live SSE Link Severed: ${playerId} in room ${roomCode}`);
      
      const idx = roomConns.indexOf(connObj);
      if (idx !== -1) {
        roomConns.splice(idx, 1);
      }
      if (roomConns.length === 0) {
        connections.delete(roomCode);
      }

      // Mark player as offline in state
      const currentGameState = rooms.get(roomCode);
      if (currentGameState && currentGameState.players[playerId]) {
        currentGameState.players[playerId].connected = false;
        rooms.set(roomCode, currentGameState);
        broadcastToRoom(roomCode, 'state_update', {
          status: currentGameState.status,
          winner: currentGameState.winner,
          scoredCells: currentGameState.scoredCells,
          players: currentGameState.players,
          startTime: currentGameState.startTime,
          endTime: currentGameState.endTime
        });
      }
    });
    return;
  }

  // 3. Static File Server
  if (req.method === 'GET') {
    // Normalize path to prevent directory traversal
    let safePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    let filePath = path.join(__dirname, safePath);

    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(500);
          res.end(`Internal Error: ${err.code}`);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  }
});

// Locate Local Network IP addresses for friendly display (prioritizing physical Wi-Fi/Ethernet)
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const interfaceName in interfaces) {
    // Skip virtual interfaces commonly created by WSL, Docker, VMware, VirtualBox
    const isVirtual = /vbox|virtual|vmware|docker|wsl|hyper-v|vEthernet/i.test(interfaceName);
    
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        let priority = 2; // Default fallback
        
        if (isVirtual) {
          priority = 1; // Lowest priority
        } else if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
          priority = 10; // High priority standard home Wi-Fi/Ethernet subnets
        } else if (iface.address.startsWith('172.')) {
          priority = 5; // Medium priority (could be home network or virtual)
        }
        
        addresses.push({ address: iface.address, priority });
      }
    }
  }
  
  // Sort by priority descending
  addresses.sort((a, b) => b.priority - a.priority);
  
  return ['127.0.0.1', ...addresses.map(item => item.address)];
}

server.listen(PORT, () => {
  console.log('========================================================');
  console.log('   SUDOKU DUEL - 2-PLAYER SYNC & STATIC SERVER');
  console.log('========================================================');
  console.log(`[Server] Local server running at http://localhost:${PORT}`);
  console.log('[Server] To connect other devices (Wi-Fi), open:');
  const ips = getNetworkIPs();
  ips.forEach(ip => {
    if (ip !== '127.0.0.1') {
      console.log(`       -> http://${ip}:${PORT}`);
    }
  });
  console.log('========================================================\n');
});
