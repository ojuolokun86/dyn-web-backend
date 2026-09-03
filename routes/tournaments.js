'use strict';

const express = require('express');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { validateTournamentInput, generateSingleEliminationDraw, validateResult } = require('../services/tournament-logic');
const tournamentEngine = require('../services/tournament-engine');

const router = express.Router();

function cleanDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildFormatConfig(body = {}) {
  const config = {
    format_type: String(body.format_type || 'knockout').toLowerCase(),
    participant_count: Number(body.participant_limit || body.participant_count || 0),
    group_count: body.group_count ? Number(body.group_count) : undefined,
    matches_per_team: body.matches_per_team ? Number(body.matches_per_team) : undefined,
    home_away: Boolean(body.home_away),
    seeded_pots: body.seeded_pots ? Number(body.seeded_pots) : undefined,
      teams_per_group: body.teams_per_group ? Number(body.teams_per_group) : undefined,
    teams_per_pot: body.teams_per_pot ? Number(body.teams_per_pot) : undefined,
      direct_qualifiers: body.direct_qualifiers ? Number(body.direct_qualifiers) : 0,
      playoff_qualifiers: body.playoff_qualifiers ? Number(body.playoff_qualifiers) : 0,
    qualification_bands: parseQualificationBands(body.qualification_bands),
    tie_breakers: parseJsonArray(body.tie_breakers, ['points', 'goal_difference', 'goals_for', 'participant_id']),
    rules: body.rules && typeof body.rules === 'object' ? body.rules : {}
  };
  return config;
}

