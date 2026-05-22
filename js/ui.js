/**
 * UI Renderer & Interaction Handler for Sudoku Duel
 * Manages all DOM rendering, user input, screen transitions, and visual state.
 */
(function () {
  'use strict';

  /* ────────────────────────────────────────────
   * State
   * ──────────────────────────────────────────── */

  let gameState = null;
  let myPlayerId = null; // 'player1' or 'player2'
  let selectedCell = null; // { row, col }
  let notesMode = false;
  let timerInterval = null;
  let unsubscribers = []; // Firebase listener cleanup
  let isLocalMode = false;

  /* ────────────────────────────────────────────
   * Screen Management
   * ──────────────────────────────────────────── */

  /**
   * Routes the user interface to show the specified screen and hides all others.
   *
   * @param {string} screenId - The HTML ID of the screen element to activate.
   * @returns {void}
   */
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
    }
  }

  /* ────────────────────────────────────────────
   * Lobby Screen
   * ──────────────────────────────────────────── */

  /**
   * Initializes event listeners and controls on the lobby screen.
   * Binds buttons for creating games, joining games, difficulty selection, and configuring settings.
   *
   * @returns {void}
   */
  function initLobby() {
    const createBtn = document.getElementById('btn-create');
    const joinBtn = document.getElementById('btn-join');
    const joinSubmitBtn = document.getElementById('btn-join-submit');
    const backBtns = document.querySelectorAll('.btn-back');
    const copyCodeBtn = document.getElementById('btn-copy-code');

    createBtn.addEventListener('click', handleCreateGame);
    joinBtn.addEventListener('click', () => {
      document.getElementById('lobby-main').classList.add('hidden');
      document.getElementById('lobby-join').classList.remove('hidden');
    });
    joinSubmitBtn.addEventListener('click', handleJoinGame);

    backBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('lobby-main').classList.remove('hidden');
        document.getElementById('lobby-join').classList.add('hidden');
        document.getElementById('lobby-waiting').classList.add('hidden');
      });
    });

    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        const code = document.getElementById('room-code-display').textContent;
        navigator.clipboard.writeText(code).then(() => {
          Effects.showToast('Room code copied!', 'success');
        });
      });
    }

    // Difficulty selector
    document.querySelectorAll('.diff-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Enter key on join code input
    const joinInput = document.getElementById('join-code-input');
    if (joinInput) {
      joinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleJoinGame();
      });
      // Auto-uppercase
      joinInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });
    }

    // Sync server settings widget bindings
    const toggleBtn = document.getElementById('btn-toggle-server-settings');
    const details = document.getElementById('server-settings-details');
    if (toggleBtn && details) {
      toggleBtn.addEventListener('click', () => {
        details.classList.toggle('hidden');
      });
    }

    const saveUrlBtn = document.getElementById('btn-save-server-url');
    const urlInput = document.getElementById('server-url-input');
    if (saveUrlBtn && urlInput) {
      saveUrlBtn.addEventListener('click', async () => {
        const newUrl = urlInput.value.trim();
        if (!newUrl) {
          Effects.showToast('Please enter a server URL', 'error');
          return;
        }
        saveUrlBtn.disabled = true;
        saveUrlBtn.textContent = 'Connect...';
        
        const success = window.Multiplayer.setServerUrl(newUrl);
        if (success) {
          await checkServerConnection();
          Effects.showToast('Server sync URL updated!', 'success');
        } else {
          Effects.showToast('Invalid URL format', 'error');
        }
        saveUrlBtn.disabled = false;
        saveUrlBtn.textContent = 'Connect';
      });
    }
  }

  /**
   * Handles the creation of a new Sudoku game room.
   * Generates a puzzle, instantiates local state, saves the room online or locally,
   * registers peer connection hooks, and updates the waiting screen UI.
   *
   * @returns {Promise<void>}
   */
  async function handleCreateGame() {
    const nameInput = document.getElementById('player-name-input');
    const playerName = nameInput.value.trim() || 'Player 1';
    const difficulty = document.querySelector('.diff-option.active')?.dataset.difficulty || 'medium';

    // Show loading
    const createBtn = document.getElementById('btn-create');
    createBtn.disabled = true;
    createBtn.textContent = 'Generating...';

    try {
      // Generate puzzle
      const engine = window.SudokuEngine;
      const solution = engine.generateCompleteSolution();
      const puzzle = engine.createPuzzle(solution, difficulty);
      const roomCode = window.GameManager.generateRoomCode();
      const timeBonusEnabled = document.getElementById('time-bonus-toggle')?.checked ?? true;

      // Create game state
      gameState = window.GameManager.createGameState({
        gameId: roomCode,
        puzzle: puzzle,
        solution: solution,
        difficulty: difficulty,
        player1Name: playerName,
        timeBonusEnabled: timeBonusEnabled
      });
      myPlayerId = 'player1';
      window.Multiplayer.setPlayerId(myPlayerId);

      // Try to create room in Firebase
      await window.Multiplayer.createRoom(gameState);

      // Show waiting screen with room code
      document.getElementById('lobby-main').classList.add('hidden');
      document.getElementById('lobby-waiting').classList.remove('hidden');
      document.getElementById('room-code-display').textContent = roomCode;

      // Set up local network discovery details & QR code
      if (window.Multiplayer.isAvailable()) {
        setupNetworkDiscovery(roomCode);
      }

      // Listen for player 2 joining
      if (window.Multiplayer.isAvailable()) {
        let unsub;
        unsub = window.Multiplayer.onPlayerJoined(roomCode, (player2Data) => {
          if (player2Data && player2Data.name) {
            // Player 2 joined!
            gameState.players.player2 = {
              name: player2Data.name,
              score: player2Data.score || 0,
              grid: player2Data.grid || engine.deepCopy(puzzle),
              notes: createEmptyNotesGrid(),
              cellsPlaced: 0,
              correctPlacements: 0,
              incorrectPlacements: 0,
              completedRows: new Set(),
              completedCols: new Set(),
              completedBoxes: new Set(),
              connected: true,
              streakMultiplier: player2Data.streakMultiplier || 1,
              lastCorrectTime: player2Data.lastCorrectTime || null
            };
            gameState.status = window.GameManager.GAME_STATUS.PLAYING;
            gameState.startTime = Date.now();
            startGame();
            
            if (typeof unsub === 'function') {
              unsub();
            } else {
              setTimeout(() => {
                if (typeof unsub === 'function') unsub();
              }, 0);
            }
          }
        });
        unsubscribers.push(unsub);
      }


      // Also support local play — start after a "Start Solo" button or wait
      const startSoloBtn = document.getElementById('btn-start-solo');
      if (startSoloBtn) {
        startSoloBtn.onclick = () => {
          // Start in local 2-player mode (same device) or single player practice
          isLocalMode = true;
          window.GameManager.addPlayer2(gameState, 'Player 2');
          startGame();
        };
      }
    } catch (err) {
      console.error('[UI] Failed to create game room:', err);
      Effects.showToast('Failed to initialize lobby. Check connection or Firebase rules.', 'error');
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = 'Create Game';
    }
  }

  /**
   * Handles joining an existing Sudoku game room.
   * Validates the inputs, sends a matchmaking request to the Multiplayer module,
   * sets active player contexts, and initiates the game screen.
   *
   * @returns {Promise<void>}
   */
  async function handleJoinGame() {
    const nameInput = document.getElementById('join-name-input');
    const codeInput = document.getElementById('join-code-input');
    const playerName = nameInput.value.trim() || 'Player 2';
    const roomCode = codeInput.value.trim().toUpperCase();

    if (roomCode.length !== 6) {
      Effects.showToast('Please enter a valid 6-character room code', 'error');
      return;
    }

    const joinBtn = document.getElementById('btn-join-submit');
    joinBtn.disabled = true;
    joinBtn.textContent = 'Joining...';

    try {
      if (window.Multiplayer.isAvailable()) {
        const result = await window.Multiplayer.joinRoom(roomCode, playerName);
        if (result) {
          gameState = result;
          myPlayerId = 'player2';
          window.Multiplayer.setPlayerId(myPlayerId);
          startGame();
        } else {
          Effects.showToast('Room not found or already full', 'error');
        }
      } else {
        Effects.showToast('Multiplayer not available. Create a game to play locally.', 'error');
      }
    } catch (err) {
      console.error('[UI] Failed to join room:', err);
      Effects.showToast('Error joining room. Check server/database connection.', 'error');
    } finally {
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Game';
    }
  }

  /**
   * Factory function that creates a fresh 9x9 grid populated with empty Sets for pencil notes.
   *
   * @returns {Set<number>[][]} A 9x9 grid of empty Sets representing pencil notes.
   */
  function createEmptyNotesGrid() {
    return Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
  }

  /* ────────────────────────────────────────────
   * Game Initialization
   * ──────────────────────────────────────────── */

  /**
   * Transitions the application into active gameplay mode.
   * Renders the board, renders the number pad, sets up scoring indicators,
   * starts the game clock timer, and registers dynamic network synchronisation hooks.
   *
   * @returns {void}
   */
  function startGame() {
    showScreen('game-screen');
    renderBoard();
    renderNumberPad();
    renderPlayerCards();
    startTimer();
    setupMultiplayerListeners();
    Effects.showToast('Game started! Good luck!', 'info');

    // Show/hide same-device local turn switcher banner
    const turnBanner = document.getElementById('local-turn-banner');
    if (turnBanner) {
      if (isLocalMode) {
        turnBanner.classList.remove('hidden');
      } else {
        turnBanner.classList.add('hidden');
      }
    }
  }

  /* ────────────────────────────────────────────
   * Board Rendering
   * ──────────────────────────────────────────── */

  /**
   * Renders the entire Sudoku 9x9 board using a highly optimized
   * in-memory DocumentFragment buffer to minimize browser paint reflows.
   *
   * @returns {void}
   */
  function renderBoard() {
    const board = document.getElementById('sudoku-board');
    if (!board) return;

    const fragment = document.createDocumentFragment();
    const player = gameState.players[myPlayerId];

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = document.createElement('div');
        cell.classList.add('sudoku-cell');
        cell.dataset.row = row;
        cell.dataset.col = col;

        const isGiven = gameState.puzzle[row][col] !== 0;
        const value = player.grid[row][col];

        if (isGiven) {
          cell.classList.add('given');
          const valueEl = document.createElement('span');
          valueEl.classList.add('cell-value');
          valueEl.textContent = value;
          cell.appendChild(valueEl);
        } else if (value !== 0) {
          const valueEl = document.createElement('span');
          valueEl.classList.add('cell-value', 'player-entered');
          valueEl.textContent = value;

          // Check if it's correct
          if (value === gameState.solution[row][col]) {
            valueEl.classList.add('value-correct');
          } else {
            valueEl.classList.add('value-incorrect');
          }

          cell.appendChild(valueEl);
        } else {
          // Check if opponent solved it
          const oppId = myPlayerId === 'player1' ? 'player2' : 'player1';
          const oppData = gameState.players[oppId];
          const isOpponentSolved = oppData && oppData.grid[row][col] === gameState.solution[row][col];
          if (isOpponentSolved) {
            cell.classList.add('opponent-filled', oppId === 'player1' ? 'p1-filled' : 'p2-filled');
            
            const valueEl = document.createElement('span');
            valueEl.classList.add('cell-value', 'opponent-entered');
            valueEl.textContent = gameState.solution[row][col];
            cell.appendChild(valueEl);
          } else {
            // Show notes
            const notes = player.notes[row][col];
            if (notes && notes.size > 0) {
              const notesGrid = document.createElement('div');
              notesGrid.classList.add('cell-notes');
              for (let n = 1; n <= 9; n++) {
                const noteEl = document.createElement('span');
                noteEl.classList.add('note-num');
                noteEl.textContent = notes.has(n) ? n : '';
                notesGrid.appendChild(noteEl);
              }
              cell.appendChild(notesGrid);
            }
          }
        }

        // Box border classes
        if (col % 3 === 2 && col !== 8) cell.classList.add('box-right');
        if (col % 3 === 0 && col !== 0) cell.classList.add('box-left');
        if (row % 3 === 2 && row !== 8) cell.classList.add('box-bottom');
        if (row % 3 === 0 && row !== 0) cell.classList.add('box-top');

        // Click handler
        cell.addEventListener('click', () => handleCellClick(row, col));

        fragment.appendChild(cell);
      }
    }

    board.innerHTML = '';
    board.appendChild(fragment);

    // Re-apply selection highlights if a cell is selected
    if (selectedCell) {
      updateHighlights();
    }
  }

  /**
   * Click handler for a board cell. Sets selection parameters.
   *
   * @param {number} row - The row index of the clicked cell (0-8).
   * @param {number} col - The column index of the clicked cell (0-8).
   * @returns {void}
   */
  function handleCellClick(row, col) {
    selectedCell = { row, col };
    updateHighlights();
  }

  /**
   * Refreshes target selections and active sub-element row, column,
   * box, and same-digit highlight classes in-place.
   *
   * @returns {void}
   */
  function updateHighlights() {
    if (!selectedCell) return;

    const { row, col } = selectedCell;
    const player = gameState.players[myPlayerId];
    const selectedValue = player.grid[row][col];

    document.querySelectorAll('.sudoku-cell').forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);

      cell.classList.remove('selected', 'highlighted', 'same-number');

      if (r === row && c === col) {
        cell.classList.add('selected');
      }

      // Highlight same row, column, and box
      const sameRow = r === row;
      const sameCol = c === col;
      const sameBox = Math.floor(r / 3) === Math.floor(row / 3) &&
                       Math.floor(c / 3) === Math.floor(col / 3);

      if ((sameRow || sameCol || sameBox) && !(r === row && c === col)) {
        cell.classList.add('highlighted');
      }

      // Highlight same number
      if (selectedValue !== 0 && player.grid[r][c] === selectedValue && !(r === row && c === col)) {
        cell.classList.add('same-number');
      }
    });
  }

  /* ────────────────────────────────────────────
   * Number Pad
   * ──────────────────────────────────────────── */

  /**
   * Renders the digits 1-9 number pad, Erase, and Notes controls
   * using a highly optimized in-memory DocumentFragment buffer.
   *
   * @returns {void}
   */
  function renderNumberPad() {
    const pad = document.getElementById('number-pad');
    if (!pad) return;

    const fragment = document.createDocumentFragment();
    const player = gameState.players[myPlayerId];

    // Count how many of each number are placed
    const counts = {};
    for (let n = 1; n <= 9; n++) counts[n] = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = player.grid[r][c];
        if (v !== 0) counts[v]++;
      }
    }

    // Number buttons 1-9
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement('button');
      btn.classList.add('num-btn');
      btn.textContent = n;
      btn.dataset.num = n;

      if (counts[n] >= 9) {
        btn.classList.add('completed');
      }

      btn.addEventListener('click', () => handleNumberInput(n));
      fragment.appendChild(btn);
    }

    // Erase button
    const eraseBtn = document.createElement('button');
    eraseBtn.classList.add('num-btn', 'erase');
    eraseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg><span class="btn-text">Erase</span>';
    eraseBtn.title = 'Erase';
    eraseBtn.addEventListener('click', () => handleNumberInput(0));
    fragment.appendChild(eraseBtn);

    // Notes toggle
    const notesBtn = document.createElement('button');
    notesBtn.classList.add('num-btn', 'notes');
    notesBtn.id = 'btn-notes-toggle';
    if (notesMode) notesBtn.classList.add('active');
    notesBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span class="btn-text">Notes</span>';
    notesBtn.title = 'Toggle Notes';
    notesBtn.addEventListener('click', () => {
      notesMode = !notesMode;
      notesBtn.classList.toggle('active', notesMode);
      Effects.showToast(notesMode ? 'Notes mode ON' : 'Notes mode OFF', 'info', 1500);
    });
    fragment.appendChild(notesBtn);

    pad.innerHTML = '';
    pad.appendChild(fragment);
  }

  /**
   * Processes player inputs for digits or erasures on the board.
   * Disallows modifying clue cells or cells solved by the opponent.
   * Triggers point tallies, milestone visual explosions/popups, pencil-note auto-erasures,
   * local database pushes, and final completion checkers.
   *
   * @param {number} num - The chosen number (1-9), or 0 to erase the value in the active cell.
   * @returns {void}
   */
  function handleNumberInput(num) {
    if (!selectedCell) {
      Effects.showToast('Select a cell first', 'info', 1500);
      return;
    }
    if (gameState.status !== window.GameManager.GAME_STATUS.PLAYING) return;

    const { row, col } = selectedCell;

    // Can't modify given cells
    if (gameState.puzzle[row][col] !== 0) {
      Effects.showToast("Can't modify clue cells", 'error', 1500);
      return;
    }

    // Can't modify cells already solved by the opponent
    const oppId = myPlayerId === 'player1' ? 'player2' : 'player1';
    const oppData = gameState.players[oppId];
    const isOpponentSolved = oppData && oppData.grid[row][col] === gameState.solution[row][col];
    if (isOpponentSolved) {
      Effects.showToast("Opponent already solved this cell!", 'error', 1500);
      return;
    }

    const cellEl = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);

    // Notes mode
    if (notesMode && num !== 0) {
      window.GameManager.toggleNote(gameState, myPlayerId, row, col, num);
      renderBoard();
      updateHighlights();
      return;
    }

    // Process the move
    const result = window.GameManager.processMove(gameState, myPlayerId, row, col, num);

    if (!result.success) return;

    // Visual feedback
    if (num !== 0) {
      if (result.isCorrect) {
        Effects.flashCorrect(cellEl);
        if (result.pointsEarned > 0) {
          const streakMultiplier = result.streakMultiplier || 1;
          const streakBonuses = [];
          if (streakMultiplier > 1) {
            streakBonuses.push(`🔥 x${streakMultiplier} Streak!`);
            Effects.showToast(`🔥 x${streakMultiplier} Streak Multiplier!`, 'streak');
          }
          Effects.showScorePopup(cellEl, result.pointsEarned, streakBonuses);
        }

        // Bonus effects
        result.bonuses.forEach(bonus => {
          if (bonus.type === 'row' || bonus.type === 'col' || bonus.type === 'box') {
            Effects.flashCompletion(bonus.type, bonus.index);
            Effects.showToast(`🎉 ${bonus.type.charAt(0).toUpperCase() + bonus.type.slice(1)} complete! +${bonus.points}`, 'bonus');
          } else if (bonus.type === 'last_cell') {
            Effects.showToast('🏆 Board complete! +200 bonus!', 'bonus');
          }
        });

        // Particle burst on correct
        const rect = cellEl.getBoundingClientRect();
        Effects.particleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'hsl(145, 70%, 50%)');
      } else {
        Effects.flashIncorrect(cellEl);
        if (result.pointsEarned < 0) {
          Effects.showScorePopup(cellEl, result.pointsEarned);
        }
      }
    }

    // Re-render board & update scores
    renderBoard();
    updateHighlights();
    updateScores();
    renderNumberPad(); // Update completed number counts

    // Sync to Firebase
    syncToFirebase();

    // Check if game is finished
    if (result.gameFinished) {
      endGame();
    }
  }

  /* ────────────────────────────────────────────
   * Player Cards
   * ──────────────────────────────────────────── */

  /**
   * Renders the status cards for both players.
   * Displays nicknames, avatars, current scores, percentage solved bars, active turn glowing borders,
   * and network active/disconnected flags. Maps P1 on the left and P2 on the right.
   *
   * @returns {void}
   */
  function renderPlayerCards() {
    const leftPlayerId = isLocalMode ? 'player1' : myPlayerId;
    const rightPlayerId = isLocalMode ? 'player2' : (myPlayerId === 'player1' ? 'player2' : 'player1');

    const leftData = gameState.players[leftPlayerId];
    const rightData = gameState.players[rightPlayerId];

    // Self card (left)
    const selfCard = document.getElementById('self-card');
    if (selfCard && leftData) {
      selfCard.querySelector('.player-avatar').textContent = leftData.name.charAt(0).toUpperCase();
      selfCard.querySelector('.player-name').textContent = leftData.name;
      selfCard.querySelector('.player-score').textContent = leftData.score;
      const leftProgress = window.GameManager.getProgress(gameState, leftPlayerId);
      selfCard.querySelector('.progress-fill').style.width = `${leftProgress}%`;
      selfCard.querySelector('.progress-text').textContent = `${leftProgress}%`;

      const badgeEl = selfCard.querySelector('.player-badge');
      if (badgeEl) {
        badgeEl.textContent = isLocalMode ? 'P1' : 'YOU';
      }

      // Streak badge
      const streakEl = selfCard.querySelector('.player-streak');
      if (streakEl) {
        if (leftData.streakMultiplier && leftData.streakMultiplier > 1) {
          streakEl.textContent = `🔥 x${leftData.streakMultiplier}`;
          streakEl.classList.remove('hidden');
        } else {
          streakEl.classList.add('hidden');
        }
      }

      // Active turn glowing class
      if (myPlayerId === leftPlayerId) {
        selfCard.classList.add('active-turn');
      } else {
        selfCard.classList.remove('active-turn');
      }

      // Connection status dot
      const dot = selfCard.querySelector('.player-active-dot');
      if (dot) {
        if (leftData.connected === false) {
          dot.classList.add('disconnected');
        } else {
          dot.classList.remove('disconnected');
        }
      }
    }

    // Opponent card (right)
    const oppCard = document.getElementById('opponent-card');
    if (oppCard && rightData) {
      oppCard.querySelector('.player-avatar').textContent = rightData.name.charAt(0).toUpperCase();
      oppCard.querySelector('.player-name').textContent = rightData.name;
      oppCard.querySelector('.player-score').textContent = rightData.score;
      const rightProgress = window.GameManager.getProgress(gameState, rightPlayerId);
      oppCard.querySelector('.progress-fill').style.width = `${rightProgress}%`;
      oppCard.querySelector('.progress-text').textContent = `${rightProgress}%`;
      oppCard.classList.remove('waiting');

      const badgeEl = oppCard.querySelector('.player-badge');
      if (badgeEl) {
        badgeEl.textContent = isLocalMode ? 'P2' : 'OPP';
      }

      // Streak badge
      const streakEl = oppCard.querySelector('.player-streak');
      if (streakEl) {
        if (rightData.streakMultiplier && rightData.streakMultiplier > 1) {
          streakEl.textContent = `🔥 x${rightData.streakMultiplier}`;
          streakEl.classList.remove('hidden');
        } else {
          streakEl.classList.add('hidden');
        }
      }

      // Active turn glowing class
      if (myPlayerId === rightPlayerId) {
        oppCard.classList.add('active-turn');
      } else {
        oppCard.classList.remove('active-turn');
      }

      // Connection status dot
      const dot = oppCard.querySelector('.player-active-dot');
      if (dot) {
        if (rightData.connected === false) {
          dot.classList.add('disconnected');
        } else {
          dot.classList.remove('disconnected');
        }
      }
    } else if (oppCard) {
      oppCard.classList.add('waiting');
      oppCard.querySelector('.player-name').textContent = 'Waiting...';
      oppCard.classList.remove('active-turn');
      const streakEl = oppCard.querySelector('.player-streak');
      if (streakEl) streakEl.classList.add('hidden');
    }
  }

  /**
   * Animates player scores and updates the progress bar percentages smoothly.
   * Animates numbers in-place utilizing target easing counters.
   *
   * @returns {void}
   */
  function updateScores() {
    const leftPlayerId = isLocalMode ? 'player1' : myPlayerId;
    const rightPlayerId = isLocalMode ? 'player2' : (myPlayerId === 'player1' ? 'player2' : 'player1');

    const leftData = gameState.players[leftPlayerId];
    const rightData = gameState.players[rightPlayerId];

    const selfScoreEl = document.querySelector('#self-card .player-score');
    if (selfScoreEl && leftData) {
      const oldScore = parseInt(selfScoreEl.textContent) || 0;
      Effects.animateScore(selfScoreEl, oldScore, leftData.score);
    }

    if (leftData) {
      const leftProgress = window.GameManager.getProgress(gameState, leftPlayerId);
      const selfFill = document.querySelector('#self-card .progress-fill');
      if (selfFill) selfFill.style.width = `${leftProgress}%`;
      const selfText = document.querySelector('#self-card .progress-text');
      if (selfText) selfText.textContent = `${leftProgress}%`;

      const streakEl = document.querySelector('#self-card .player-streak');
      if (streakEl) {
        if (leftData.streakMultiplier && leftData.streakMultiplier > 1) {
          streakEl.textContent = `🔥 x${leftData.streakMultiplier}`;
          streakEl.classList.remove('hidden');
        } else {
          streakEl.classList.add('hidden');
        }
      }
    }

    if (rightData) {
      const oppScoreEl = document.querySelector('#opponent-card .player-score');
      if (oppScoreEl) {
        const oldOppScore = parseInt(oppScoreEl.textContent) || 0;
        Effects.animateScore(oppScoreEl, oldOppScore, rightData.score);
      }

      const rightProgress = window.GameManager.getProgress(gameState, rightPlayerId);
      const oppFill = document.querySelector('#opponent-card .progress-fill');
      if (oppFill) oppFill.style.width = `${rightProgress}%`;
      const oppText = document.querySelector('#opponent-card .progress-text');
      if (oppText) oppText.textContent = `${rightProgress}%`;

      const streakEl = document.querySelector('#opponent-card .player-streak');
      if (streakEl) {
        if (rightData.streakMultiplier && rightData.streakMultiplier > 1) {
          streakEl.textContent = `🔥 x${rightData.streakMultiplier}`;
          streakEl.classList.remove('hidden');
        } else {
          streakEl.classList.add('hidden');
        }
      }
    }
  }

  /* ────────────────────────────────────────────
   * Timer
   * ──────────────────────────────────────────── */

  /**
   * Starts or resumes the active game clock timer interval.
   * Tracks and formats elapsed seconds in real-time.
   *
   * @returns {void}
   */
  /**
   * Checks both players' streak multipliers in real-time.
   * If a player's streak has timed out (no correct solve within 10 seconds),
   * resets their multiplier and updates the UI accordingly. Handles clock-skew
   * resiliently for remote opponents.
   *
   * @returns {void}
   */
  function checkStreakTimeouts() {
    if (!gameState || !gameState.timeBonusEnabled || gameState.status !== window.GameManager.GAME_STATUS.PLAYING) return;

    let needsSync = false;
    let needsRender = false;
    const now = Date.now();

    for (const pid of ['player1', 'player2']) {
      const player = gameState.players[pid];
      if (player && player.streakMultiplier > 1) {
        let elapsed = 0;
        if (isLocalMode || pid === myPlayerId) {
          // Local player or pass-and-play: compare against lastCorrectTime directly
          if (player.lastCorrectTime) {
            elapsed = now - player.lastCorrectTime;
          } else {
            elapsed = 11000; // Force timeout if no timestamp
          }
        } else {
          // Remote opponent: use localReceivedTime if available to be immune to clock skew,
          // falling back to lastCorrectTime if localReceivedTime is not set.
          const baseTime = player.localReceivedTime || player.lastCorrectTime;
          if (baseTime) {
            elapsed = now - baseTime;
          } else {
            elapsed = 11000; // Force timeout if no timestamp
          }
        }

        if (elapsed > 10000) {
          player.streakMultiplier = 1;
          player.lastCorrectTime = null;
          player.localReceivedTime = null;
          needsRender = true;

          // If this is the local player, we need to sync the reset state to the server/opponent
          if (pid === myPlayerId) {
            needsSync = true;
          }
        }
      }
    }

    if (needsRender) {
      updateScores();
      renderPlayerCards();
    }
    if (needsSync) {
      syncToFirebase();
    }
  }

  /**
   * Starts or resumes the active game clock timer interval.
   * Tracks and formats elapsed seconds in real-time.
   *
   * @returns {void}
   */
  function startTimer() {
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (gameState.status === window.GameManager.GAME_STATUS.PLAYING) {
        const elapsed = window.GameManager.getElapsedSeconds(gameState);
        timerEl.textContent = window.GameManager.formatTime(elapsed);
        checkStreakTimeouts();
      }
    }, 1000);
  }

  /**
   * Stops and clears the active game clock timer interval.
   *
   * @returns {void}
   */
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  /* ────────────────────────────────────────────
   * Multiplayer Sync
   * ──────────────────────────────────────────── */

  /**
   * Registers real-time synchronization listeners for multiplayer mode.
   * Updates opponent cell entries, points progress, and handles sudden disconnection or completion flags.
   *
   * @returns {void}
   */
  function setupMultiplayerListeners() {
    if (!window.Multiplayer.isAvailable()) return;

    const oppId = myPlayerId === 'player1' ? 'player2' : 'player1';

    // Listen for opponent updates
    const unsub1 = window.Multiplayer.onGameStateUpdate(gameState.gameId, (data) => {
      if (!data) return;

      // Update opponent data
      if (data.players && data.players[oppId]) {
        const oppRemote = data.players[oppId];
        const localOpp = gameState.players[oppId];
        if (localOpp) {
          localOpp.score = oppRemote.score || 0;
          localOpp.grid = oppRemote.grid || localOpp.grid;
          localOpp.cellsPlaced = oppRemote.cellsPlaced || 0;
          localOpp.correctPlacements = oppRemote.correctPlacements || 0;
          localOpp.incorrectPlacements = oppRemote.incorrectPlacements || 0;
          localOpp.connected = oppRemote.connected !== false;
          if (oppRemote.completedRows) localOpp.completedRows = new Set(oppRemote.completedRows);
          if (oppRemote.completedCols) localOpp.completedCols = new Set(oppRemote.completedCols);
          if (oppRemote.completedBoxes) localOpp.completedBoxes = new Set(oppRemote.completedBoxes);
          
          // Track when we received a streak update to prevent clock-skew timeouts
          const oldMultiplier = localOpp.streakMultiplier || 1;
          const newMultiplier = oppRemote.streakMultiplier || 1;
          if (newMultiplier > 1 && (newMultiplier !== oldMultiplier || !localOpp.localReceivedTime)) {
            localOpp.localReceivedTime = Date.now();
          } else if (newMultiplier <= 1) {
            localOpp.localReceivedTime = null;
          }

          localOpp.streakMultiplier = newMultiplier;
          localOpp.lastCorrectTime = oppRemote.lastCorrectTime || null;
        }
        updateScores();
        renderPlayerCards();
        renderBoard(); // Force immediate redraw of opponent's newly solved cells
      }

      // Update scored cells
      if (data.scoredCells) {
        gameState.scoredCells = data.scoredCells;
      }

      // Check for game end
      if (data.status === window.GameManager.GAME_STATUS.FINISHED && gameState.status !== window.GameManager.GAME_STATUS.FINISHED) {
        gameState.status = window.GameManager.GAME_STATUS.FINISHED;
        gameState.winner = data.winner;
        gameState.endTime = data.endTime;
        endGame();
      }
    });

    unsubscribers.push(unsub1);

    // Listen for self connection state changes
    const unsubConn = window.Multiplayer.onConnectionChange((connected) => {
      if (gameState && gameState.players[myPlayerId]) {
        gameState.players[myPlayerId].connected = connected;
        renderPlayerCards();
        if (connected) {
          syncToFirebase();
        }
      }
    });

    unsubscribers.push(unsubConn);
  }

  /**
   * Formats and pushes the player's current local moves, scores, and completions
   * to the database server (Firebase real-time DB or local Node HTTP+SSE fallback).
   *
   * @returns {Promise<void>}
   */
  async function syncToFirebase() {
    if (!window.Multiplayer.isAvailable()) return;

    const player = gameState.players[myPlayerId];
    const playerData = {
      name: player.name,
      score: player.score,
      grid: player.grid,
      cellsPlaced: player.cellsPlaced,
      correctPlacements: player.correctPlacements,
      incorrectPlacements: player.incorrectPlacements,
      completedRows: Array.from(player.completedRows),
      completedCols: Array.from(player.completedCols),
      completedBoxes: Array.from(player.completedBoxes),
      connected: true,
      streakMultiplier: player.streakMultiplier || 1,
      lastCorrectTime: player.lastCorrectTime || null
    };

    await window.Multiplayer.syncMove(
      gameState.gameId,
      myPlayerId,
      playerData,
      gameState.scoredCells,
      gameState.status,
      gameState.winner
    );
  }

  /* ────────────────────────────────────────────
   * Game End / Results
   * ──────────────────────────────────────────── */

  /**
   * Terminates active gameplay and displays the results celebration screen.
   * Stops the countdown timer and schedules screen routing with a subtle delay.
   *
   * @returns {void}
   */
  function endGame() {
    stopTimer();
    gameState.status = window.GameManager.GAME_STATUS.FINISHED;

    // Small delay for dramatic effect
    setTimeout(() => {
      showScreen('results-screen');
      renderResults();
    }, 1000);
  }

  /**
   * Generates and renders final performance scorecards on the results screen.
   * Determines victory or defeat, triggers appropriate canvas confetti or sorrow rain effects,
   * lists correct/incorrect cells placed, lines/boxes completed, and registers rematch hooks.
   *
   * @returns {void}
   */
  function renderResults() {
    const myData = gameState.players[myPlayerId];
    const oppId = myPlayerId === 'player1' ? 'player2' : 'player1';
    const oppData = gameState.players[oppId];

    const winner = gameState.winner || window.GameManager.determineWinner(gameState);

    // Title
    const titleEl = document.getElementById('results-title');
    const subtitleEl = document.getElementById('results-subtitle');

    let amIWinner;
    if (winner === 'tie') {
      amIWinner = 'tie';
      titleEl.textContent = "IT'S A TIE!";
      titleEl.className = 'results-title tie';
      subtitleEl.textContent = 'Both players scored equally. Impressive!';
    } else if (isLocalMode) {
      const winnerName = gameState.players[winner].name;
      amIWinner = 'win'; // Trigger confetti & congrats style
      titleEl.textContent = `${winnerName.toUpperCase()} WINS! 🏆`;
      titleEl.className = 'results-title win';
      subtitleEl.textContent = `Congratulations, ${winnerName}!`;
      const resultsContainer = document.getElementById('results-screen');
      Effects.launchConfetti(resultsContainer, 5000);
    } else if (winner === myPlayerId) {
      amIWinner = 'win';
      titleEl.textContent = 'YOU WIN! 🏆';
      titleEl.className = 'results-title win';
      subtitleEl.textContent = 'Congratulations, champion!';
      // Confetti!
      const resultsContainer = document.getElementById('results-screen');
      Effects.launchConfetti(resultsContainer, 5000);
    } else {
      amIWinner = 'lose';
      titleEl.textContent = 'YOU LOSE';
      titleEl.className = 'results-title lose';
      subtitleEl.textContent = 'Better luck next time!';
      // Rain!
      const resultsContainer = document.getElementById('results-screen');
      Effects.launchSorrowRain(resultsContainer, 5000);
    }

    // Scores
    document.getElementById('result-my-name').textContent = myData.name;
    document.getElementById('result-my-score').textContent = myData.score;
    document.getElementById('result-opp-name').textContent = oppData ? oppData.name : 'Opponent';
    document.getElementById('result-opp-score').textContent = oppData ? oppData.score : 0;

    // Stats
    document.getElementById('result-my-correct').textContent = myData.correctPlacements;
    document.getElementById('result-my-incorrect').textContent = myData.incorrectPlacements;
    document.getElementById('result-my-rows').textContent = myData.completedRows.size;
    document.getElementById('result-my-cols').textContent = myData.completedCols.size;
    document.getElementById('result-my-boxes').textContent = myData.completedBoxes.size;

    if (oppData) {
      document.getElementById('result-opp-correct').textContent = oppData.correctPlacements;
      document.getElementById('result-opp-incorrect').textContent = oppData.incorrectPlacements;
      document.getElementById('result-opp-rows').textContent = oppData.completedRows?.size || 0;
      document.getElementById('result-opp-cols').textContent = oppData.completedCols?.size || 0;
      document.getElementById('result-opp-boxes').textContent = oppData.completedBoxes?.size || 0;
    }

    // Time
    const elapsed = window.GameManager.getElapsedSeconds(gameState);
    document.getElementById('result-time').textContent = window.GameManager.formatTime(elapsed);

    // Rematch button
    const rematchBtn = document.getElementById('btn-rematch');
    rematchBtn.addEventListener('click', () => {
      // Reset everything and go back to lobby
      cleanup();
      showScreen('lobby-screen');
      document.getElementById('lobby-main').classList.remove('hidden');
      document.getElementById('lobby-join').classList.add('hidden');
      document.getElementById('lobby-waiting').classList.add('hidden');
    });
  }

  /* ────────────────────────────────────────────
   * Keyboard Support
   * ──────────────────────────────────────────── */

  /**
   * Binds global document keyboard keydown listeners.
   * Enables navigating cells using keyboard arrow keys, placing numbers 1-9, erasing via Delete/Backspace,
   * and toggling pencil note mode via the 'N' key.
   *
   * @returns {void}
   */
  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (gameState?.status !== window.GameManager.GAME_STATUS.PLAYING) return;
      if (!selectedCell) return;

      const key = e.key;

      // Number keys 1-9
      if (key >= '1' && key <= '9') {
        handleNumberInput(parseInt(key));
        e.preventDefault();
      }

      // Delete / Backspace = erase
      if (key === 'Delete' || key === 'Backspace') {
        handleNumberInput(0);
        e.preventDefault();
      }

      // Arrow keys to navigate
      if (key.startsWith('Arrow')) {
        let { row, col } = selectedCell;
        if (key === 'ArrowUp' && row > 0) row--;
        if (key === 'ArrowDown' && row < 8) row++;
        if (key === 'ArrowLeft' && col > 0) col--;
        if (key === 'ArrowRight' && col < 8) col++;
        selectedCell = { row, col };
        updateHighlights();
        e.preventDefault();
      }

      // N key = toggle notes
      if (key === 'n' || key === 'N') {
        notesMode = !notesMode;
        const notesBtn = document.getElementById('btn-notes-toggle');
        if (notesBtn) notesBtn.classList.toggle('active', notesMode);
        Effects.showToast(notesMode ? 'Notes mode ON' : 'Notes mode OFF', 'info', 1500);
      }
    });
  }

  /* ────────────────────────────────────────────
   * Cleanup
   * ──────────────────────────────────────────── */

  /**
   * Resets active game states, stops timers, clears room unsubscription listeners,
   * severs active SSE streams, and restores lobby screens back to pristine starting states.
   *
   * @returns {void}
   */
  function cleanup() {
    stopTimer();
    unsubscribers.forEach(fn => {
      try {
        if (typeof fn === 'function') fn();
      } catch (err) {
        console.error('[UI] Error during unsubscribing:', err);
      }
    });
    unsubscribers = [];
    gameState = null;
    myPlayerId = null;
    window.Multiplayer.setPlayerId(null);
    if (window.Multiplayer.disconnect) {
      window.Multiplayer.disconnect();
    }
    selectedCell = null;
    notesMode = false;
    isLocalMode = false;

    // Reset same-device turn banner
    const turnBanner = document.getElementById('local-turn-banner');
    if (turnBanner) {
      turnBanner.classList.add('hidden');
    }
  }

  /* ────────────────────────────────────────────
   * App Initialization
   * ──────────────────────────────────────────── */

  /**
   * Installs click event listeners on player cards for same-device local hot-seat mode.
   * Allows players to manually switch active turn identity by tapping their card, triggering a Pass device alert.
   *
   * @returns {void}
   */
  function setupCardInteractions() {
    const selfCard = document.getElementById('self-card');
    const oppCard = document.getElementById('opponent-card');

    const handleCardSwap = (targetPlayerId) => {
      if (!gameState || gameState.status !== window.GameManager.GAME_STATUS.PLAYING) return;
      if (!isLocalMode) return; // Only swap in local same-device mode
      if (myPlayerId === targetPlayerId) return; // Already active

      // Swap active player identity
      myPlayerId = targetPlayerId;
      const activeName = gameState.players[myPlayerId].name;

      // Toast pass confirmation
      Effects.showToast(`🎮 Pass the device! Active Player: ${activeName}`, 'info', 3000);

      // Clear cell selection for privacy
      selectedCell = null;

      // Full rendering update
      renderBoard();
      renderNumberPad();
      updateScores();
      renderPlayerCards();
    };

    if (selfCard) {
      selfCard.addEventListener('click', () => handleCardSwap('player1'));
    }
    if (oppCard) {
      oppCard.addEventListener('click', () => handleCardSwap('player2'));
    }
  }

  /* ────────────────────────────────────────────
   * Zero-Config Discovery & Server Helper Methods
   * ──────────────────────────────────────────── */

  /**
   * Asynchronously pings the sync server to verify network status and updates status widget indicators.
   * Displays connection green/yellow/red indicators and triggers offline fallback mode gracefully.
   *
   * @returns {Promise<void>}
   */
  async function checkServerConnection() {
    const url = window.Multiplayer.getServerUrl();
    const dot = document.getElementById('server-status-dot');
    const text = document.getElementById('server-status-text');
    
    if (!dot || !text) return;
    
    dot.className = 'status-dot pulsing yellow';
    text.textContent = 'Connecting...';
    
    // Dynamically update connection troubleshooter placeholders
    const hintIpEl = document.getElementById('server-hint-ip');
    const diagPingEl = document.getElementById('diag-ping-url');
    if (hintIpEl) hintIpEl.textContent = url;
    if (diagPingEl) {
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      diagPingEl.textContent = `${cleanUrl}/api/ping`;
    }
    
    const online = await window.Multiplayer.pingServer(url);
    if (online) {
      dot.className = 'status-dot pulsing green';
      text.textContent = 'Server Connected (Multiplayer Ready)';
    } else {
      dot.className = 'status-dot red';
      text.textContent = 'Server Offline (Using Local Hot-Seat Only)';
    }
  }

  /**
   * Parses the browser URL query parameter list.
   * Automatically switches the screen to 'Join Game' and pre-fills room codes when matching parameters (?join=XXXXXX) are detected.
   *
   * @returns {void}
   */
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && joinCode.length === 6) {
      // Switch to join screen
      document.getElementById('lobby-main').classList.add('hidden');
      document.getElementById('lobby-join').classList.remove('hidden');
      
      // Pre-fill room code
      const joinInput = document.getElementById('join-code-input');
      if (joinInput) {
        joinInput.value = joinCode.toUpperCase();
      }
      
      // Focus name input
      const nameInput = document.getElementById('join-name-input');
      if (nameInput) {
        nameInput.focus();
      }
      
      Effects.showToast('Ready to join: Enter your name!', 'info', 3000);
    }
  }

  /**
   * Fetches the local server's priority IP list, generates direct join URLs,
   * constructs a dynamic QR code image, and binds click copy clipboard join links.
   *
   * @param {string} roomCode - The unique 6-character room identifier.
   * @returns {Promise<void>}
   */
  async function setupNetworkDiscovery(roomCode) {
    const discoveryBox = document.getElementById('network-discovery-box');
    const urlsList = document.getElementById('discovery-urls-list');
    const qrCodeImg = document.getElementById('qr-code-img');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const copyJoinLinkBtn = document.getElementById('btn-copy-join-link');

    if (!discoveryBox || !urlsList) return;

    // Display the discovery block
    discoveryBox.classList.remove('hidden');
    urlsList.innerHTML = '';

    const ips = await window.Multiplayer.fetchNetworkIPs();
    const srvUrl = window.Multiplayer.getServerUrl();
    const port = srvUrl.match(/:(\d+)/)?.[1] || '8080';

    const joinLinks = [];

    // Prioritize Wi-Fi interfaces first
    ips.forEach(ip => {
      const host = ip === '127.0.0.1' ? 'localhost' : ip;
      
      // Let's build a proper absolute link using the actual IP and port
      const absoluteLink = `${srvUrl.startsWith('https') ? 'https' : 'http'}://${host}:${port}/index.html?join=${roomCode}`;
      joinLinks.push(absoluteLink);

      if (ip !== '127.0.0.1') {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = absoluteLink;
        a.target = '_blank';
        a.textContent = `${ip}:${port}`;
        li.appendChild(a);
        urlsList.appendChild(li);
      }
    });

    // Fallback if no network IPs found
    if (urlsList.children.length === 0) {
      const directLink = `${window.location.protocol}//${window.location.host}${window.location.pathname}?join=${roomCode}`;
      joinLinks.push(directLink);
      
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = directLink;
      a.target = '_blank';
      a.textContent = window.location.host;
      li.appendChild(a);
      urlsList.appendChild(li);
    }

    // Pick first non-local join link for QR, fallback to first
    const qrLink = joinLinks.find(lnk => !lnk.includes('localhost') && !lnk.includes('127.0.0.1')) || joinLinks[0];

    if (qrCodeImg && qrPlaceholder) {
      qrPlaceholder.textContent = 'Generating QR...';
      qrPlaceholder.classList.remove('hidden');
      qrCodeImg.classList.add('hidden');

      qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrLink)}`;
      qrCodeImg.onload = () => {
        qrPlaceholder.classList.add('hidden');
        qrCodeImg.classList.remove('hidden');
      };
      qrCodeImg.onerror = () => {
        qrPlaceholder.textContent = 'QR Error';
      };
    }

    if (copyJoinLinkBtn) {
      copyJoinLinkBtn.onclick = () => {
        const primaryLink = joinLinks.find(lnk => !lnk.includes('localhost') && !lnk.includes('127.0.0.1')) || joinLinks[0];
        navigator.clipboard.writeText(primaryLink).then(() => {
          Effects.showToast('Join link copied!', 'success');
        });
      };
    }
  }

  /**
   * Main entry point. Bootstraps connections, registers event loops, routes starting screen states,
   * pings servers, and handles scan-to-join triggers when DOM loading completes.
   *
   * @returns {void}
   */
  function init() {
    // Initialize Firebase (non-blocking)
    window.Multiplayer.initFirebase();

    // Show lobby
    showScreen('lobby-screen');

    // Initialize lobby interactions
    initLobby();

    // Initialize keyboard
    initKeyboard();

    // Set up card clicks for hot-seat mode
    setupCardInteractions();

    // Populate server url input on start
    const urlInput = document.getElementById('server-url-input');
    if (urlInput) {
      urlInput.value = window.Multiplayer.getServerUrl();
    }
    
    // Check initial server connection
    checkServerConnection();
    
    // Parse scan-to-play URL parameters
    parseUrlParams();

    console.log('[SudokuDuel] App initialized.');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.SudokuUI = {
    getGameState: () => gameState,
    getSelectedCell: () => selectedCell
  };

})();
