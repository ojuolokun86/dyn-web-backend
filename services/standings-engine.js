'use strict';

/**
 * Standings calculation from fixtures with configurable tie-breakers.
 */

/**
 * Calculate standings for a set of fixtures.
 * Fixtures: array of {home_registration_id, away_registration_id, home_score, away_score, status}
 * Tie breakers: array of field names in priority order
 * Returns: array of sorted {registration_id, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, rank}
 */
function calculateStandings(participants, fixtures, tieBreakers = null) {
  const standings = new Map();

  // Initialize standings for each participant
  for (const participant of participants) {
    standings.set(participant.id, {
      registration_id: participant.id,
      participant_name: participant.participant_name || participant.name || '',
      team_name: participant.team_name || '',
      logo_url: participant.logo_url || null,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
      head_to_head: {}
    });
  }

  // Process completed fixtures
  for (const fixture of fixtures || []) {
    if (fixture.status !== 'completed') continue;

    const homeId = fixture.home_registration_id;
    const awayId = fixture.away_registration_id;
    const homeScore = fixture.home_score || 0;
    const awayScore = fixture.away_score || 0;

    const home = standings.get(homeId);
    const away = standings.get(awayId);

    if (!home || !away) continue;

    // Update stats
    home.played += 1;
    away.played += 1;
    home.goals_for += homeScore;
    home.goals_against += awayScore;
    away.goals_for += awayScore;
    away.goals_against += homeScore;

    // Determine result
    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (homeScore < awayScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }

    // Store head-to-head for tie-breaker
    home.head_to_head[awayId] = { for: homeScore, against: awayScore };
    away.head_to_head[homeId] = { for: awayScore, against: homeScore };
  }

  // Calculate goal difference
  for (const row of standings.values()) {
    row.goal_difference = row.goals_for - row.goals_against;
  }

  // Apply default tie-breakers if not specified
  if (!tieBreakers) {
    tieBreakers = ['points', 'goal_difference', 'goals_for', 'registration_id'];
  }

  // Sort by tie-breakers
  const sorted = Array.from(standings.values()).sort((a, b) => {
    for (const breaker of tieBreakers) {
      let aVal = a[breaker];
      let bVal = b[breaker];

      if (breaker === 'registration_id') {
        // Deterministic fallback
        aVal = a.registration_id || '';
        bVal = b.registration_id || '';
        return aVal.localeCompare(bVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (aVal !== bVal) return bVal - aVal; // Descending for numeric
      }
    }
    return 0;
  });

  // Assign ranks
  sorted.forEach((row, index) => {
    row.rank = index + 1;
  });

  // Clean up transient fields
  return sorted.map(row => {
    const { head_to_head, ...clean } = row;
    return clean;
  });
}

module.exports = { calculateStandings };