function parseQualificationBands(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function parseJsonArray(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function participantDisplayLabel(participant) {
  if (!participant) return 'TBD';
  const name = String(participant.participant_name || '').trim();
  const team = String(participant.team_name || '').trim();
  if (!name && !team) return 'Participant';
  if (team && (!name || name.toLowerCase() === team.toLowerCase())) return team;
  if (team) return `${name || 'Participant'} - ${team}`;
  return name || 'Participant';
}

function tournamentPayload(body = {}) {
  const legacyTournamentType = 'single_elimination';
  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim() || null,
    registration_opens_at: cleanDate(body.registration_opens_at),
    registration_closes_at: cleanDate(body.registration_closes_at),
    starts_at: cleanDate(body.starts_at),
    ends_at: cleanDate(body.ends_at),
    participant_limit: Number(body.participant_limit),
    tournament_type: legacyTournamentType,
    format_config: buildFormatConfig(body),
    prize_info: String(body.prize_info || '').trim() || null,
    rules: String(body.rules || '').trim() || null,
    source_type: body.source_type === 'league_category' ? 'league_category' : 'custom',
    category_id: body.category_id || null
  };
}

async function getTournament(id) {
  const { data, error } = await db.from('tournaments').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data;
}

router.get('/', async (req, res) => {
  try {
    let query = db.from('tournaments').select('*').neq('status', 'cancelled').order('created_at', { ascending: false });
    if (req.query.scope !== 'admin') query = query.in('status', ['registration', 'draw', 'in_progress', 'completed']).limit(2);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load tournaments' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const [{ data: registrations, error: registrationsError }, { data: rounds, error: roundsError }, { data: format }, { data: groups }, { data: fixtures }, { data: tournamentTeams }, { data: qualifications }] = await Promise.all([
      db.from('tournament_registrations').select('*').eq('tournament_id', tournament.id).order('created_at'),
      db.from('tournament_rounds').select('*, tournament_matches(*)').eq('tournament_id', tournament.id).order('round_number'),
      db.from('tournament_formats').select('*').eq('tournament_id', tournament.id).maybeSingle(),
      db.from('tournament_groups').select('*, tournament_group_members(*)').eq('tournament_id', tournament.id).order('group_number'),
      db.from('tournament_fixtures').select('*').eq('tournament_id', tournament.id).order('round_number'),
      db.from('tournament_teams').select('team_id, seed, status, teams(id, name, logo_url, email)').eq('tournament_id', tournament.id).order('seed'),
      db.from('tournament_qualifications').select('source_position, qualification_band, destination_stage, status, registration_id').eq('tournament_id', tournament.id).order('source_position')
    ]);
    if (registrationsError || roundsError) throw registrationsError || roundsError;
    const registrationMap = new Map((registrations || []).map(registration => [registration.id, registration]));
    const roundsWithDisplayParticipants = (rounds || []).map(round => ({
      ...round,
      tournament_matches: (round.tournament_matches || []).map(match => ({
        ...match,
        participant_a: registrationMap.get(match.participant_a_id) || null,
        participant_b: registrationMap.get(match.participant_b_id) || null,
        winner: registrationMap.get(match.winner_id) || null
      }))
    }));
    const teamMap = new Map((tournamentTeams || []).map(item => [item.team_id, item.teams]));
    const publicRegistrations = (registrations || []).map(registration => ({ ...registration, team: teamMap.get(registration.team_id) || null }));
    const fixtureParticipants = new Map(publicRegistrations.map(registration => [registration.id, registration]));
    const fixturesWithDisplayParticipants = (fixtures || []).map(fixture => ({
      ...fixture,
      home_team: participantDisplayLabel(fixtureParticipants.get(fixture.home_registration_id)),
      away_team: participantDisplayLabel(fixtureParticipants.get(fixture.away_registration_id)),
      home_logo_url: fixtureParticipants.get(fixture.home_registration_id)?.team?.logo_url || null,
      away_logo_url: fixtureParticipants.get(fixture.away_registration_id)?.team?.logo_url || null
    }));
    res.json({ success: true, data: { ...tournament, format_config: format || null, registrations: publicRegistrations, teams: tournamentTeams || [], rounds: roundsWithDisplayParticipants, groups: groups || [], fixtures: fixturesWithDisplayParticipants, qualifications: qualifications || [] } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load tournament' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const payload = tournamentPayload(req.body);
  const validation = validateTournamentInput(payload);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }
  try {
    const { data, error } = await db.from('tournaments').insert({ ...payload, created_by: req.admin.username || req.admin.email || 'admin' }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('[tournaments:create] Failed to create tournament', {
      message: error && error.message,
      details: error && error.details,
      code: error && error.code,
      body: req.body,
      admin: req.admin || null
    });
    res.status(500).json({ success: false, error: 'Failed to create tournament' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const tournament = await getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
  if (!['draft', 'registration'].includes(tournament.status)) return res.status(400).json({ success: false, error: 'Only draft or registration tournaments can be edited' });

  const payload = tournamentPayload(req.body);
  const validation = validateTournamentInput(payload);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }
  try {
    const { data, error } = await db.from('tournaments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', tournament.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update tournament' });
  }
});

router.post('/:id/open-registration', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (tournament.status !== 'draft') return res.status(400).json({ success: false, error: 'Tournament is not in draft status' });
    const { data, error } = await db.from('tournaments').update({ status: 'registration', updated_at: new Date().toISOString() }).eq('id', tournament.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to open registration' });
  }
});

router.post('/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (['completed', 'cancelled'].includes(tournament.status)) return res.status(400).json({ success: false, error: 'Tournament cannot be cancelled' });
    const { data, error } = await db.from('tournaments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', tournament.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to cancel tournament' });
  }
});

router.post('/:id/registrations', async (req, res) => {
  const participantName = String(req.body.participant_name || req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const teamName = String(req.body.team_name || '').trim() || null;
  if (!participantName || !email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Participant name and valid email are required' });

  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (tournament.status !== 'registration') return res.status(400).json({ success: false, error: 'Registration is not open' });
    const isAdminManagedTournament = String(tournament.source_type || '').trim().toLowerCase() === 'league_category' || Boolean(tournament.category_id) || (tournament.source_type && String(tournament.source_type).trim().toLowerCase() !== 'custom');
    if (isAdminManagedTournament) return res.status(403).json({ success: false, error: 'This tournament is managed by the administrator' });
    if (tournament.registration_closes_at && new Date(tournament.registration_closes_at) <= new Date()) return res.status(400).json({ success: false, error: 'Registration has closed' });

    const { count, error: countError } = await db.from('tournament_registrations').select('id', { count: 'exact', head: true }).eq('tournament_id', tournament.id).in('status', ['pending', 'approved']);
    if (countError) throw countError;
    if ((count || 0) >= tournament.participant_limit) return res.status(409).json({ success: false, error: 'Tournament participant limit has been reached' });

    const { data, error } = await db.from('tournament_registrations').insert({ tournament_id: tournament.id, participant_name: participantName, email, team_name: teamName, status: 'pending' }).select('id, tournament_id, participant_name, team_name, status, created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ success: false, error: 'This participant is already registered' });
      throw error;
    }
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to register participant' });
  }
});

router.post('/:id/teams', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (tournament.status !== 'draft') return res.status(409).json({ success: false, error: 'Teams can only be selected before registration opens' });
    const teamIds = Array.isArray(req.body.team_ids) ? [...new Set(req.body.team_ids)] : [];
    if (teamIds.length < 2 || teamIds.length > tournament.participant_limit) return res.status(400).json({ success: false, error: 'Select between two teams and the participant limit' });
    const { data: teams, error: teamError } = await db.from('teams').select('*').in('id', teamIds);
    if (teamError) throw teamError;
    if ((teams || []).length !== teamIds.length || teams.some(team => !team.logo_url)) return res.status(400).json({ success: false, error: 'Every selected team must exist and have a logo' });
    await db.from('tournament_teams').delete().eq('tournament_id', tournament.id);
    await db.from('tournament_registrations').delete().eq('tournament_id', tournament.id).eq('status', 'approved');
    const { error: selectedError } = await db.from('tournament_teams').insert(teamIds.map((team_id, index) => ({ tournament_id: tournament.id, team_id, seed: index + 1, status: 'approved' })));
    if (selectedError) throw selectedError;
    const registrations = teams.map(team => ({ tournament_id: tournament.id, team_id: team.id, participant_name: team.name, team_name: team.name, email: team.email || `${team.id}@team.invalid`, status: 'approved' }));
    const { data, error } = await db.from('tournament_registrations').insert(registrations).select('id, team_id, participant_name, team_name, email, status');
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to select tournament teams' }); }
});

router.post('/:id/teams/create', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (tournament.status !== 'draft') return res.status(409).json({ success: false, error: 'Teams can only be added while the tournament is in draft status' });

    const name = String(req.body.name || '').trim();
    const logoUrl = String(req.body.logo_url || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase() || null;

    if (!name) return res.status(400).json({ success: false, error: 'Team name is required' });
    if (!logoUrl) return res.status(400).json({ success: false, error: 'Team logo is required' });

    const { data: existingTeams, error: lookupError } = await db.from('teams').select('*').ilike('name', name).limit(1);
    if (lookupError) throw lookupError;

    let teamRecord = existingTeams && existingTeams[0] ? existingTeams[0] : null;
    if (!teamRecord) {
      const { data: insertedTeam, error: insertError } = await db.from('teams').insert({ name, logo_url: logoUrl, email, metadata: {} }).select().single();
      if (insertError) throw insertError;
      teamRecord = insertedTeam;
    } else if (!teamRecord.logo_url || teamRecord.logo_url !== logoUrl) {
      const { data: updatedTeam, error: updateError } = await db.from('teams').update({ logo_url: logoUrl, email: email || teamRecord.email, updated_at: new Date().toISOString() }).eq('id', teamRecord.id).select().single();
      if (updateError) throw updateError;
      teamRecord = updatedTeam;
    }

    const { count: teamCount, error: countError } = await db.from('tournament_teams').select('team_id', { count: 'exact', head: true }).eq('tournament_id', tournament.id);
    if (countError) throw countError;
    if ((teamCount || 0) >= Number(tournament.participant_limit || 0)) {
      return res.status(409).json({ success: false, error: 'Tournament participant limit reached' });
    }

    const { data: existingTournamentTeam, error: teamLookupError } = await db.from('tournament_teams').select('*').eq('tournament_id', tournament.id).eq('team_id', teamRecord.id).maybeSingle();
    if (teamLookupError) throw teamLookupError;

    if (!existingTournamentTeam) {
      const { error: insertTeamError } = await db.from('tournament_teams').insert({ tournament_id: tournament.id, team_id: teamRecord.id, seed: (teamCount || 0) + 1, status: 'approved' });
      if (insertTeamError) throw insertTeamError;
    }

    const { data: existingRegistration, error: registrationLookupError } = await db.from('tournament_registrations').select('id').eq('tournament_id', tournament.id).eq('team_id', teamRecord.id).maybeSingle();
    if (registrationLookupError) throw registrationLookupError;

    if (!existingRegistration) {
      const { error: registrationError } = await db.from('tournament_registrations').insert({
        tournament_id: tournament.id,
        team_id: teamRecord.id,
        participant_name: teamRecord.name,
        team_name: teamRecord.name,
        email: teamRecord.email || `${teamRecord.id}@team.invalid`,
        status: 'approved'
      });
      if (registrationError) throw registrationError;
    }

    res.status(201).json({ success: true, data: { team: teamRecord, tournament_id: tournament.id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to add team to tournament' });
  }
});

router.patch('/:id/registrations/:registrationId', requireAdmin, async (req, res) => {
  const status = String(req.body.status || '').toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid registration status' });
  try {
    const { data, error } = await db.from('tournament_registrations').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.registrationId).eq('tournament_id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Registration not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update registration' });
  }
});

router.post('/:id/draw', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (!['registration', 'draw'].includes(tournament.status)) return res.status(400).json({ success: false, error: 'Tournament is not ready for a draw' });

    const { data: registrations, error: registrationError } = await db.from('tournament_registrations').select('id, team_id, participant_name, team_name').eq('tournament_id', tournament.id).eq('status', 'approved').order('created_at');
    if (registrationError) throw registrationError;
    if (!registrations || registrations.length < 2) return res.status(400).json({ success: false, error: 'At least two approved participants are required' });
    if (registrations.length > tournament.participant_limit) return res.status(400).json({ success: false, error: 'Approved participants exceed the participant limit' });

    // Check for format configuration (Phase 3)
    const { data: format } = await db.from('tournament_formats').select('*').eq('tournament_id', tournament.id).single();

    let drawResult;
    const participants = registrations.map(item => ({ id: item.id, name: item.participant_name, team_name: item.team_name }));

    if (format && format.format_type !== 'knockout') {
      // Phase 3: Use configurable tournament engine
      drawResult = tournamentEngine.generateDraw(participants, format);
    } else {
      // Phase 2: Use legacy single-elimination draw
      const bracket = generateSingleEliminationDraw(participants);
      drawResult = { format_type: 'knockout', rounds: bracket.rounds };
    }

    // For knockout format, store in tournament_rounds and tournament_matches
    if (!format || format.format_type === 'knockout') {
      const { data: existingRounds } = await db.from('tournament_rounds').select('id').eq('tournament_id', tournament.id);
      if (existingRounds?.length) {
        await db.from('tournament_rounds').delete().eq('tournament_id', tournament.id);
      }

      const roundRows = [];
      for (const round of drawResult.rounds) {
        const { data: roundRow, error } = await db.from('tournament_rounds').insert({ tournament_id: tournament.id, round_number: round.round_number, stage: round.stage, status: 'scheduled' }).select().single();
        if (error) throw error;
        roundRows.push({ ...round, id: roundRow.id });
      }

      const matchRows = [];
      for (const round of roundRows) {
        for (const match of round.matches) {
          const { data: matchRow, error } = await db.from('tournament_matches').insert({ tournament_id: tournament.id, round_id: round.id, match_number: match.match_number, participant_a_id: match.participant_a_id, participant_b_id: match.participant_b_id, winner_id: match.winner_id, status: match.status, next_slot: match.next_slot }).select().single();
          if (error) throw error;
          matchRows.push({ ...match, id: matchRow.id, round_number: round.round_number });
        }
      }

      for (const match of matchRows) {
        const next = matchRows.find(candidate => candidate.round_number === match.round_number + 1 && candidate.match_number === match.next_match_number);
        if (next) await db.from('tournament_matches').update({ next_match_id: next.id }).eq('id', match.id);
        if (match.winner_id && next) await db.from('tournament_matches').update({ [`participant_${match.next_slot}_id`]: match.winner_id }).eq('id', next.id);
      }
    } else {
      // Phase 3: Store groups and fixtures
      if (drawResult.groups) {
        // Store groups
        for (const group of drawResult.groups) {
          const { data: groupRow, error } = await db.from('tournament_groups').insert({
            tournament_id: tournament.id,
            name: `Group ${String.fromCharCode(64 + group.number)}`,
            group_number: group.number,
            stage: 'group',
            status: 'scheduled'
          }).select().single();
          if (error) throw error;

          // Store group members
          for (const member of group.members) {
            const { error: memberError } = await db.from('tournament_group_members').insert({
              group_id: groupRow.id,
              registration_id: member.id,
              seed: member.seed
            });
            if (memberError) throw memberError;
          }
        }
      }

      // Store fixtures
      if (drawResult.group_fixtures) {
        const { data: groups } = await db.from('tournament_groups').select('id, group_number').eq('tournament_id', tournament.id);
        const groupMap = new Map(groups.map(g => [g.group_number, g.id]));

        for (const groupFixtures of drawResult.group_fixtures) {
          const groupId = groupMap.get(groupFixtures.group_number);
          for (const fixture of groupFixtures.fixtures) {
            const { error } = await db.from('tournament_fixtures').insert({
              tournament_id: tournament.id,
              group_id: groupId,
              stage: 'group',
              round_number: fixture.round_number,
              home_registration_id: fixture.home_registration_id,
              away_registration_id: fixture.away_registration_id,
              status: 'scheduled'
            });
            if (error) throw error;
          }
        }
      }

      if (drawResult.fixtures) {
        // League-phase or league fixtures
        for (const fixture of drawResult.fixtures) {
          const normalizedStage = fixture.stage === 'league' ? 'league_phase' : (fixture.stage || 'league_phase');
          const { error } = await db.from('tournament_fixtures').insert({
            tournament_id: tournament.id,
            stage: normalizedStage,
            round_number: fixture.round_number,
            home_registration_id: fixture.home_registration_id,
            away_registration_id: fixture.away_registration_id,
            status: 'scheduled'
          });
          if (error) throw error;
        }
      }
    }

    const { data: updated, error: updateError } = await db.from('tournaments').update({ status: 'draw', updated_at: new Date().toISOString() }).eq('id', tournament.id).select().single();
    if (updateError) throw updateError;
    res.json({ success: true, data: updated, draw: drawResult });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create tournament draw' });
  }
});

router.post('/:id/matches/:matchId/result', requireAdmin, async (req, res) => {
  try {
    const { data: match, error: matchError } = await db.from('tournament_matches').select('*').eq('id', req.params.matchId).eq('tournament_id', req.params.id).single();
    if (matchError || !match) return res.status(404).json({ success: false, error: 'Match not found' });
    const validation = validateResult(match, req.body.winner_id, req.body.score_a, req.body.score_b);
    if (!validation.valid) return res.status(400).json({ success: false, error: validation.error });

    const { data: updatedMatch, error } = await db.from('tournament_matches').update({ winner_id: req.body.winner_id, score_a: validation.scoreA, score_b: validation.scoreB, status: 'completed', updated_at: new Date().toISOString() }).eq('id', match.id).select().single();
    if (error) throw error;

    if (match.next_match_id) {
      const slot = match.next_slot === 'b' ? 'participant_b_id' : 'participant_a_id';
      await db.from('tournament_matches').update({ [slot]: req.body.winner_id, status: 'scheduled' }).eq('id', match.next_match_id);
      await db.from('tournaments').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('status', 'draw');
    } else {
      await db.from('tournaments').update({ status: 'completed', winner_participant_id: req.body.winner_id, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    }
    res.json({ success: true, data: updatedMatch });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to submit match result' });
  }
});

router.patch('/:id/matches/:matchId/dispute', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await db.from('tournament_matches').update({ status: 'disputed', dispute_note: String(req.body.note || '').trim() || null, updated_at: new Date().toISOString() }).eq('id', req.params.matchId).eq('tournament_id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Match not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to record match dispute' });
  }
});

