/**
 * SudokuEngine — A complete, production-quality Sudoku engine module.
 *
 * Provides puzzle generation, solving, validation, and utility functions.
 * Exported as `window.SudokuEngine` for use in vanilla HTML/JS projects.
 *
 * @namespace SudokuEngine
 */
(function () {
  'use strict';

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Fisher-Yates (Knuth) in-place shuffle.
   * @param {Array} arr - The array to shuffle.
   * @returns {Array} The same array, now shuffled.
   */
  function fisherYatesShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Create an array [1, 2, …, 9] in random order.
   * @returns {number[]}
   */
  function randomDigits() {
    return fisherYatesShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Deep-copy a 2-D grid (array of arrays of numbers).
   *
   * @param {number[][]} grid - 9×9 grid to copy.
   * @returns {number[][]} An independent deep copy.
   */
  function deepCopy(grid) {
    return grid.map(function (row) {
      return row.slice();
    });
  }

  /**
   * Check whether placing `num` at `(row, col)` is valid according to
   * standard Sudoku rules (row, column, and 3×3 box uniqueness).
   *
   * This does **not** check against any solution — it only verifies that
   * no existing cell in the same row, column, or box already contains
   * `num`.
   *
   * @param {number[][]} grid - The current 9×9 grid (0 = empty).
   * @param {number}     row  - Row index (0-8).
   * @param {number}     col  - Column index (0-8).
   * @param {number}     num  - Candidate number (1-9).
   * @returns {boolean} `true` if the placement is legal.
   */
  function isValidPlacement(grid, row, col, num) {
    // Bounds / type sanity
    if (row < 0 || row > 8 || col < 0 || col > 8) return false;
    if (num < 1 || num > 9) return false;

    // Row check
    for (let c = 0; c < 9; c++) {
      if (c !== col && grid[row][c] === num) return false;
    }

    // Column check
    for (let r = 0; r < 9; r++) {
      if (r !== row && grid[r][col] === num) return false;
    }

    // 3×3 box check
    const boxRowStart = Math.floor(row / 3) * 3;
    const boxColStart = Math.floor(col / 3) * 3;
    for (let r = boxRowStart; r < boxRowStart + 3; r++) {
      for (let c = boxColStart; c < boxColStart + 3; c++) {
        if (r !== row || c !== col) {
          if (grid[r][c] === num) return false;
        }
      }
    }

    return true;
  }

  /**
   * Return every number (1-9) that can legally be placed at `(row, col)`.
   *
   * @param {number[][]} grid - The current 9×9 grid (0 = empty).
   * @param {number}     row  - Row index (0-8).
   * @param {number}     col  - Column index (0-8).
   * @returns {number[]} Sorted array of valid candidates.
   */
  function getPossibleNumbers(grid, row, col) {
    // If the cell is already filled, return an empty array.
    if (grid[row][col] !== 0) return [];

    var candidates = [];
    for (var num = 1; num <= 9; num++) {
      if (isValidPlacement(grid, row, col, num)) {
        candidates.push(num);
      }
    }
    return candidates;
  }

  /**
   * Solve a Sudoku grid using deterministic backtracking.
   *
   * The grid is modified **in place** and returned on success.
   * Pass a `deepCopy` if you want to preserve the original.
   *
   * @param {number[][]} grid - 9×9 grid (0 = empty). Modified in place.
   * @returns {number[][]|null} The solved grid, or `null` if no solution exists.
   */
  function solve(grid) {
    // Find the first empty cell
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (isValidPlacement(grid, r, c, num)) {
              grid[r][c] = num;
              if (solve(grid) !== null) {
                return grid;
              }
              grid[r][c] = 0;
            }
          }
          return null; // No valid number found — backtrack
        }
      }
    }
    // No empty cells remain — puzzle is solved
    return grid;
  }

  /**
   * Count the number of solutions a grid has, stopping early once `limit`
   * is reached. This is the key routine used to guarantee puzzle uniqueness.
   *
   * @param {number[][]} grid  - 9×9 grid (0 = empty). Will be modified during
   *                             counting but restored before returning.
   * @param {number}     limit - Stop counting once this many solutions are found.
   * @returns {number} The number of solutions found (at most `limit`).
   */
  function countSolutions(grid, limit) {
    if (typeof limit !== 'number' || limit < 1) limit = 2;

    var count = 0;

    function backtrack() {
      // Find first empty cell
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (isValidPlacement(grid, r, c, num)) {
                grid[r][c] = num;
                backtrack();
                grid[r][c] = 0;
                if (count >= limit) return;
              }
            }
            return; // Dead end — backtrack
          }
        }
      }
      // No empty cell found — this is a complete solution
      count++;
    }

    backtrack();
    return count;
  }

  /**
   * Generate a complete, valid, randomly-filled 9×9 Sudoku solution using
   * randomised backtracking (Fisher-Yates shuffled digit order).
   *
   * @returns {number[][]} A fully-filled 9×9 grid of numbers 1-9.
   */
  function generateCompleteSolution() {
    // Start with an empty grid
    var grid = [];
    for (var i = 0; i < 9; i++) {
      grid.push([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }

    /**
     * Recursively fill the grid starting from cell (0,0), scanning left-to-
     * right, top-to-bottom, trying digits in a random order at each cell.
     */
    function fill(grid) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) {
            var digits = randomDigits();
            for (let d = 0; d < 9; d++) {
              var num = digits[d];
              if (isValidPlacement(grid, r, c, num)) {
                grid[r][c] = num;
                if (fill(grid)) {
                  return true;
                }
                grid[r][c] = 0;
              }
            }
            return false; // Backtrack
          }
        }
      }
      return true; // All cells filled
    }

    fill(grid);
    return grid;
  }

  /**
   * Create a puzzle by removing cells from a complete solution.
   *
   * Cells are removed one at a time in a random order. After every removal
   * the engine verifies that the puzzle still has a **unique** solution; if
   * removing a cell would create multiple solutions the cell is restored.
   *
   * Difficulty levels control the *target* number of givens:
   * - `'easy'`   — ~38 givens  (43 cells removed)
   * - `'medium'` — ~30 givens  (51 cells removed)
   * - `'hard'`   — ~24 givens  (57 cells removed)
   *
   * Because some removals are rejected to preserve uniqueness, the final
   * number of givens may be slightly higher than the target.
   *
   * @param {number[][]} solution   - A complete 9×9 solution.
   * @param {string}     difficulty - One of `'easy'`, `'medium'`, `'hard'`.
   * @returns {number[][]} A 9×9 puzzle grid (0 = empty cell).
   */
  function createPuzzle(solution, difficulty) {
    // Determine how many cells to remove
    var cellsToRemove;
    switch ((difficulty || 'easy').toLowerCase()) {
      case 'hard':
        cellsToRemove = 57;
        break;
      case 'medium':
        cellsToRemove = 51;
        break;
      case 'easy':
      default:
        cellsToRemove = 43;
        break;
    }

    var puzzle = deepCopy(solution);

    // Build a list of all 81 cell positions and shuffle them
    var positions = [];
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        positions.push([r, c]);
      }
    }
    fisherYatesShuffle(positions);

    var removed = 0;

    for (var i = 0; i < positions.length && removed < cellsToRemove; i++) {
      var row = positions[i][0];
      var col = positions[i][1];

      // Skip cells already empty (shouldn't happen, but be safe)
      if (puzzle[row][col] === 0) continue;

      var saved = puzzle[row][col];
      puzzle[row][col] = 0;

      // Check uniqueness — we need exactly 1 solution
      if (countSolutions(puzzle, 2) !== 1) {
        // Removing this cell creates ambiguity — put it back
        puzzle[row][col] = saved;
      } else {
        removed++;
      }
    }

    return puzzle;
  }

  /**
   * Check whether every cell in the grid is filled (i.e. no zeros).
   *
   * @param {number[][]} grid - 9×9 grid.
   * @returns {boolean} `true` if every cell is non-zero.
   */
  function isComplete(grid) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] === 0) return false;
      }
    }
    return true;
  }

  /**
   * Check whether the player's grid matches the solution exactly.
   *
   * @param {number[][]} grid     - The player's current 9×9 grid.
   * @param {number[][]} solution - The correct 9×9 solution.
   * @returns {boolean} `true` if every cell matches.
   */
  function isCorrect(grid, solution) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] !== solution[r][c]) return false;
      }
    }
    return true;
  }

  // ─── Export ───────────────────────────────────────────────────────────

  window.SudokuEngine = {
    generateCompleteSolution: generateCompleteSolution,
    createPuzzle:             createPuzzle,
    isValidPlacement:         isValidPlacement,
    getPossibleNumbers:       getPossibleNumbers,
    solve:                    solve,
    countSolutions:           countSolutions,
    isComplete:               isComplete,
    isCorrect:                isCorrect,
    deepCopy:                 deepCopy
  };

})();
