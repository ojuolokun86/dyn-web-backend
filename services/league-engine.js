'use strict';

/**
 * League fixture generation for round-robin and custom match counts.
 * Supports single and double round-robin, home/away, and odd participant counts.
 */

function buildRoundRobinSchedule(entries) {
  const rotation = [...entries];
  if (rotation.length % 2 !== 0) rotation.push({ id: '__bye__', name: 'Bye', team_name: null });
  const rounds = [];

  for (let roundIndex = 0; roundIndex < rotation.length - 1; roundIndex++) {
    const matches = [];
    for (let i = 0; i < rotation.length / 2; i++) {
      const home = rotation[i];
      const away = rotation[rotation.length - 1 - i];
      if (home.id === '__bye__' || away.id === '__bye__') continue;
      matches.push({ a: home.id, b: away.id });
    }
    rounds.push(matches);
    rotation.splice(1, 0, rotation.pop());
  }

  return rounds;
}

/**
 * Generate round-robin fixtures for any participant count.
 * Participants: array of {id, name, team_name}
 * Matches per team: number of total matches (not rounds)
 * Home away: boolean for bidirectional matches
 * Returns: array of {home_registration_id, away_registration_id, round_number}
 */
function generateLeagueFixtures(participants, matchesPerTeam = null, homeAway = false) {
  const unique = new Map();
  for (const participant of participants || []) {
    const normalized = {
      id: participant.id,
      name: String(participant.name || participant.participant_name || '').trim(),
      team_name: String(participant.team_name || '').trim() || null
    };
    if (!normalized.id || !normalized.name || unique.has(normalized.id)) continue;
    unique.set(normalized.id, normalized);
  }

  const entries = Array.from(unique.values());
  if (entries.length < 2) throw new Error('At least two unique participants are required');

  if (!matchesPerTeam) {
    matchesPerTeam = homeAway ? 2 * (entries.length - 1) : entries.length - 1;
  }

  const maxPossible = homeAway ? 2 * (entries.length - 1) : entries.length - 1;
  if (!Number.isInteger(matchesPerTeam) || matchesPerTeam < 1 || matchesPerTeam > maxPossible) {
    throw new Error(`Match count ${matchesPerTeam} exceeds maximum possible ${maxPossible}`);
  }
  if ((entries.length * matchesPerTeam) % 2 !== 0) {
    throw new Error(`Match count ${matchesPerTeam} cannot be satisfied exactly for ${entries.length} teams`);
  }

  const roundRobinMatches = buildRoundRobinSchedule(entries);
  const uniqueFixtureList = [];
  for (const round of roundRobinMatches) {
    for (const match of round) {
      uniqueFixtureList.push({
        home_registration_id: match.a,
        away_registration_id: match.b,
        stage: 'league_phase'
      });
    }
  }

  const desiredFixtureCount = Math.floor((matchesPerTeam * entries.length) / 2);
  const fixtures = [];
  const usedPairs = new Set();

  for (const fixture of uniqueFixtureList) {
    const pairKey = [fixture.home_registration_id, fixture.away_registration_id].sort().join('|');
    if (usedPairs.has(pairKey)) continue;
    usedPairs.add(pairKey);
    fixtures.push({
      ...fixture,
      round_number: fixtures.length + 1,
      stage: 'league_phase'
    });
    if (fixtures.length >= desiredFixtureCount) break;
  }

  if (homeAway && desiredFixtureCount > fixtures.length) {
    const reverseFixtures = uniqueFixtureList.map(fixture => ({
      home_registration_id: fixture.away_registration_id,
      away_registration_id: fixture.home_registration_id,
      stage: 'league_phase'
    }));

    for (const fixture of reverseFixtures) {
      const pairKey = [fixture.home_registration_id, fixture.away_registration_id].sort().join('|');
      if (usedPairs.has(pairKey)) continue;
      usedPairs.add(pairKey);
      fixtures.push({
        ...fixture,
        round_number: fixtures.length + 1,
        stage: 'league_phase'
      });
      if (fixtures.length >= desiredFixtureCount) break;
    }
  }

  return fixtures.slice(0, desiredFixtureCount);
}

module.exports = { generateLeagueFixtures };
