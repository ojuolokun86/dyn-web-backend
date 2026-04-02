const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get total votes for each contender in an event
router.get('/event/:eventId/contender-votes', async (req, res) => {
  try {
    const eventId = req.params.eventId;

    // Get all vote records for the event
    const { data: votes, error } = await db
      .from('contender_vote_records')
      .select('contender_id')
      .eq('event_id', eventId);

    if (error) {
      throw error;
    }

    // Count votes per contender
    const voteCounts = {};
    votes.forEach(vote => {
      voteCounts[vote.contender_id] = (voteCounts[vote.contender_id] || 0) + 1;
    });

    // Convert to array format
    const result = Object.entries(voteCounts).map(([contender_id, vote_count]) => ({
      contender_id,
      vote_count
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get points breakdown for each contender in an event
router.get('/event/:eventId/contender-points', async (req, res) => {
  try {
    const eventId = req.params.eventId;

    // Get all vote records for the event, including points
    const { data: votes, error } = await db
      .from('contender_vote_records')
      .select('contender_id, points_awarded')
      .eq('event_id', eventId);

    if (error) {
      throw error;
    }

    // Group points by contender
    const pointsBreakdown = {};
    votes.forEach(vote => {
      if (!pointsBreakdown[vote.contender_id]) pointsBreakdown[vote.contender_id] = [];
      pointsBreakdown[vote.contender_id].push(vote.points_awarded);
    });

    // Convert to array format
    const result = Object.entries(pointsBreakdown).map(([contender_id, points]) => ({
      contender_id,
      points // array of points cast for this contender
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get points breakdown for each contender in an event, including table info
router.get('/event/:eventId/contender-points-detailed', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    // Fetch vote tables for this event
    const { data: voteTables, error: vtError } = await db
      .from('vote_tables')
      .select('id, table_number, points_per_vote')
      .eq('event_id', eventId);
    if (vtError) throw vtError;
    const tablesMap = {};
    voteTables.forEach(t => { tablesMap[t.id] = t; });

    // Get all vote records for the event, including points and table
    const { data: votes, error } = await db
      .from('contender_vote_records')
      .select('contender_id, points_awarded, vote_table_id')
      .eq('event_id', eventId);
    if (error) throw error;

    // Group points by contender, include table info
    const pointsBreakdown = {};
    votes.forEach(vote => {
      if (!pointsBreakdown[vote.contender_id]) pointsBreakdown[vote.contender_id] = [];
      pointsBreakdown[vote.contender_id].push({
        points: vote.points_awarded,
        table: tablesMap[vote.vote_table_id]?.table_number || '?',
        tablePoints: tablesMap[vote.vote_table_id]?.points_per_vote || vote.points_awarded
      });
    });

    // Convert to array format
    const result = Object.entries(pointsBreakdown).map(([contender_id, points]) => ({
      contender_id,
      points // array of {points, table, tablePoints}
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get vote points for each contender in an event
router.get('/event/:eventId/contender-vote-points', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    // Fetch vote tables for this event
    const { data: voteTables, error: vtError } = await db
      .from('vote_tables')
      .select('id, table_number, points_per_vote')
      .eq('event_id', eventId);
    if (vtError) throw vtError;
    const tablesMap = {};
    voteTables.forEach(t => { tablesMap[t.id] = t; });

    // Get all vote records for the event, including points and table
    const { data: votes, error } = await db
      .from('contender_vote_records')
      .select('contender_id, points_awarded, vote_table_id')
      .eq('event_id', eventId);
    if (error) throw error;

    // Group points by contender, include table info
    const votePoints = {};
    votes.forEach(vote => {
      if (!votePoints[vote.contender_id]) votePoints[vote.contender_id] = [];
      votePoints[vote.contender_id].push({
        points: vote.points_awarded,
        table: tablesMap[vote.vote_table_id]?.table_number || '?',
        tablePoints: tablesMap[vote.vote_table_id]?.points_per_vote || vote.points_awarded
      });
    });

    // Convert to array format
    const result = Object.entries(votePoints).map(([contender_id, points]) => ({
      contender_id,
      points // array of {points, table, tablePoints}
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
