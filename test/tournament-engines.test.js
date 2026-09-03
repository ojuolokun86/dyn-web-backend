'use strict';

const { generateKnockoutBracket, validateKnockoutResult } = require('../services/knockout-engine');
const { generateLeagueFixtures } = require('../services/league-engine');
const { calculateStandings } = require('../services/standings-engine');
const { distributeIntoGroups } = require('../services/group-engine');
const { generateLeaguePhaseDraw } = require('../services/league-phase-engine');
const { generateQualifications } = require('../services/qualification-engine');

// Test data generator
function generateParticipants(count, prefix = 'Team') {
  const participants = [];
  for (let i = 1; i <= count; i++) {
    participants.push({
      id: `team-${i}`,
      participant_name: `${prefix} ${i}`,
      team_name: `${prefix} ${i}`
    });
  }
  return participants;
}

// Knockout bracket tests
async function testKnockoutBracket() {
  const tests = [
    { count: 2, name: '2 participants (final only)' },
    { count: 3, name: '3 participants (non-power-of-two)' },
    { count: 4, name: '4 participants (power of 2)' },
    { count: 5, name: '5 participants (byes)' },
    { count: 7, name: '7 participants (multiple byes)' },
    { count: 8, name: '8 participants (power of 2)' },
    { count: 15, name: '15 participants (many byes)' },
    { count: 16, name: '16 participants (power of 2)' },
    { count: 18, name: '18 participants (custom)' },
    { count: 32, name: '32 participants (large power of 2)' },
    { count: 50, name: '50 participants (large odd)' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const participants = generateParticipants(test.count);
      const bracket = generateKnockoutBracket(participants);

      // Validate bracket structure
      if (!bracket.bracket_size || !bracket.rounds) {
        throw new Error('Missing bracket structure');
      }

      // Verify bracket size is power of two
      let size = bracket.bracket_size;
      while (size > 1) {
        if (size % 2 !== 0) throw new Error('Bracket size is not power of two');
        size /= 2;
      }

      // Verify all participants assigned or bye
      const assigned = new Set();
      for (const round of bracket.rounds) {
        for (const match of round.matches) {
          if (match.participant_a_id) assigned.add(match.participant_a_id);
          if (match.participant_b_id) assigned.add(match.participant_b_id);
        }
      }

      if (assigned.size !== test.count) {
        throw new Error(`Assigned ${assigned.size} participants, expected ${test.count}`);
      }

      console.log(`✔ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      failed += 1;
    }
  }

  return { name: 'Knockout bracket generation', passed, failed };
}

// League fixture tests
async function testLeagueFixtures() {
  const tests = [
    { count: 3, matches: null, homeAway: false, name: '3 teams single RR' },
    { count: 4, matches: null, homeAway: false, name: '4 teams single RR' },
    { count: 5, matches: null, homeAway: false, name: '5 teams single RR (odd)' },
    { count: 6, matches: 3, homeAway: false, name: '6 teams with limited matches' },
    { count: 4, matches: 1, homeAway: true, name: '4 teams one match per team with home-away should not duplicate pair' },
    { count: 4, matches: 6, homeAway: true, name: '4 teams double RR' },
    { count: 8, matches: 4, homeAway: true, name: '8 teams with custom match limit' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const participants = generateParticipants(test.count);
      const fixtures = generateLeagueFixtures(participants, test.matches, test.homeAway);

      if (!Array.isArray(fixtures)) throw new Error('Fixtures not array');
      if (fixtures.length === 0 && test.count > 1) throw new Error('No fixtures generated');

      const seen = new Set();
      const pairMap = new Map();
      for (const fixture of fixtures) {
        if (fixture.home_registration_id === fixture.away_registration_id) {
          throw new Error('Participant plays themselves');
        }

        const key = `${fixture.home_registration_id}@${fixture.away_registration_id}`;
        const reverseKey = `${fixture.away_registration_id}@${fixture.home_registration_id}`;
        if (seen.has(key)) throw new Error(`Duplicate matchup: ${key}`);
        seen.add(key);

        if (test.homeAway && test.matches === 1) {
          if (pairMap.has(reverseKey) || pairMap.has(key)) {
            throw new Error(`Reverse fixture created for single-match setup: ${key}`);
          }
          pairMap.set(key, true);
        }
      }

      console.log(`✔ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      failed += 1;
    }
  }

  return { name: 'League fixture generation', passed, failed };
}

// Standings calculation tests
async function testStandingsCalculation() {
  const tests = [
    {
      name: 'Basic 3-team standings',
      participants: 3,
      fixtures: [
        { home_registration_id: 'team-1', away_registration_id: 'team-2', home_score: 2, away_score: 1, status: 'completed' },
        { home_registration_id: 'team-2', away_registration_id: 'team-3', home_score: 1, away_score: 1, status: 'completed' },
        { home_registration_id: 'team-1', away_registration_id: 'team-3', home_score: 3, away_score: 0, status: 'completed' }
      ],
      expectedRanks: ['team-1', 'team-2', 'team-3']
    },
    {
      name: 'Tied points standings',
      participants: 2,
      fixtures: [
        { home_registration_id: 'team-1', away_registration_id: 'team-2', home_score: 1, away_score: 1, status: 'completed' }
      ],
      expectedRanks: ['team-1', 'team-2']
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const participants = generateParticipants(test.participants);
      const standings = calculateStandings(participants, test.fixtures);

      if (!Array.isArray(standings)) throw new Error('Standings not array');

      // Verify standings count
      if (standings.length !== test.participants) {
        throw new Error(`Expected ${test.participants} standings, got ${standings.length}`);
      }

      // Verify all required fields
      for (const row of standings) {
        if (row.rank === undefined || row.points === undefined || row.played === undefined) {
          throw new Error('Missing required standing fields');
        }
      }

      // Verify rank order
      let lastRank = 0;
      for (const row of standings) {
        if (row.rank <= lastRank) throw new Error('Ranks not in order');
        lastRank = row.rank;
      }

      console.log(`✔ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      failed += 1;
    }
  }

  return { name: 'Standings calculation', passed, failed };
}

// Group distribution tests
async function testGroupDistribution() {
  const tests = [
    { count: 4, groups: 1, name: '4 teams 1 group' },
    { count: 6, groups: 2, name: '6 teams 2 groups' },
    { count: 7, groups: 2, name: '7 teams 2 groups (uneven)' },
    { count: 10, groups: 3, name: '10 teams 3 groups' },
    { count: 24, groups: 4, name: '24 teams 4 groups' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const participants = generateParticipants(test.count);
      const groups = distributeIntoGroups(participants, test.groups);

      if (!Array.isArray(groups)) throw new Error('Groups not array');
      if (groups.length !== test.groups) throw new Error(`Expected ${test.groups} groups, got ${groups.length}`);

      // Verify all participants assigned
      let totalMembers = 0;
      const seen = new Set();
      for (const group of groups) {
        if (!group.members || group.members.length === 0) {
          throw new Error('Empty group');
        }
        for (const member of group.members) {
          if (seen.has(member.id)) throw new Error(`Duplicate participant ${member.id}`);
          seen.add(member.id);
          totalMembers += 1;
        }
      }

      if (totalMembers !== test.count) {
        throw new Error(`Expected ${test.count} members, got ${totalMembers}`);
      }

      // Verify group size balance
      const sizes = groups.map(g => g.members.length);
      const maxDiff = Math.max(...sizes) - Math.min(...sizes);
      if (maxDiff > 1) throw new Error(`Group sizes not balanced: ${sizes}`);

      console.log(`✔ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      failed += 1;
    }
  }

  return { name: 'Group distribution', passed, failed };
}

// League-phase draw tests
async function testLeaguePhaseDraw() {
  const tests = [
    { count: 8, pots: 2, matches: 6, name: '8 teams 2 pots 6 matches' },
    { count: 16, pots: 4, matches: 5, name: '16 teams 4 pots 5 matches' },
    { count: 24, pots: 4, matches: 6, name: '24 teams 4 pots 6 matches' },
    { count: 36, pots: 4, matches: 8, name: '36 teams 4 pots 8 matches' },
    { count: 20, pots: 5, matches: 10, name: '20 teams 5 pots 10 matches' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const participants = generateParticipants(test.count);
      const draw = generateLeaguePhaseDraw(participants, test.pots, test.matches, false);

      if (!draw.pots || !Array.isArray(draw.pots)) throw new Error('Invalid pot structure');
      if (draw.pots.length !== test.pots) throw new Error(`Expected ${test.pots} pots, got ${draw.pots.length}`);

      // Verify all fixtures
      if (!Array.isArray(draw.fixtures)) throw new Error('Fixtures not array');

      // Verify no duplicate opponents
      const opponents = new Map();
      for (const fixture of draw.fixtures) {
        if (fixture.home_registration_id === fixture.away_registration_id) {
          throw new Error('Self-play detected');
        }

        const key = fixture.home_registration_id;
        if (!opponents.has(key)) opponents.set(key, new Set());
        if (opponents.get(key).has(fixture.away_registration_id)) {
          throw new Error(`Duplicate opponent for ${key}`);
        }
        opponents.get(key).add(fixture.away_registration_id);
      }

      console.log(`✔ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      failed += 1;
    }
  }

  return { name: 'League-phase draw', passed, failed };
}

// Qualification tests
async function testQualifications() {
  const standings = [
    { registration_id: 'team-1', rank: 1 },
    { registration_id: 'team-2', rank: 2 },
    { registration_id: 'team-3', rank: 3 },
    { registration_id: 'team-4', rank: 4 },
    { registration_id: 'team-5', rank: 5 }
  ];

  const tests = [
    {
      name: 'Direct all to knockout',
      bands: undefined,
      expectedCount: 5
    },
    {
      name: 'Top 2 direct, 3-4 playoff, 5+ eliminated',
      bands: [
        { band: 'direct', from_rank: 1, to_rank: 2, destination_stage: 'round_of_16', status: 'qualified' },
        { band: 'playoff', from_rank: 3, to_rank: 4, destination_stage: 'playoff', status: 'playoff' },
        { band: 'eliminated', from_rank: 5, to_rank: 100, destination_stage: null, status: 'eliminated' }
      ],
      expectedCount: 5
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const qualifications = generateQualifications(standings, test.bands);

      if (!Array.isArray(qualifications)) throw new Error('Qualifications not array');
      if (qualifications.length !== test.expectedCount) {
        throw new Error(`Expected ${test.expectedCount} qualifications, got ${qualifications.length}`);
      }

      console.log(`✔ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      failed += 1;
    }
  }

  return { name: 'Qualifications', passed, failed };
}

// Run all tests
async function runAllTests() {
  console.log('Starting Phase 3 engine tests...\n');

  const results = [];
  results.push(await testKnockoutBracket());
  results.push(await testLeagueFixtures());
  results.push(await testStandingsCalculation());
  results.push(await testGroupDistribution());
  results.push(await testLeaguePhaseDraw());
  results.push(await testQualifications());

  console.log('\n=== Test Summary ===');
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    const status = result.failed === 0 ? '✔' : '✗';
    console.log(`${status} ${result.name}: ${result.passed}/${result.passed + result.failed} passed`);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed`);
  process.exit(totalFailed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);

module.exports = { runAllTests };
