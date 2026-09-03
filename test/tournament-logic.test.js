const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateTournamentInput,
  generateSingleEliminationDraw,
  validateResult
} = require('../services/tournament-logic');

test('tournament creation validates required foundation fields', () => {
  assert.equal(validateTournamentInput({ name: 'Cup', participant_limit: 8 }).valid, true);
  assert.equal(validateTournamentInput({ name: 'Cup', participant_limit: 8, format_type: 'knockout' }).valid, true);
  assert.equal(validateTournamentInput({ name: '', participant_limit: 8 }).valid, false);
  assert.equal(validateTournamentInput({ name: 'Cup', participant_limit: 1 }).valid, false);
});

test('single elimination draw creates unique fixtures and a bye', () => {
  const participants = [1, 2, 3].map(id => ({ id, name: `Player ${id}` }));
  const draw = generateSingleEliminationDraw(participants);
  const firstRound = draw.rounds[0].matches;
  assert.equal(draw.bracket_size, 4);
  assert.equal(firstRound.length, 2);
  assert.equal(new Set(firstRound.flatMap(match => [match.participant_a_id, match.participant_b_id]).filter(Boolean)).size, 3);
  assert.equal(firstRound.filter(match => match.status === 'completed').length, 1);
});

test('result validation rejects ties, wrong winners, and duplicate results', () => {
  const match = { participant_a_id: 'a', participant_b_id: 'b', status: 'scheduled' };
  assert.equal(validateResult(match, 'a', 2, 1).valid, true);
  assert.equal(validateResult(match, 'a', 1, 2).valid, false);
  assert.equal(validateResult(match, 'a', 1, 1).valid, false);
  assert.equal(validateResult({ ...match, status: 'completed' }, 'a', 2, 1).valid, false);
});

test('workflow progresses a winner toward completion', () => {
  const draw = generateSingleEliminationDraw([
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' }
  ]);
  const [first, second] = draw.rounds[0].matches;
  const resultOne = validateResult(first, first.participant_a_id, 2, 0);
  const resultTwo = validateResult(second, second.participant_a_id, 3, 1);
  assert.equal(resultOne.valid, true);
  assert.equal(resultTwo.valid, true);
  assert.equal(draw.rounds[1].matches[0].next_match_number, null);
  assert.equal(draw.rounds[0].matches.every(match => match.next_match_number === 1), true);
});
