'use strict';

const STAGES = ['registration', 'draw', 'group', 'knockout', 'quarter-final', 'semi-final', 'final', 'completed'];
const TYPE_ALIASES = {
  knockout: 'single_elimination',
  'single-elimination': 'single_elimination',
  single_elimination: 'single_elimination',
  league: 'league',
  'group-knockout': 'group_knockout',
  group_knockout: 'group_knockout',
  'league-phase-knockout': 'league_phase_knockout',
  league_phase_knockout: 'league_phase_knockout'
};
const TOURNAMENT_TYPES = Object.values(TYPE_ALIASES);

function normalizeType(type) {
  const cleaned = String(type || 'single_elimination').trim().toLowerCase();
  return TYPE_ALIASES[cleaned] || cleaned;
}

function validateTournamentInput(input = {}) {
  const name = String(input.name || '').trim();
  const type = normalizeType(input.tournament_type || input.type || input.format_type);
  const participantLimit = Number(input.participant_limit);

  if (!name) return { valid: false, error: 'Tournament name is required' };
  if (!TOURNAMENT_TYPES.includes(type)) return { valid: false, error: 'Unsupported tournament type' };
  if (!Number.isInteger(participantLimit) || participantLimit < 2) {
    return { valid: false, error: 'Participant limit must be an integer of at least 2' };
  }

  return { valid: true, value: { name, type, participantLimit } };
}

function normalizeParticipant(participant) {
  return {
    id: participant.id,
    name: String(participant.name || '').trim(),
    team_name: String(participant.team_name || '').trim() || null
  };
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function generateSingleEliminationDraw(participants) {
  const unique = new Map();
  for (const participant of participants || []) {
    const normalized = normalizeParticipant(participant);
    if (!normalized.id || !normalized.name || unique.has(normalized.id)) continue;
    unique.set(normalized.id, normalized);
  }

  const entries = Array.from(unique.values());
  if (entries.length < 2) throw new Error('At least two unique participants are required');

  const bracketSize = nextPowerOfTwo(entries.length);
  const slots = entries.map(participant => ({ participant, pending: false }));
  while (slots.length < bracketSize) slots.push({ participant: null, pending: false });
  const rounds = [];
  let currentSlots = slots;
  let roundNumber = 1;

  while (currentSlots.length > 1) {
    const stage = currentSlots.length === 2 ? 'final' : currentSlots.length === 4 ? 'semi-final' : currentSlots.length === 8 ? 'quarter-final' : 'knockout';
    const matches = [];
    for (let index = 0; index < currentSlots.length; index += 2) {
      const slotA = currentSlots[index];
      const slotB = currentSlots[index + 1];
      const participantA = slotA.participant;
      const participantB = slotB.participant;
      const bye = participantA && !participantB && !slotB.pending ? participantA : !participantA && participantB && !slotA.pending ? participantB : null;
      matches.push({
        round_number: roundNumber,
        stage,
        match_number: index / 2 + 1,
        participant_a_id: participantA?.id || null,
        participant_b_id: participantB?.id || null,
        winner_id: bye?.id || null,
        status: bye ? 'completed' : 'scheduled',
        next_match_number: currentSlots.length > 2 ? Math.floor(index / 4) + 1 : null,
        next_slot: currentSlots.length > 2 ? (Math.floor(index / 2) % 2 === 0 ? 'a' : 'b') : null
      });
    }
    rounds.push({ round_number: roundNumber, stage, matches });
    currentSlots = matches.map(match => ({
      participant: match.winner_id ? entries.find(entry => entry.id === match.winner_id) : null,
      pending: !match.winner_id && match.status !== 'completed'
    }));
    roundNumber += 1;
  }

  return { bracket_size: bracketSize, rounds };
}

function validateResult(match, winnerId, scoreA, scoreB) {
  const validParticipants = [match.participant_a_id, match.participant_b_id].filter(Boolean);
  if (match.status === 'completed') return { valid: false, error: 'Match is already completed' };
  if (match.status === 'disputed') return { valid: false, error: 'Disputed matches must be resolved first' };
  if (!validParticipants.includes(winnerId) || validParticipants.length !== 2) {
    return { valid: false, error: 'Winner must be one of the two match participants' };
  }

  const numericA = Number(scoreA);
  const numericB = Number(scoreB);
  if (!Number.isInteger(numericA) || !Number.isInteger(numericB) || numericA < 0 || numericB < 0 || numericA === numericB) {
    return { valid: false, error: 'Result must contain non-negative integer scores with no tie' };
  }
  if ((winnerId === match.participant_a_id && numericA <= numericB) || (winnerId === match.participant_b_id && numericB <= numericA)) {
    return { valid: false, error: 'Winner must have the higher score' };
  }

  return { valid: true, scoreA: numericA, scoreB: numericB };
}

module.exports = { STAGES, TOURNAMENT_TYPES, validateTournamentInput, generateSingleEliminationDraw, validateResult };
