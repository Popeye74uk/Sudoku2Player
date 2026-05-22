/**
 * Game State Manager for 2-Player Competitive Sudoku
 * Handles game lifecycle, scoring, and state transitions.
 */
(function () {
  'use strict';

  /* ────────────────────────────────────────────
   * Constants
   * ──────────────────────────────────────────── */
  const SCORES = {
    CORRECT_PLACEMENT: 10,
    INCORRECT_PENALTY: -5,
    COMPLETE_ROW: 50,
    COMPLETE_COL: 50,
    COMPLETE_BOX: 50,
    LAST_CELL: 200
  };

  const GAME_STATUS = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
  };

  /* ────────────────────────────────────────────
   * Game State Factory
   * ──────────────────────────────────────────── */

  /**
   * Creates a new game state object.
   * @param {object} options
   * @param {string} options.gameId - Unique game room identifier
   * @param {number[][]} options.puzzle - The puzzle grid (0 = empty)
   * @param {number[][]} options.solution - The complete solution
   * @param {string} options.difficulty - 'easy' | 'medium' | 'hard'
   * @param {string} options.player1Name - Name of the game creator
   * @param {boolean} [options.timeBonusEnabled] - Optional time streak multiplier toggle
   * @returns {object} Fresh game state
   */
  function createGameState({ gameId, puzzle, solution, difficulty, player1Name, timeBonusEnabled }) {
    const engine = window.SudokuEngine;
    return {
      gameId: gameId,
      puzzle: engine.deepCopy(puzzle),
      solution: engine.deepCopy(solution),
      difficulty: difficulty,
      timeBonusEnabled: !!timeBonusEnabled,
      players: {
        player1: createPlayerState(player1Name, puzzle),
        player2: null
      },
      startTime: null,
      endTime: null,
      status: GAME_STATUS.WAITING,
      winner: null,
      // Track which cells have been scored (first correct placement gets points)
      scoredCells: createEmptyBoolGrid()
    };
  }

  /**
   * Creates a player state object.
   * @param {string} name
   * @param {number[][]} puzzle - The starting puzzle
   * @returns {object} Player state
   */
  function createPlayerState(name, puzzle) {
    const engine = window.SudokuEngine;
    return {
      name: name,
      score: 0,
      grid: engine.deepCopy(puzzle), // Player's working grid
      notes: createEmptyNotesGrid(),
      cellsPlaced: 0,
      correctPlacements: 0,
      incorrectPlacements: 0,
      completedRows: new Set(),
      completedCols: new Set(),
      completedBoxes: new Set(),
      connected: true,
      lastCorrectTime: null,
      streakMultiplier: 1
    };
  }

  /** Creates a 9×9 grid of false values */
  function createEmptyBoolGrid() {
    return Array.from({ length: 9 }, () => Array(9).fill(false));
  }

  /** Creates a 9×9 grid of empty Sets (for pencil notes) */
  function createEmptyNotesGrid() {
    return Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
  }

  /* ────────────────────────────────────────────
   * Player 2 Join
   * ──────────────────────────────────────────── */

  /**
   * Automatically erases a number from all pencil notes in the same row, column, and 3x3 box.
   * @param {object} player - Player state
   * @param {number} row - Row index (0-8)
   * @param {number} col - Column index (0-8)
   * @param {number} num - The correct number solved
   */
  function autoEraseNotes(player, row, col, num) {
    if (!player || !player.notes) return;

    // Erase from row and column
    for (let i = 0; i < 9; i++) {
      player.notes[row][i].delete(num);
      player.notes[i][col].delete(num);
    }

    // Erase from 3x3 box
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        player.notes[r][c].delete(num);
      }
    }
  }

  /**
   * Adds player 2 to the game and starts play.
   * @param {object} gameState
   * @param {string} player2Name
   * @returns {object} Updated game state
   */
  function addPlayer2(gameState, player2Name) {
    gameState.players.player2 = createPlayerState(player2Name, gameState.puzzle);
    gameState.status = GAME_STATUS.PLAYING;
    gameState.startTime = Date.now();
    return gameState;
  }

  /* ────────────────────────────────────────────
   * Move Processing
   * ──────────────────────────────────────────── */

  /**
   * Processes a number placement by a player.
   * @param {object} gameState - Current game state
   * @param {string} playerId - 'player1' or 'player2'
   * @param {number} row - Row index (0-8)
   * @param {number} col - Column index (0-8)
   * @param {number} num - Number to place (1-9), or 0 to erase
   * @returns {object} Result: { success, isCorrect, pointsEarned, bonuses[], newScore, gameFinished, streakMultiplier }
   */
  function processMove(gameState, playerId, row, col, num) {
    const player = gameState.players[playerId];
    const result = {
      success: false,
      isCorrect: false,
      pointsEarned: 0,
      bonuses: [],
      newScore: player.score,
      gameFinished: false,
      streakMultiplier: player.streakMultiplier || 1
    };

    // Can't modify original puzzle cells (clues)
    if (gameState.puzzle[row][col] !== 0) {
      return result;
    }

    // Can't play if game isn't active
    if (gameState.status !== GAME_STATUS.PLAYING) {
      return result;
    }

    result.success = true;

    // Handle erase
    if (num === 0) {
      player.grid[row][col] = 0;
      return result;
    }

    // Place the number
    player.grid[row][col] = num;
    player.cellsPlaced++;

    // Clear notes for this cell
    player.notes[row][col].clear();

    // Check correctness against solution
    const isCorrect = num === gameState.solution[row][col];
    result.isCorrect = isCorrect;

    if (isCorrect) {
      player.correctPlacements++;

      // Auto-erase notes for this correct number across its row, col, and box
      autoEraseNotes(player, row, col, num);

      // Streak Multiplier tracking (if enabled)
      if (gameState.timeBonusEnabled) {
        const now = Date.now();
        if (player.lastCorrectTime && (now - player.lastCorrectTime <= 10000)) {
          player.streakMultiplier++;
        } else {
          player.streakMultiplier = 1;
        }
        player.lastCorrectTime = now;
      } else {
        player.streakMultiplier = 1;
        player.lastCorrectTime = null;
      }
      result.streakMultiplier = player.streakMultiplier;

      // Only award points if this cell hasn't been scored yet (globally)
      if (!gameState.scoredCells[row][col]) {
        gameState.scoredCells[row][col] = true;
        const points = SCORES.CORRECT_PLACEMENT * player.streakMultiplier;
        result.pointsEarned += points;

        // Check if this was the last empty cell on the board (for either player)
        if (isBoardFullyScored(gameState)) {
          result.pointsEarned += SCORES.LAST_CELL;
          result.bonuses.push({ type: 'last_cell', points: SCORES.LAST_CELL });
        }
      }

      // Check for row completion bonus (independent of global first-solve)
      if (isRowComplete(player.grid, gameState.solution, row) && !player.completedRows.has(row)) {
        player.completedRows.add(row);
        result.pointsEarned += SCORES.COMPLETE_ROW;
        result.bonuses.push({ type: 'row', index: row, points: SCORES.COMPLETE_ROW });
      }

      // Check for column completion bonus (independent of global first-solve)
      if (isColComplete(player.grid, gameState.solution, col) && !player.completedCols.has(col)) {
        player.completedCols.add(col);
        result.pointsEarned += SCORES.COMPLETE_COL;
        result.bonuses.push({ type: 'col', index: col, points: SCORES.COMPLETE_COL });
      }

      // Check for box completion bonus (independent of global first-solve)
      const boxIndex = getBoxIndex(row, col);
      if (isBoxComplete(player.grid, gameState.solution, row, col) && !player.completedBoxes.has(boxIndex)) {
        player.completedBoxes.add(boxIndex);
        result.pointsEarned += SCORES.COMPLETE_BOX;
        result.bonuses.push({ type: 'box', index: boxIndex, points: SCORES.COMPLETE_BOX });
      }
    } else {
      player.incorrectPlacements++;
      player.streakMultiplier = 1;
      player.lastCorrectTime = null;
      result.streakMultiplier = 1;
      result.pointsEarned += SCORES.INCORRECT_PENALTY;
    }

    // Update score
    player.score += result.pointsEarned;
    // Score floor at 0
    if (player.score < 0) player.score = 0;
    result.newScore = player.score;

    // Check if the game is over
    if (isBoardFullyScored(gameState)) {
      gameState.status = GAME_STATUS.FINISHED;
      gameState.endTime = Date.now();
      gameState.winner = determineWinner(gameState);
      result.gameFinished = true;
    }

    return result;
  }

  /* ────────────────────────────────────────────
   * Completion Checks
   * ──────────────────────────────────────────── */

  /** Check if a row is correctly completed in the player's grid */
  function isRowComplete(grid, solution, row) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] !== solution[row][col]) return false;
    }
    return true;
  }

  /** Check if a column is correctly completed in the player's grid */
  function isColComplete(grid, solution, col) {
    for (let row = 0; row < 9; row++) {
      if (grid[row][col] !== solution[row][col]) return false;
    }
    return true;
  }

  /** Check if a 3×3 box is correctly completed */
  function isBoxComplete(grid, solution, cellRow, cellCol) {
    const startRow = Math.floor(cellRow / 3) * 3;
    const startCol = Math.floor(cellCol / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        if (grid[r][c] !== solution[r][c]) return false;
      }
    }
    return true;
  }

  /** Get a unique box index (0-8) for the box containing (row, col) */
  function getBoxIndex(row, col) {
    return Math.floor(row / 3) * 3 + Math.floor(col / 3);
  }

  /** Check if all scorable cells have been scored */
  function isBoardFullyScored(gameState) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (gameState.puzzle[r][c] === 0 && !gameState.scoredCells[r][c]) {
          return false;
        }
      }
    }
    return true;
  }

  /* ────────────────────────────────────────────
   * Winner Determination
   * ──────────────────────────────────────────── */

  /**
   * Determines the winner based on scores.
   * @param {object} gameState
   * @returns {string} 'player1' | 'player2' | 'tie'
   */
  function determineWinner(gameState) {
    const p1 = gameState.players.player1.score;
    const p2 = gameState.players.player2 ? gameState.players.player2.score : 0;

    if (p1 > p2) return 'player1';
    if (p2 > p1) return 'player2';
    return 'tie';
  }

  /* ────────────────────────────────────────────
   * Progress Calculation
   * ──────────────────────────────────────────── */

  /**
   * Gets the completion percentage for a player.
   * @param {object} gameState
   * @param {string} playerId
   * @returns {number} 0-100
   */
  function getProgress(gameState, playerId) {
    const player = gameState.players[playerId];
    if (!player) return 0;

    let totalEmpty = 0;
    let correctlyFilled = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (gameState.puzzle[r][c] === 0) {
          totalEmpty++;
          if (player.grid[r][c] === gameState.solution[r][c]) {
            correctlyFilled++;
          }
        }
      }
    }

    return totalEmpty === 0 ? 100 : Math.round((correctlyFilled / totalEmpty) * 100);
  }

  /* ────────────────────────────────────────────
   * Notes (Pencil Marks)
   * ──────────────────────────────────────────── */

  /**
   * Toggles a pencil note for a cell.
   * @param {object} gameState
   * @param {string} playerId
   * @param {number} row
   * @param {number} col
   * @param {number} num
   * @returns {boolean} Whether the note is now set
   */
  function toggleNote(gameState, playerId, row, col, num) {
    const player = gameState.players[playerId];
    if (gameState.puzzle[row][col] !== 0) return false; // Can't note on clue cells
    if (player.grid[row][col] !== 0) return false; // Can't note on filled cells

    const notes = player.notes[row][col];
    if (notes.has(num)) {
      notes.delete(num);
      return false;
    } else {
      notes.add(num);
      return true;
    }
  }

  /* ────────────────────────────────────────────
   * Timer Helpers
   * ──────────────────────────────────────────── */

  /**
   * Gets elapsed time in seconds.
   * @param {object} gameState
   * @returns {number} Seconds elapsed
   */
  function getElapsedSeconds(gameState) {
    if (!gameState.startTime) return 0;
    const end = gameState.endTime || Date.now();
    return Math.floor((end - gameState.startTime) / 1000);
  }

  /**
   * Formats seconds into MM:SS display.
   * @param {number} totalSeconds
   * @returns {string} Formatted time string
   */
  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /* ────────────────────────────────────────────
   * Room Code Generator
   * ──────────────────────────────────────────── */

  /**
   * Generates a short, readable room code.
   * @returns {string} 6-character uppercase alphanumeric code
   */
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /* ────────────────────────────────────────────
   * Serialization (for Firebase)
   * ──────────────────────────────────────────── */

  /**
   * Serializes game state for Firebase storage.
   * Converts Sets and nested objects to JSON-compatible formats.
   * @param {object} gameState
   * @returns {object} Serializable game state
   */
  function serializeGameState(gameState) {
    const serialized = {
      gameId: gameState.gameId,
      puzzle: gameState.puzzle,
      solution: gameState.solution,
      difficulty: gameState.difficulty,
      timeBonusEnabled: !!gameState.timeBonusEnabled,
      startTime: gameState.startTime,
      endTime: gameState.endTime,
      status: gameState.status,
      winner: gameState.winner,
      scoredCells: gameState.scoredCells
    };

    serialized.players = {};
    for (const pid of ['player1', 'player2']) {
      const p = gameState.players[pid];
      if (!p) {
        serialized.players[pid] = null;
        continue;
      }
      serialized.players[pid] = {
        name: p.name,
        score: p.score,
        grid: p.grid,
        cellsPlaced: p.cellsPlaced,
        correctPlacements: p.correctPlacements,
        incorrectPlacements: p.incorrectPlacements,
        completedRows: Array.from(p.completedRows),
        completedCols: Array.from(p.completedCols),
        completedBoxes: Array.from(p.completedBoxes),
        connected: p.connected,
        lastCorrectTime: p.lastCorrectTime,
        streakMultiplier: p.streakMultiplier
      };
      // Notes are not synced to Firebase (each player has their own private notes)
    }

    return serialized;
  }

  /**
   * Deserializes game state from Firebase.
   * @param {object} data - Raw Firebase data
   * @returns {object} Restored game state
   */
  function deserializeGameState(data) {
    const gameState = {
      gameId: data.gameId,
      puzzle: data.puzzle,
      solution: data.solution,
      difficulty: data.difficulty,
      timeBonusEnabled: !!data.timeBonusEnabled,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      winner: data.winner,
      scoredCells: data.scoredCells || createEmptyBoolGrid()
    };

    gameState.players = {};
    for (const pid of ['player1', 'player2']) {
      const p = data.players[pid];
      if (!p) {
        gameState.players[pid] = null;
        continue;
      }
      gameState.players[pid] = {
        name: p.name,
        score: p.score,
        grid: p.grid,
        notes: createEmptyNotesGrid(),
        cellsPlaced: p.cellsPlaced,
        correctPlacements: p.correctPlacements,
        incorrectPlacements: p.incorrectPlacements,
        completedRows: new Set(p.completedRows || []),
        completedCols: new Set(p.completedCols || []),
        completedBoxes: new Set(p.completedBoxes || []),
        connected: p.connected,
        lastCorrectTime: p.lastCorrectTime || null,
        streakMultiplier: p.streakMultiplier || 1
      };
    }

    return gameState;
  }

  /* ────────────────────────────────────────────
   * Score Constants Export
   * ──────────────────────────────────────────── */

  /** @type {object} Public API */
  window.GameManager = {
    SCORES,
    GAME_STATUS,
    createGameState,
    addPlayer2,
    processMove,
    toggleNote,
    getProgress,
    getElapsedSeconds,
    formatTime,
    generateRoomCode,
    determineWinner,
    serializeGameState,
    deserializeGameState
  };

})();