// Phase 3: Format configuration
router.post('/:id/format-config', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });
    if (!['draft', 'registration'].includes(tournament.status)) {
      return res.status(400).json({ success: false, error: 'Format configuration requires draft or registration status' });
    }
    const [{ count: fixtureCount }, { count: groupCount }] = await Promise.all([
      db.from('tournament_fixtures').select('id', { count: 'exact', head: true }).eq('tournament_id', tournament.id),
      db.from('tournament_groups').select('id', { count: 'exact', head: true }).eq('tournament_id', tournament.id)
    ]);
    if ((fixtureCount || 0) > 0 || (groupCount || 0) > 0) return res.status(409).json({ success: false, error: 'Format configuration is locked after draw generation' });

    const formatConfig = buildFormatConfig(req.body);
    const validation = tournamentEngine.validateFormatConfig(formatConfig);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const { data, error } = await db.from('tournament_formats').upsert(
      { tournament_id: tournament.id, ...formatConfig, updated_at: new Date().toISOString() },
      { onConflict: 'tournament_id' }
    ).select().single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to set format configuration' });
  }
});

// Phase 3: Submit fixtures for league/group formats
router.post('/:id/fixtures', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const fixtures = Array.isArray(req.body) ? req.body : [req.body];
    if (fixtures.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one fixture is required' });
    }

    const rows = fixtures.map(fixture => ({
      tournament_id: tournament.id,
      group_id: fixture.group_id || null,
      stage: String(fixture.stage || 'league_phase'),
      round_number: Number(fixture.round_number || 1),
      home_registration_id: fixture.home_registration_id,
      away_registration_id: fixture.away_registration_id,
      status: 'scheduled',
      created_at: new Date().toISOString()
    }));

    // Delete existing fixtures for this tournament if replacing
    if (req.body.replace !== false) {
      await db.from('tournament_fixtures').delete().eq('tournament_id', tournament.id);
    }

    const { data, error } = await db.from('tournament_fixtures').insert(rows).select();
    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to submit fixtures' });
  }
});

