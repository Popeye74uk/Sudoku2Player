/**
 * Firebase Configuration & Multiplayer Sync
 * Handles real-time game synchronization between two players.
 * Falls back transparently to a Zero-Config Local Network HTTP+SSE Server if Firebase is not set up.
 */
(function () {
  'use strict';

  /* ────────────────────────────────────────────
   * Firebase Configuration
   * ──────────────────────────────────────────── 
   * Update these values with your own Firebase project config.
   * You can get them from: https://console.firebase.google.com
   * → Select your project → Project Settings → General → Your apps → Config
   */
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  };

  let db = null;
  let isFirebaseAvailable = false;
  let isLocalServerAvailable = false;
  let serverUrl = '';

  /**
   * Initializes the synchronization server URL.
   * Reads from localStorage if saved previously, otherwise defaults to port 8080.
   *
   * @returns {void}
   */
  function initServerUrl() {
    const savedUrl = localStorage.getItem('sudoku_sync_server_url');
    if (savedUrl) {
      serverUrl = savedUrl;
      console.log(`[Multiplayer] Using saved Server URL: ${serverUrl}`);
      return;
    }

    if (window.location.protocol === 'file:') {
      serverUrl = 'http://localhost:8080';
    } else {
      serverUrl = window.location.origin;
    }
    console.log(`[Multiplayer] Default Server URL: ${serverUrl}`);
  }

  /**
   * Gets the current synchronization server URL.
   *
   * @returns {string} The active server URL string.
   */
  function getServerUrl() {
    return serverUrl;
  }

  /**
   * Validates and sets a new synchronization server URL.
   * Formats missing protocols, saves to local storage, and terminates active SSE links.
   *
   * @param {string} url - The raw server URL input.
   * @returns {boolean} `true` if url was valid and set successfully.
   */
  function setServerUrl(url) {
    if (!url) return false;
    let formatted = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = 'http://' + formatted;
    }
    serverUrl = formatted;
    localStorage.setItem('sudoku_sync_server_url', serverUrl);
    console.log(`[Multiplayer] Server URL updated to: ${serverUrl}`);
    disconnectSSE();
    return true;
  }

  /**
   * Sends an asynchronous ping to verify server connectivity.
   *
   * @param {string} url - The target server URL to check.
   * @returns {Promise<boolean>} Resolves to `true` if server responded with success.
   */
  async function pingServer(url) {
    if (!url) return false;
    let formatted = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = 'http://' + formatted;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const res = await fetch(`${formatted}/api/ping`, {
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);
      if (!res.ok) return false;
      const data = await res.json();
      return data.success === true;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[Multiplayer] Ping failed to ${formatted}:`, err.message);
      return false;
    }
  }

  /**
   * Fetches the prioritize-sorted local network IP addresses from the active sync server.
   *
   * @returns {Promise<string[]>} Resolves to an array of IP address strings.
   */
  async function fetchNetworkIPs() {
    try {
      const res = await fetch(`${serverUrl}/api/network-ips`, { mode: 'cors' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.ips || [];
    } catch (err) {
      console.warn('[Multiplayer] Failed to fetch server network IPs:', err.message);
      return [];
    }
  }

  
  // SSE fallbacks state
  let myPlayerId = null;
  let sseSource = null;
  let isConnected = false;
  
  const connectionCallbacks = new Set();
  const sseCallbacks = {
    player_joined: new Set(),
    state_update: new Set()
  };

  /**
   * Initialize Multiplayer system.
   * Checks for active Firebase configuration, falling back to local sync server if not set up.
   */
  function initFirebase() {
    initServerUrl();
    try {
      // 1. Check if Firebase is defined and has credentials
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
          firebase.initializeApp(firebaseConfig);
          db = firebase.database();
          isFirebaseAvailable = true;
          console.log('[Multiplayer] Online Firebase initialized successfully.');
          return true;
        }
      }
    } catch (e) {
      console.warn('[Multiplayer] Firebase initialization failed:', e.message);
    }

    // 2. Default to Local Zero-Config Sync Server fallback
    isFirebaseAvailable = false;
    isLocalServerAvailable = true;
    console.log('[Multiplayer] Running in Zero-Config Local Network Fallback Mode.');
    return true;
  }

  /* ────────────────────────────────────────────
   * EventSource SSE Stream Manager (Local Network mode)
   * ──────────────────────────────────────────── */

  /**
   * Establishes a persistent Server-Sent Events (SSE) connection stream
   * to synchronise real-time game moves, connection events, and player additions.
   *
   * @param {string} roomCode - The active room code of the game.
   * @returns {void}
   */
  function ensureSSEConnected(roomCode) {
    if (sseSource) return;

    const playerId = myPlayerId || 'player1';
    console.log(`[Multiplayer] Connecting SSE stream for room ${roomCode}, player ${playerId}`);
    
    // Create new EventSource relative to custom server URL host
    sseSource = new EventSource(`${serverUrl}/api/events?roomCode=${roomCode}&playerId=${playerId}`);

    sseSource.onopen = () => {
      isConnected = true;
      connectionCallbacks.forEach(cb => {
        try { cb(true); } catch (err) { console.error(err); }
      });
    };

    sseSource.onerror = () => {
      isConnected = false;
      connectionCallbacks.forEach(cb => {
        try { cb(false); } catch (err) { console.error(err); }
      });
    };

    sseSource.addEventListener('player_joined', (e) => {
      try {
        const payload = JSON.parse(e.data);
        console.log('[Multiplayer] SSE Event -> player_joined:', payload.data);
        sseCallbacks.player_joined.forEach(cb => cb(payload.data));
      } catch (err) {
        console.error('[Multiplayer] SSE parse error on player_joined:', err);
      }
    });

    sseSource.addEventListener('state_update', (e) => {
      try {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        // Convert completed rows/cols/boxes lists back into JavaScript Sets
        if (data.players) {
          Object.keys(data.players).forEach(pId => {
            const p = data.players[pId];
            if (p.completedRows) p.completedRows = new Set(p.completedRows);
            if (p.completedCols) p.completedCols = new Set(p.completedCols);
            if (p.completedBoxes) p.completedBoxes = new Set(p.completedBoxes);
          });
        }
        
        sseCallbacks.state_update.forEach(cb => cb(data));
      } catch (err) {
        console.error('[Multiplayer] SSE parse error on state_update:', err);
      }
    });
  }

  /**
   * Severs the active Server-Sent Events stream link and resets status flags.
   *
   * @returns {void}
   */
  function disconnectSSE() {
    if (sseSource) {
      console.log('[Multiplayer] Severing SSE stream link.');
      sseSource.close();
      sseSource = null;
      isConnected = false;
      connectionCallbacks.forEach(cb => cb(false));
    }
  }


  /* ────────────────────────────────────────────
   * Room Matchmaking
   * ──────────────────────────────────────────── */

  /**
   * Creates a new game room in the active database store (Firebase or Local SSE).
   *
   * @param {object} gameState - The initial local game state to synchronise.
   * @returns {Promise<string>} The room code.
   */
  async function createRoom(gameState) {
    if (isFirebaseAvailable) {
      const serialized = window.GameManager.serializeGameState(gameState);
      const roomRef = db.ref('rooms/' + gameState.gameId);
      await roomRef.set(serialized);
      roomRef.onDisconnect().update({ 
        'players/player1/connected': false 
      });
      console.log('[Multiplayer] Firebase Room created:', gameState.gameId);
      return gameState.gameId;
    } 

    if (isLocalServerAvailable) {
      try {
        // Convert Sets in initial gameState to arrays for clean JSON transport
        const payload = {
          ...gameState,
          players: {
            player1: {
              ...gameState.players.player1,
              completedRows: Array.from(gameState.players.player1.completedRows || []),
              completedCols: Array.from(gameState.players.player1.completedCols || []),
              completedBoxes: Array.from(gameState.players.player1.completedBoxes || [])
            }
          }
        };

        const res = await fetch(`${serverUrl}/api/create-room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          mode: 'cors'
        });
        const result = await res.json();
        if (result.success) {
          console.log('[Multiplayer] Local Network Room created:', result.roomCode);
          return result.roomCode;
        }
      } catch (e) {
        console.error('[Multiplayer] Failed to create local network room:', e);
      }
      return gameState.gameId;
    }

    return gameState.gameId;
  }

  /**
   * Joins an existing game room under a specific player name.
   *
   * @param {string} roomCode - The unique 6-character room identifier.
   * @param {string} playerName - The joining player's display name.
   * @returns {Promise<object|null>} Deserialized GameState if successful, or null.
   */
  async function joinRoom(roomCode, playerName) {
    if (isFirebaseAvailable) {
      const roomRef = db.ref('rooms/' + roomCode);
      const snapshot = await roomRef.once('value');
      if (!snapshot.exists()) return null;
      const data = snapshot.val();
      if (data.players.player2) return null;

      const gameState = window.GameManager.deserializeGameState(data);
      window.GameManager.addPlayer2(gameState, playerName);
      const serialized = window.GameManager.serializeGameState(gameState);
      await roomRef.set(serialized);
      roomRef.child('players/player2').onDisconnect().update({ connected: false });
      return gameState;
    } 

    if (isLocalServerAvailable) {
      try {
        const res = await fetch(`${serverUrl}/api/join-room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerName }),
          mode: 'cors'
        });
        if (!res.ok) return null;
        const result = await res.json();
        if (result.success) {
          console.log('[Multiplayer] Local Network Room joined:', roomCode);
          return window.GameManager.deserializeGameState(result.gameState);
        }
      } catch (e) {
        console.error('[Multiplayer] Failed to join local network room:', e);
      }
    }

    return null;
  }

  /* ────────────────────────────────────────────
   * Real-time Sync & Listeners
   * ──────────────────────────────────────────── */

  /**
   * Synchronises a new player move, score progress, row/col completions, and game status.
   *
   * @param {string} roomCode - The unique 6-character room code.
   * @param {string} playerId - The active player identifier ('player1' or 'player2').
   * @param {object} playerData - The active player's sync state details.
   * @param {boolean[][]} scoredCells - 9x9 grid of scored cell flags.
   * @param {string} gameStatus - Current game status ('playing' | 'finished').
   * @param {string|null} winner - The ID of the winner, or 'tie', or null if active.
   * @returns {Promise<void>}
   */
  async function syncMove(roomCode, playerId, playerData, scoredCells, gameStatus, winner) {
    if (isFirebaseAvailable) {
      const updates = {};
      updates[`rooms/${roomCode}/players/${playerId}`] = playerData;
      updates[`rooms/${roomCode}/scoredCells`] = scoredCells;
      updates[`rooms/${roomCode}/status`] = gameStatus;
      if (winner) {
        updates[`rooms/${roomCode}/winner`] = winner;
        updates[`rooms/${roomCode}/endTime`] = Date.now();
      }
      await db.ref().update(updates);
      return;
    }

    if (isLocalServerAvailable) {
      try {
        const serializedPlayerData = {
          ...playerData,
          completedRows: Array.from(playerData.completedRows || []),
          completedCols: Array.from(playerData.completedCols || []),
          completedBoxes: Array.from(playerData.completedBoxes || [])
        };

        await fetch(`${serverUrl}/api/sync-move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            playerId,
            playerData: serializedPlayerData,
            scoredCells,
            status: gameStatus,
            winner
          }),
          mode: 'cors'
        });
      } catch (e) {
        console.error('[Multiplayer] Local Network move sync failed:', e);
      }
    }
  }

  /**
   * Registers a callback triggered when the opponent's stats update (Firebase-only).
   *
   * @param {string} roomCode - The unique room identifier.
   * @param {string} opponentId - The opponent's player identifier.
   * @param {function(object): void} callback - The handler callback.
   * @returns {function(): void} An unregister/cleanup function.
   */
  function onOpponentUpdate(roomCode, opponentId, callback) {
    if (isFirebaseAvailable) {
      const ref = db.ref(`rooms/${roomCode}/players/${opponentId}`);
      const handler = ref.on('value', (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.val());
        }
      });
      return () => ref.off('value', handler);
    }
    
    // In local network SSE mode, state updates cover all players inside state_update
    // So onOpponentUpdate is implicitly supported via onGameStateUpdate
    return () => {};
  }

  /**
   * Registers a callback triggered on any state update in the game room (SSE or Firebase).
   *
   * @param {string} roomCode - The unique room identifier.
   * @param {function(object): void} callback - The handler callback.
   * @returns {function(): void} An unregister/cleanup function.
   */
  function onGameStateUpdate(roomCode, callback) {
    if (isFirebaseAvailable) {
      const ref = db.ref(`rooms/${roomCode}`);
      const handler = ref.on('value', (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          callback({
            status: data.status,
            winner: data.winner,
            scoredCells: data.scoredCells,
            players: data.players,
            startTime: data.startTime,
            endTime: data.endTime
          });
        }
      });
      return () => ref.off('value', handler);
    }

    if (isLocalServerAvailable) {
      ensureSSEConnected(roomCode);
      sseCallbacks.state_update.add(callback);
      return () => {
        sseCallbacks.state_update.delete(callback);
        if (sseCallbacks.state_update.size === 0 && sseCallbacks.player_joined.size === 0) {
          disconnectSSE();
        }
      };
    }

    return () => {};
  }

  /**
   * Registers a callback triggered when Player 2 successfully joins the room.
   *
   * @param {string} roomCode - The unique room identifier.
   * @param {function(object): void} callback - The handler callback.
   * @returns {function(): void} An unregister/cleanup function.
   */
  function onPlayerJoined(roomCode, callback) {
    if (isFirebaseAvailable) {
      const ref = db.ref(`rooms/${roomCode}/players/player2`);
      const handler = ref.on('value', (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.val());
        }
      });
      return () => ref.off('value', handler);
    }

    if (isLocalServerAvailable) {
      ensureSSEConnected(roomCode);
      sseCallbacks.player_joined.add(callback);
      return () => {
        sseCallbacks.player_joined.delete(callback);
        if (sseCallbacks.state_update.size === 0 && sseCallbacks.player_joined.size === 0) {
          disconnectSSE();
        }
      };
    }

    return () => {};
  }

  /**
   * Deletes a game room from the database store (Firebase-only).
   *
   * @param {string} roomCode - The room code to clean up.
   * @returns {Promise<void>}
   */
  async function cleanupRoom(roomCode) {
    if (isFirebaseAvailable) {
      await db.ref('rooms/' + roomCode).remove();
    }
  }

  /**
   * Registers a callback triggered when our device's network connection status changes.
   *
   * @param {function(boolean): void} callback - Handler callback receiving connectivity state.
   * @returns {function(): void} An unregister/cleanup function.
   */
  function onConnectionChange(callback) {
    if (isFirebaseAvailable) {
      const ref = db.ref('.info/connected');
      const handler = ref.on('value', (snapshot) => {
        callback(snapshot.val() === true);
      });
      return () => ref.off('value', handler);
    }

    if (isLocalServerAvailable) {
      connectionCallbacks.add(callback);
      // Immediately notify with current network connection state
      callback(isConnected);
      return () => {
        connectionCallbacks.delete(callback);
      };
    }

    callback(false);
    return () => {};
  }

  /**
   * Sets our local player ID context.
   *
   * @param {string|null} id - 'player1' or 'player2', or null to clear.
   * @returns {void}
   */
  function setPlayerId(id) {
    myPlayerId = id;
    console.log(`[Multiplayer] Player context set to: ${id}`);
  }

  /* ────────────────────────────────────────────
   * Public API
   * ──────────────────────────────────────────── */

  window.Multiplayer = {
    initFirebase,
    isAvailable: () => isFirebaseAvailable || isLocalServerAvailable,
    getServerUrl,
    setServerUrl,
    pingServer,
    fetchNetworkIPs,
    createRoom,
    joinRoom,
    syncMove,
    onOpponentUpdate,
    onGameStateUpdate,
    onPlayerJoined,
    onConnectionChange,
    cleanupRoom,
    setPlayerId,
    disconnect: disconnectSSE
  };


})();
