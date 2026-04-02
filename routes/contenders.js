const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Admin verification middleware
const verifyAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Get all contenders (with event info, optional filter by event)
router.get('/', async (req, res) => {
  try {
    const { eventId } = req.query;
    
    let query = db.from('contenders').select(`
      *,
      events:event_id(id, name, status)
    `).order('total_points', { ascending: false });

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get active contender list for bot compatibility (only draft/open events)
router.get('/list-all', async (req, res) => {
  try {
    // Find active events (draft or open)
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

    const contendersWithTrophies = await Promise.all(
      (contenders || []).map(async contender => {
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

// Get single contender by ID
router.get('/:contenderId', async (req, res) => {
  try {
    const { data, error } = await db
      .from('contenders')
      .select(`
        *,
        events:event_id(id, name, status)
      `)
      .eq('id', req.params.contenderId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Contender not found'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Create new contender (admin)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { eventId, name, description, class: className, country, email, picture } = req.body;
    const adminUsername = req.user.username;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: 'Event ID is required'
      });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Contender name is required'
      });
    }

    // Verify event exists
    const { data: event, error: eventError } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Create contender
    const { data, error } = await db
      .from('contenders')
      .insert({
        event_id: eventId,
        name: name.trim(),
        description: description || '',
        class: className || '',
        country: country || '',
        email: email || null,
        picture: picture || null,
        sent: false,
        total_points: 0,
        created_by: adminUsername
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Contender created successfully',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Update contender (admin) - name, class, country, description, picture, video, email
router.put('/:contenderId', verifyAdmin, async (req, res) => {
  try {
    const contenderId = req.params.contenderId;
    const { name, description, class: className, country, picture, video, email } = req.body;

    // Verify contender exists
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({ success: false, error: 'Contender not found' });
    }

    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (className !== undefined) updateData.class = className;
    if (country !== undefined) updateData.country = country;
    if (picture !== undefined) updateData.picture = picture;
    if (video !== undefined) updateData.video = video;
    if (email !== undefined) updateData.email = email;

    // Update contender
    const { data: updated, error: updErr } = await db
      .from('contenders')
      .update(updateData)
      .eq('id', contenderId)
      .select()
      .single();

    if (updErr) throw updErr;

    res.json({
      success: true,
      message: 'Contender updated successfully',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete contender (admin)
router.delete('/:contenderId', verifyAdmin, async (req, res) => {
  try {
    const contenderId = req.params.contenderId;

    // Verify contender exists
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({
        success: false,
        error: 'Contender not found'
      });
    }

    const { error } = await db
      .from('contenders')
      .delete()
      .eq('id', contenderId);

    if (error) throw error;

    res.json({ success: true, message: 'Contender deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
