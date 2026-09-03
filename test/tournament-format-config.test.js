'use strict';

const router = require('../routes/tournaments');
const { buildFormatConfig } = router;

(async function run() {
  const config = buildFormatConfig({
    format_type: 'league_phase_knockout',
    participant_limit: 12,
    group_count: 3,
    matches_per_team: 2,
    home_away: true,
    seeded_pots: 3,
    qualification_bands: '[{"band":"direct","from_rank":1,"to_rank":4,"status":"qualified"}]'
  });

  if (config.format_type !== 'league_phase_knockout') {
    throw new Error('Format type was not normalized to the configured value');
  }

  if (config.participant_count !== 12) {
    throw new Error('Participant count did not inherit from participant_limit');
  }

  if (!Array.isArray(config.qualification_bands) || config.qualification_bands.length !== 1) {
    throw new Error('Qualification bands were not parsed from the JSON string');
  }

  console.log('✔ tournament format config normalization');
})();

