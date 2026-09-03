'use strict';

/**
 * League-phase fixture generation with seeded pots and constraint validation.
 * Supports configurable participant counts, not hardcoded to 36 teams.
 */

/**
 * Generate league-phase draw with seeded pots.
 * Participants: array of {id, name, team_name}
 * Pot count: number of seeded pots
 * Matches per team: number of matches each team plays
 * Home away: boolean for reversed fixtures
 * Returns: {pots, fixtures}
 */
function generateLeaguePhaseDraw(participants, potCount, matchesPerTeam, homeAway = false, configuredTeamsPerPot = null) {
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
  if (entries.length < 2) throw new Error('At least two participants required');
  if (potCount < 1) throw new Error('Pot count must be at least 1');

  // Validate match count
  const maxMatches = homeAway ? 2 * (entries.length - 1) : entries.length - 1;
  if (matchesPerTeam > maxMatches) {
    throw new Error(`Match count ${matchesPerTeam} exceeds maximum ${maxMatches}`);
  }

  // Distribute into pots
  const teamsPerPot = configuredTeamsPerPot || Math.ceil(entries.length / potCount);
  if (!Number.isInteger(teamsPerPot) || teamsPerPot < 1 || teamsPerPot * potCount < entries.length) throw new Error('Configured pot sizes cannot contain all participants');
  const pots = Array.from({ length: potCount }, (_, i) => ({
    pot: i + 1,
    teams: entries.slice(i * teamsPerPot, (i + 1) * teamsPerPot)
  }));

  // Generate fixtures avoiding same-pot duplication
  const fixtures = [];
  const assignedOpponents = new Map();

  for (let matchIndex = 0; matchIndex < matchesPerTeam; matchIndex++) {
    for (const team of entries) {
      if (!assignedOpponents.has(team.id)) {
        assignedOpponents.set(team.id, new Set());
      }

      const opponents = assignedOpponents.get(team.id);
      if (opponents.size >= matchesPerTeam) continue;

      // Find opponent from different pot
      let opponent = null;
      for (const candidate of entries) {
        if (candidate.id === team.id || opponents.has(candidate.id)) continue;

        // Prefer different pot
        const teamPot = Math.floor(entries.indexOf(team) / teamsPerPot);
        const candidatePot = Math.floor(entries.indexOf(candidate) / teamsPerPot);
        if (teamPot !== candidatePot) {
          opponent = candidate;
          break;
        }
      }

      if (!opponent) {
        // Fall back to any non-assigned opponent
        for (const candidate of entries) {
          if (candidate.id === team.id || opponents.has(candidate.id)) continue;
          opponent = candidate;
          break;
        }
      }

      if (opponent) {
        opponents.add(opponent.id);
        if (!assignedOpponents.has(opponent.id)) {
          assignedOpponents.set(opponent.id, new Set());
        }
        assignedOpponents.get(opponent.id).add(team.id);

        fixtures.push({
          home_registration_id: team.id,
          away_registration_id: opponent.id,
          stage: 'league_phase',
          round_number: matchIndex + 1
        });

        if (homeAway && opponents.size < matchesPerTeam) {
          fixtures.push({
            home_registration_id: opponent.id,
            away_registration_id: team.id,
            stage: 'league_phase',
            round_number: matchIndex + 1
          });
        }
      }
    }
  }

  return { pots, fixtures };
}

module.exports = { generateLeaguePhaseDraw };
