// Smoke test for SudokuEngine — run with: node js/test_sudoku.js
global.window = {};
require('./sudoku.js');
const E = window.SudokuEngine;

let pass = 0, fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log('  PASS: ' + label); }
  else { fail++; console.error('  FAIL: ' + label); }
}

// 1. generateCompleteSolution
console.log('\n=== generateCompleteSolution ===');
const sol = E.generateCompleteSolution();
sol.forEach((r, i) => console.log('  Row ' + i + ':', r.join(' ')));
let solValid = true;
for (let r = 0; r < 9; r++) { if (new Set(sol[r]).size !== 9) solValid = false; }
for (let c = 0; c < 9; c++) { const s = new Set(); for (let r = 0; r < 9; r++) s.add(sol[r][c]); if (s.size !== 9) solValid = false; }
for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
  const s = new Set();
  for (let r = br*3; r < br*3+3; r++) for (let c = bc*3; c < bc*3+3; c++) s.add(sol[r][c]);
  if (s.size !== 9) solValid = false;
}
assert('Solution rows/cols/boxes all valid', solValid);

// 2. deepCopy
console.log('\n=== deepCopy ===');
const cp = E.deepCopy(sol);
cp[0][0] = 0;
assert('deepCopy is independent', sol[0][0] !== 0);

// 3. isComplete
console.log('\n=== isComplete ===');
assert('Complete grid → true', E.isComplete(sol));
assert('Incomplete grid → false', !E.isComplete(cp));

// 4. isCorrect
console.log('\n=== isCorrect ===');
assert('Matching grids → true', E.isCorrect(E.deepCopy(sol), sol));
assert('Mismatched grids → false', !E.isCorrect(cp, sol));

// 5. isValidPlacement
console.log('\n=== isValidPlacement ===');
const tg = E.deepCopy(sol);
const sv = tg[4][4]; tg[4][4] = 0;
assert('Correct num valid', E.isValidPlacement(tg, 4, 4, sv));
const conflict = tg[4][0];
if (conflict !== sv) assert('Conflicting num invalid', !E.isValidPlacement(tg, 4, 4, conflict));
assert('Out of bounds returns false', !E.isValidPlacement(tg, -1, 0, 1));
assert('Num 0 returns false', !E.isValidPlacement(tg, 4, 4, 0));
tg[4][4] = sv;

// 6. getPossibleNumbers
console.log('\n=== getPossibleNumbers ===');
const tg2 = E.deepCopy(sol); const sv2 = tg2[4][4]; tg2[4][4] = 0;
const poss = E.getPossibleNumbers(tg2, 4, 4);
assert('Candidates include correct answer', poss.includes(sv2));
assert('Filled cell returns empty', E.getPossibleNumbers(sol, 0, 0).length === 0);
tg2[4][4] = sv2;

// 7. solve — use a proper unique puzzle (via createPuzzle) so the solver
//    must converge to the original solution.
console.log('\n=== solve ===');
const uniquePuzzle = E.createPuzzle(sol, 'easy');
const solved = E.solve(E.deepCopy(uniquePuzzle));
assert('Solve returns a grid', solved !== null);
assert('Solved grid matches original solution', E.isCorrect(solved, sol));

// 8. countSolutions
console.log('\n=== countSolutions ===');
const cnt = E.countSolutions(E.deepCopy(uniquePuzzle), 2);
assert('countSolutions = 1 for unique puzzle', cnt === 1);

// 9. createPuzzle (each difficulty)
console.log('\n=== createPuzzle ===');
['easy', 'medium', 'hard'].forEach(function (diff) {
  const s = E.generateCompleteSolution();
  const p = E.createPuzzle(s, diff);
  let givens = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (p[r][c] !== 0) givens++;
  const uniqueCount = E.countSolutions(E.deepCopy(p), 2);
  const sv = E.solve(E.deepCopy(p));
  assert(diff + ' — unique solution (' + givens + ' givens)', uniqueCount === 1);
  assert(diff + ' — solvable & matches original', sv !== null && E.isCorrect(sv, s));
});

// 10. GameManager & Streak Multiplier
console.log('\n=== GameManager & Streak Multiplier ===');
require('./game.js');
const G = window.GameManager;

// Generate a valid solution
const solution = E.generateCompleteSolution();
const puzzle = E.deepCopy(solution);
puzzle[0][0] = 0;
puzzle[0][1] = 0;
puzzle[0][2] = 0;

const state = G.createGameState({
  gameId: 'TEST12',
  puzzle: puzzle,
  solution: solution,
  difficulty: 'easy',
  player1Name: 'Alice',
  timeBonusEnabled: true
});

const p1 = state.players.player1;
assert('P1 starts at score 0', p1.score === 0);
assert('P1 starts with streakMultiplier 1', p1.streakMultiplier === 1);
assert('P1 starts with lastCorrectTime null', p1.lastCorrectTime === null);

state.status = G.GAME_STATUS.PLAYING;
state.startTime = Date.now();

const move1 = G.processMove(state, 'player1', 0, 0, solution[0][0]);
assert('Move 1 is correct', move1.isCorrect === true);
assert('Move 1 points earned is 60 (10 base * 1x + 50 col bonus)', move1.pointsEarned === 60);
assert('Move 1 streak multiplier remains 1', move1.streakMultiplier === 1);
assert('P1 score is now 60', p1.score === 60);

const move2 = G.processMove(state, 'player1', 0, 1, solution[0][1]);
assert('Move 2 is correct', move2.isCorrect === true);
assert('Move 2 streak multiplier is 2x', move2.streakMultiplier === 2);
assert('Move 2 points earned is 70 (10 base * 2x + 50 col bonus)', move2.pointsEarned === 70);
assert('P1 score is now 130', p1.score === 130);

p1.lastCorrectTime = Date.now() - 11000;

const move3 = G.processMove(state, 'player1', 0, 2, solution[0][2]);
assert('Move 3 is correct', move3.isCorrect === true);
assert('Move 3 streak multiplier resets to 1x due to timeout', move3.streakMultiplier === 1);
assert('Move 3 points earned is 360', move3.pointsEarned === 360);
assert('P1 score is now 490', p1.score === 490);

// Summary
console.log('\n=============================');
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