// Phase 3: Get standings for a tournament
router.get('/:id/standings', async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const groupId = req.query.group_id || null;

    const [{ data: participants, error: participantsError }, { data: fixtures, error: fixturesError }] = await Promise.all([
      db.from('tournament_registrations').select('*').eq('tournament_id', tournament.id).eq('status', 'approved'),
      db.from('tournament_fixtures').select('*').eq('tournament_id', tournament.id).eq('status', 'completed').eq(groupId ? 'group_id' : 'tournament_id', groupId || tournament.id)
    ]);

    if (participantsError || fixturesError) throw participantsError || fixturesError;

    const { data: teams } = await db.from('teams').select('id, logo_url').in('id', (participants || []).map(participant => participant.team_id).filter(Boolean));
    const logoMap = new Map((teams || []).map(team => [team.id, team.logo_url]));
    const participantsWithLogos = (participants || []).map(participant => ({ ...participant, logo_url: logoMap.get(participant.team_id) || null }));
    const standings = tournamentEngine.calculateStandings(
      participantsWithLogos,
      fixtures || [],
      undefined // Use default tie-breakers
    );

    res.json({ success: true, data: standings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to calculate standings' });
  }
});

// Phase 3: Generate qualifications from standings
router.post('/:id/qualifications', requireAdmin, async (req, res) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const { data: format } = await db.from('tournament_formats').select('*').eq('tournament_id', tournament.id).single();
    if (!format) {
      return res.status(400).json({ success: false, error: 'Format configuration not found' });
    }

    const { data: participants, error: participantsError } = await db.from('tournament_registrations').select('id, participant_name, team_name').eq('tournament_id', tournament.id).eq('status', 'approved');
    if (participantsError) throw participantsError;

    const { data: fixtures, error: fixturesError } = await db.from('tournament_fixtures').select('*').eq('tournament_id', tournament.id).eq('status', 'completed');
    if (fixturesError) throw fixturesError;

    const standings = tournamentEngine.calculateStandings(participants || [], fixtures || []);
    const qualifications = tournamentEngine.generateQualifications(standings, format.qualification_bands);

    // Store qualifications
    const rows = qualifications.map(q => ({
      tournament_id: tournament.id,
      registration_id: q.registration_id,
      source_group_id: q.source_group_id || null,
      source_position: q.source_position,
      qualification_band: q.qualification_band,
      destination_stage: q.destination_stage,
      status: q.status,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await db.from('tournament_qualifications').insert(rows).select();
    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate qualifications' });
  }
});

// Phase 3: Submit fixture result for league/group formats
router.post('/:id/fixtures/:fixtureId/result', requireAdmin, async (req, res) => {
  try {
    const { data: fixture, error: fixtureError } = await db.from('tournament_fixtures').select('*').eq('id', req.params.fixtureId).eq('tournament_id', req.params.id).single();
    if (fixtureError || !fixture) return res.status(404).json({ success: false, error: 'Fixture not found' });

    if (fixture.status === 'disputed') return res.status(400).json({ success: false, error: 'Resolve the fixture dispute before changing its result' });

    const homeScore = Number(req.body.home_score);
    const awayScore = Number(req.body.away_score);

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      return res.status(400).json({ success: false, error: 'Scores must be non-negative integers' });
    }

    const { data, error } = await db.from('tournament_fixtures').update({
      home_score: homeScore,
      away_score: awayScore,
      status: 'completed',
      updated_at: new Date().toISOString()
    }).eq('id', fixture.id).select().single();

    if (error) throw error;
    await db.from('tournament_qualifications').delete().eq('tournament_id', req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to submit fixture result' });
  }
});

router.patch('/:id/fixtures/:fixtureId/dispute', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await db.from('tournament_fixtures').update({ status: 'disputed', dispute_note: String(req.body.note || '').trim() || null, updated_at: new Date().toISOString() }).eq('id', req.params.fixtureId).eq('tournament_id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Fixture not found' });
    await db.from('tournament_qualifications').delete().eq('tournament_id', req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to dispute fixture' });
  }
});

module.exports = router;

// Export for testing
if (typeof module.exports.buildFormatConfig !== 'function') {
  module.exports.buildFormatConfig = buildFormatConfig;
}
