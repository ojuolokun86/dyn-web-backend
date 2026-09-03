'use strict';

/**
 * Main tournament engine dispatcher - routes format requests to appropriate engines.
 * Supports: knockout, league, group_knockout, league_phase_knockout
 */

const knockoutEngine = require('./knockout-engine');
const leagueEngine = require('./league-engine');
const groupEngine = require('./group-engine');
const leaguePhaseEngine = require('./league-phase-engine');
const standingsEngine = require('./standings-engine');
const qualificationEngine = require('./qualification-engine');

const FORMATS = {
  knockout: 'knockout',
  league: 'league',
  group_knockout: 'group_knockout',
  league_phase_knockout: 'league_phase_knockout'
};

/**
 * Validate tournament format configuration.
 * Returns: {valid: boolean, error?: string}
 */
function validateFormatConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Format config must be an object' };
  }

  if (!Object.values(FORMATS).includes(config.format_type)) {
    return { valid: false, error: `Invalid format type: ${config.format_type}` };
  }

  if (!Number.isInteger(config.participant_count) || config.participant_count < 2) {
    return { valid: false, error: 'Participant count must be integer >= 2' };
  }

  switch (config.format_type) {
    case FORMATS.knockout:
      // No special validation needed
      break;

    case FORMATS.league:
      if (!Number.isInteger(config.matches_per_team) || config.matches_per_team < 1) {
        return { valid: false, error: 'Matches per team must be >= 1' };
      }
      if (config.matches_per_team > (config.home_away ? 2 : 1) * (config.participant_count - 1) || (config.participant_count * config.matches_per_team) % 2 !== 0) return { valid: false, error: 'Matches per team cannot be satisfied exactly for this participant count' };
      break;

    case FORMATS.group_knockout:
      if (!Number.isInteger(config.group_count) || config.group_count < 1) {
        return { valid: false, error: 'Group count must be integer >= 1' };
      }
      if (config.participant_count < config.group_count) {
        return { valid: false, error: 'Participant count must be >= group count' };
      }
      if (config.teams_per_group && config.teams_per_group < 2) return { valid: false, error: 'Teams per group must be >= 2' };
      break;

    case FORMATS.league_phase_knockout:
      if (!Number.isInteger(config.seeded_pots) || config.seeded_pots < 1) {
        return { valid: false, error: 'Seeded pots must be integer >= 1' };
      }
      if (config.teams_per_pot && config.seeded_pots * config.teams_per_pot < config.participant_count) return { valid: false, error: 'Seeded pots do not contain enough team slots' };
      if (!Number.isInteger(config.matches_per_team) || config.matches_per_team < 1) {
        return { valid: false, error: 'Matches per team must be integer >= 1' };
      }
      if (!Array.isArray(config.qualification_bands) || config.qualification_bands.length === 0) {
        return { valid: false, error: 'Qualification bands required for league_phase_knockout' };
      }
      try { qualificationEngine.generateQualifications(Array.from({ length: config.participant_count }, (_, index) => ({ registration_id: String(index), rank: index + 1 })), config.qualification_bands); } catch (error) { return { valid: false, error: error.message }; }
      break;

    default:
      return { valid: false, error: `Unknown format: ${config.format_type}` };
  }

  return { valid: true };
}

/**
 * Generate draw for a tournament based on format.
 * Participants: array of {id, name, team_name}
 * Returns: {format_type, groups?, rounds?, fixtures?, qualifications?}
 */
function generateDraw(participants, config) {
  const validation = validateFormatConfig(config);
  if (!validation.valid) throw new Error(validation.error);

  switch (config.format_type) {
    case FORMATS.knockout:
      return {
        format_type: FORMATS.knockout,
        rounds: knockoutEngine.generateKnockoutBracket(participants).rounds
      };

    case FORMATS.league:
      return {
        format_type: FORMATS.league,
        fixtures: leagueEngine.generateLeagueFixtures(
          participants,
          config.matches_per_team,
          config.home_away || false
        )
      };

    case FORMATS.group_knockout:
      const groups = groupEngine.distributeIntoGroups(participants, config.group_count);
      const groupFixtures = [];
      for (const group of groups) {
        const fixtures = leagueEngine.generateLeagueFixtures(
          group.members,
          group.members.length - 1, // Each team plays each other once
          config.home_away || false
        );
        groupFixtures.push({
          group_number: group.number,
          fixtures
        });
      }
      return {
        format_type: FORMATS.group_knockout,
        groups: groups.map(g => ({
          number: g.number,
          members: g.members.map(m => ({ ...m, seed: m.seed }))
        })),
        group_fixtures: groupFixtures
      };

    case FORMATS.league_phase_knockout:
      const leaguePhaseDraw = leaguePhaseEngine.generateLeaguePhaseDraw(
        participants,
        config.seeded_pots,
        config.matches_per_team,
        config.home_away || false,
        config.teams_per_pot
      );
      return {
        format_type: FORMATS.league_phase_knockout,
        pots: leaguePhaseDraw.pots,
        fixtures: leaguePhaseDraw.fixtures,
        qualification_bands: config.qualification_bands
      };

    default:
      throw new Error(`Unsupported format: ${config.format_type}`);
  }
}

/**
 * Calculate standings for a tournament.
 * Participants: array of {id, name, team_name}
 * Fixtures: array of completed {home_registration_id, away_registration_id, home_score, away_score}
 * Returns: sorted standings array
 */
function calculateStandings(participants, fixtures, tieBreakers) {
  return standingsEngine.calculateStandings(participants, fixtures, tieBreakers);
}

/**
 * Generate qualifications from standings.
 */
function generateQualifications(standings, qualificationBands) {
  return qualificationEngine.generateQualifications(standings, qualificationBands);
}

module.exports = {
  FORMATS,
  validateFormatConfig,
  generateDraw,
  calculateStandings,
  generateQualifications
};
