const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Bot endpoint to check for new contenders with images
router.get('/check-new', async (req, res) => {
  try {
    // Match existing frontend behavior: only draft/open events
    const { data: activeEvents, error: eventsError } = await db
      .from('events')
      .select('id')
      .or('status.eq.draft,status.eq.open');

    if (eventsError) throw eventsError;

    const eventIds = (activeEvents || []).map(e => e.id);

    const { data, error } = await db
      .from('contenders')
      .select('id, name, description, email, picture, created_at')
      .eq('sent', false)
      .not('picture', 'is', null)
      .in('event_id', eventIds)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const hasNew = data && data.length > 0;

    res.json({
      success: true,
      hasNew: hasNew,
      count: data ? data.length : 0,
      data: hasNew ? data : []
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Bot endpoint to list all contenders (excluding images)
router.get('/list-all', async (req, res) => {
  try {
    // Get active events draft/open
    const { data: activeEvents, error: eventsError } = await db
      .from('events')
      .select('id')
      .or('status.eq.draft,status.eq.open');

    if (eventsError) throw eventsError;

    const eventIds = (activeEvents || []).map(e => e.id);

    const { data: contenders, error: contendersError } = await db
      .from('contenders')
      .select('id, name, description, email, created_at, sent, event_id')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false });

    if (contendersError) throw contendersError;

    // Get trophy count for each contender (count of hall of fame entries they have)
    const contendersWithTrophies = await Promise.all(
      (contenders || []).map(async (contender) => {
        const { count, error: trophyError } = await db
          .from('hall_of_fame_web')
          .select('*', { count: 'exact', head: true })
          .eq('player_name', contender.name);

        if (trophyError) {
          console.error('Error counting trophies for contender:', contender.name, trophyError);
          return { ...contender, trophies: 0 };
        }

        return { ...contender, trophies: count || 0 };
      })
    );

    res.json({
      success: true,
      count: contendersWithTrophies.length,
      data: contendersWithTrophies
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Bot endpoint to mark contender as sent
router.post('/mark-sent', async (req, res) => {
  try {
    const { contenderId } = req.body;

    if (!contenderId) {
      return res.status(400).json({
        success: false,
        error: 'Contender ID is required'
      });
    }

    // Verify contender exists
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('id, sent')
      .eq('id', contenderId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({
        success: false,
        error: 'Contender not found'
      });
    }

    if (contender.sent) {
      return res.status(400).json({
        success: false,
        error: 'Contender already marked as sent'
      });
    }

    // Mark as sent
    const { data, error } = await db
      .from('contenders')
      .update({ sent: true })
      .eq('id', contenderId)
      .select('id, sent')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Contender marked as sent',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;