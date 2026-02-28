const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { upload } = require('../config/multer'); // Import upload middleware from separate config

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

// Get all contenders from all active events (public endpoint)
router.get('/all-contenders', async (req, res) => {
  try {
    // Get all events that are not closed/winner_announced
    const { data: events, error: eventsError } = await db
      .from('events')
      .select('*')
      .or('status.neq.closed,status.neq.winner_announced')
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError);
      throw eventsError;
    }


    if (!events || events.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No active events found'
      });
    }

    // Get contenders for each active event
    const allContendersWithEvents = [];
    
    for (const event of events) {
      const { data: contenders, error: contendersError } = await db
        .from('contenders')
        .select('*')
        .eq('event_id', event.id)
        .order('total_points', { ascending: false });

      if (contendersError) {
        console.error(`❌ Error fetching contenders for event ${event.id}:`, contendersError);
        continue;
      }

      if (contenders && contenders.length > 0) {
        // Add event info to each contender
        const contendersWithEventInfo = contenders.map(contender => ({
          ...contender,
          event_name: event.name,
          event_id: event.id,
          event_status: event.status
        }));
        
        allContendersWithEvents.push(...contendersWithEventInfo);
      }
    }


    res.json({
      success: true,
      data: allContendersWithEvents
    });
  } catch (err) {
    console.error('❌ Error in /events/all-contenders:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get event with contenders (public endpoint)
router.get('/with-contenders', async (req, res) => {
  try {
    // Get events that are not closed/winner_announced and have contenders
    const { data, error } = await db
      .from('events')
      .select(`
        *,
        contenders:event_id(count)
      `)
      .or('status.neq.closed,status.neq.winner_announced')
      .gte('contenders', 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();


    if (error && error.code !== 'PGRST116') {
      console.error('❌ Database error:', error);
      throw error;
    }

    if (!data) {
      return res.json({
        success: true,
        data: null,
        message: 'No event with contenders at this time'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('❌ Error in /events/with-contenders:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get current active event (public endpoint)
router.get('/current', async (req, res) => {
  try {
    // First try to get the most recent event (not closed/winner_announced)
    const { data, error } = await db
      .from('events')
      .select('*')
      .or('status.neq.closed,status.neq.winner_announced')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();


    if (error && error.code !== 'PGRST116') {
      console.error('❌ Database error:', error);
      throw error;
    }

    if (!data) {
      return res.json({
        success: true,
        data: null,
        message: 'No active event at this time'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('❌ Error in /events/current:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get all events (admin only)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    console.log('🔧 DEBUG: Admin events GET endpoint called');
    console.log('🔧 DEBUG: Admin from token:', req.admin);
    
    const { data, error } = await db
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('🔧 DEBUG: Events query result:', { data, error });

    if (error) {
      console.error('🔧 DEBUG: Events query error:', error);
      throw error;
    }

    console.log('🔧 DEBUG: Returning events data:', data);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('🔧 DEBUG: Events GET error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get past winners (within 3 months)
router.get('/past-winners', async (req, res) => {
  try {
    const { data: events, error: eventsErr } = await db
      .from('events')
      .select('*')
      .eq('status', 'winner_announced')
      .order('ended_at', { ascending: false });

    
    if (eventsErr) {
      //console.error('Events query error:', eventsErr);
      throw eventsErr;
    }

    if (!events || events.length === 0) {
      //console.log('No events found');
      return res.json({ success: true, data: [] });
    }

    
    // Get winner details for each event
    const pastWinners = [];
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    for (const event of events) {
      const eventDate = new Date(event.ended_at || event.updated_at);
      
      // Only include events from last 3 months
      if (eventDate > threeMonthsAgo) {
        // Get winner details
        const { data: winner, error: winnerErr } = await db
          .from('contenders')
          .select('*')
          .eq('id', event.winner_id)
          .single();


        if (!winnerErr && winner) {
          const winnerData = {
            event_id: event.id,
            event_name: event.name,
            winner_id: event.winner_id,
            winner_name: winner.name,
            winner_class: winner.class,
            winner_country: winner.country,
            winner_picture: winner.picture || '',
            winner_video: winner.video || '',
            winner_points: winner.total_points || 0,
            ended_at: event.ended_at,
            updated_at: event.updated_at
          };
          pastWinners.push(winnerData);
        } else {
        }
      } else {
      }
    }

    res.json({ success: true, data: pastWinners });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get specific event
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
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

// Create new event (admin only)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { name, description, totalVotesAllowed } = req.body;
    const adminUsername = req.user.username;

    // Validate input
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Event name is required'
      });
    }

    // Check if event with same name exists
    const { data: existing } = await db
      .from('events')
      .select('id')
      .eq('name', name)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Event with this name already exists'
      });
    }

    const { data, error } = await db
      .from('events')
      .insert({
        name: name.trim(),
        description: description || '',
        status: 'draft',
        total_votes_allowed: totalVotesAllowed || 1,
        created_by: adminUsername
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Open event (start voting)
router.put('/:id/open', verifyAdmin, async (req, res) => {
  try {
    console.log('🔧 DEBUG: Open event request started');
    console.log('🔧 DEBUG: Event ID:', req.params.id);
    console.log('🔧 DEBUG: Admin from token:', req.admin);
    
    // Get current event
    const { data: event, error: getError } = await db
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    console.log('🔧 DEBUG: Current event data:', { event, getError });

    if (getError) throw getError;

    if (!event) {
      console.log('🔧 DEBUG: Event not found');
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    if (event.status === 'open') {
      console.log('🔧 DEBUG: Event is already open');
      return res.status(400).json({
        success: false,
        error: 'Event is already open'
      });
    }

    console.log('🔧 DEBUG: Closing other open events...');

    // Close any other open events
    const { data: closedEvents, error: closeError } = await db
      .from('events')
      .update({ status: 'closed', ended_at: new Date().toISOString() })
      .eq('status', 'open');

    console.log('🔧 DEBUG: Closed other events result:', { closedEvents, closeError });

    if (closeError) throw closeError;

    console.log('🔧 DEBUG: Opening this event...');

    // Open this event
    const { data, error } = await db
      .from('events')
      .update({
        status: 'open',
        started_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    console.log('🔧 DEBUG: Event open result:', { data, error });

    if (error) {
      console.error('🔧 DEBUG: Error opening event:', error);
      throw error;
    }

    console.log('🔧 DEBUG: Event opened successfully');

    res.json({
      success: true,
      message: 'Event opened for voting',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Close event (stop voting)
router.put('/:id/close', verifyAdmin, async (req, res) => {
  try {
    const { data: event, error: getError } = await db
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (getError) throw getError;

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    const { data, error } = await db
      .from('events')
      .update({
        status: 'closed',
        ended_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Event closed',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Announce winner
router.put('/:id/winner', verifyAdmin, async (req, res) => {
  try {
    const { winnerId } = req.body;

    if (!winnerId) {
      return res.status(400).json({
        success: false,
        error: 'Winner ID is required'
      });
    }

    // Verify contender exists
    const { data: contender, error: contenderError } = await db
      .from('contenders')
      .select('id')
      .eq('id', winnerId)
      .single();

    if (contenderError || !contender) {
      return res.status(404).json({
        success: false,
        error: 'Contender not found'
      });
    }

    const { data, error } = await db
      .from('events')
      .update({
        status: 'winner_announced',
        winner_id: winnerId
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Winner announced',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Delete event (admin only)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { data: event, error: getError } = await db
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (getError) throw getError;

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Delete dependent records explicitly to ensure cleanup even if DB lacks cascade constraints
    // 1) contender_vote_records (records of votes)
    const { error: delRecordsErr } = await db
      .from('contender_vote_records')
      .delete()
      .eq('event_id', req.params.id);

    if (delRecordsErr) throw delRecordsErr;

    // 2) vote_tables for this event
    const { error: delTablesErr } = await db
      .from('vote_tables')
      .delete()
      .eq('event_id', req.params.id);

    if (delTablesErr) throw delTablesErr;

    // 3) contenders for this event
    const { error: delContendersErr } = await db
      .from('contenders')
      .delete()
      .eq('event_id', req.params.id);

    if (delContendersErr) throw delContendersErr;

    // Finally delete the event
    const { error } = await db
      .from('events')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Event deleted'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ===== VOTE TABLES MANAGEMENT =====
// Create vote tables for an event
router.post('/:id/vote-tables', verifyAdmin, async (req, res) => {
  try {
    console.log('🔧 DEBUG: Vote table creation started');
    console.log('🔧 DEBUG: Request body:', req.body);
    console.log('🔧 DEBUG: Event ID:', req.params.id);
    
    const { voteTables } = req.body;
    const eventId = req.params.id;

    console.log('🔧 DEBUG: Extracted data:', { voteTables, eventId });

    // Check if event is closed
    const eventCheck = await checkEventClosed(eventId);
    console.log('🔧 DEBUG: Event closed check result:', eventCheck);
    
    if (eventCheck.closed) {
      console.log('🔧 DEBUG: Event is closed, cannot create vote tables');
      return res.status(400).json({ success: false, error: eventCheck.error });
    }

    if (!voteTables || !Array.isArray(voteTables)) {
      console.log('🔧 DEBUG: Invalid voteTables data');
      return res.status(400).json({
        success: false,
        error: 'voteTables array is required'
      });
    }

    console.log('🔧 DEBUG: Validating event exists...');

    // Verify event exists
    const { data: event, error: eventError } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .single();

    console.log('🔧 DEBUG: Event validation result:', { event, eventError });

    if (eventError || !event) {
      console.log('🔧 DEBUG: Event not found');
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    console.log('🔧 DEBUG: Checking existing vote tables...');

    // Check existing vote tables for this event
    const { data: existingTables, error: existingError } = await db
      .from('vote_tables')
      .select('table_number, points_per_vote')
      .eq('event_id', eventId);

    console.log('🔧 DEBUG: Existing vote tables:', { existingTables, existingError });

    if (existingError) {
      console.error('🔧 DEBUG: Error checking existing tables:', existingError);
    } else if (existingTables && existingTables.length > 0) {
      console.log('🔧 DEBUG: Vote tables already exist, returning them');
      return res.json({
        success: true,
        message: 'Vote tables already exist for this event',
        data: existingTables
      });
    }

    console.log('🔧 DEBUG: No existing tables, creating new ones...');

    // Create vote tables
    const { data, error } = await db
      .from('vote_tables')
      .insert(voteTables.map(vt => ({
        event_id: eventId,
        table_number: vt.tableNumber,
        points_per_vote: vt.pointsPerVote
      })))
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Vote tables created successfully',
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Helper: Check if event is closed/winner_announced
async function checkEventClosed(eventId) {
  const { data: event, error } = await db
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single();
  
  if (error || !event) return { closed: true, error: 'Event not found' };
  
  if (event.status === 'closed' || event.status === 'winner_announced') {
    return { closed: true, error: `Cannot modify event. Event is ${event.status}.` };
  }
  
  return { closed: false, status: event.status };
}
const { sendContenderNotification } = require('../services/email-service');

// Create contender for an event
router.post('/:id/contenders', verifyAdmin, async (req, res) => {
  try {
    const { name, description, class: className, country, email } = req.body;
    const eventId = req.params.id;
    const adminUsername = req.user.username;

    // Check if event is closed
    const eventCheck = await checkEventClosed(eventId);
    if (eventCheck.closed) {
      return res.status(400).json({
        success: false,
        error: eventCheck.error
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
      .select('id, name')
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
        email: email || '',
        description: description || '',
        class: className || '',
        country: country || '',
        total_points: 0,
        created_by: adminUsername
      })
      .select()
      .single();

    if (error) throw error;

    // Send email notification if email provided
    if (email && email.trim()) {
      try {
        await sendContenderNotification({
          name: name.trim(),
          email: email.trim(),
          eventName: event.name,
          class: className || 'N/A',
          country: country || 'N/A'
        });
      } catch (emailErr) {
        console.error('Failed to send contender notification email:', emailErr);
        // Don't fail the request if email fails
      }
    }

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

// Get contenders for an event
router.get('/:id/contenders', async (req, res) => {
  try {
    const eventId = req.params.id;

    const { data, error } = await db
      .from('contenders')
      .select('*')
      .eq('event_id', eventId)
      .order('total_points', { ascending: false });


    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    console.error(`❌ Error fetching contenders for event ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get vote tables for an event
router.get('/:id/vote-tables', async (req, res) => {
  try {
    const eventId = req.params.id;

    const { data, error } = await db
      .from('vote_tables')
      .select('*')
      .eq('event_id', eventId)
      .order('table_number', { ascending: true });

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

// ===== CUSTOM POINT TABLES =====
// Create a custom point table (title) for an event
router.post('/:id/point-tables', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const { title, defaultPoints } = req.body;

    // Check if event is closed
    const eventCheck = await checkEventClosed(eventId);
    if (eventCheck.closed) {
      return res.status(400).json({ success: false, error: eventCheck.error });
    }

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    // Verify event exists
    const { data: event, error: eventError } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Insert into point_tables
    const { data, error } = await db
      .from('point_tables')
      .insert({ event_id: eventId, title: title.trim(), default_points: defaultPoints || 0 })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, message: 'Point table created', data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get custom point tables for an event
router.get('/:id/point-tables', async (req, res) => {
  try {
    const eventId = req.params.id;
    const { data, error } = await db
      .from('point_tables')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Award points to a contender for a specific point table
router.post('/:id/contenders/:contenderId/points', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;
    const { pointTableId, points, note } = req.body;

    // Check if event is closed
    const eventCheck = await checkEventClosed(eventId);
    if (eventCheck.closed) {
      return res.status(400).json({ success: false, error: eventCheck.error });
    }

    if (!pointTableId || typeof points !== 'number') {
      return res.status(400).json({ success: false, error: 'pointTableId and numeric points are required' });
    }

    // Verify point table belongs to event
    const { data: pt, error: ptErr } = await db
      .from('point_tables')
      .select('*')
      .eq('id', pointTableId)
      .eq('event_id', eventId)
      .single();

    if (ptErr || !pt) return res.status(404).json({ success: false, error: 'Point table not found for this event' });

    // Verify contender exists and belongs to event
    const { data: contender, error: cErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .eq('event_id', eventId)
      .single();

    if (cErr || !contender) return res.status(404).json({ success: false, error: 'Contender not found for this event' });

    // Check if this point table has already been awarded to this contender
    const { data: existingRecord, error: existErr } = await db
      .from('contender_point_records')
      .select('*')
      .eq('contender_id', contenderId)
      .eq('point_table_id', pointTableId)
      .eq('event_id', eventId)
      .single();

    if (!existErr && existingRecord) {
      return res.status(400).json({ success: false, error: 'This point table has already been awarded to this contender. Cannot award the same point table twice.' });
    }

    // Insert a record into contender_point_records (tracking point assignments)
    const { data: rec, error: recErr } = await db
      .from('contender_point_records')
      .insert({ contender_id: contenderId, event_id: eventId, point_table_id: pointTableId, points_awarded: points, voter_ip: req.ip, awarded_at: new Date().toISOString() })
      .select()
      .single();

    if (recErr) throw recErr;

    // Update contender total_points
    const newTotal = (contender.total_points || 0) + points;
    const { error: updErr } = await db
      .from('contenders')
      .update({ total_points: newTotal })
      .eq('id', contenderId);

    if (updErr) throw updErr;

    res.json({ success: true, message: 'Points awarded', data: { record: rec, total_points: newTotal } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get point records for a contender (to check if point table already awarded)
router.get('/:id/contenders/:contenderId/point-records', async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;

    const { data: records, error: err } = await db
      .from('contender_point_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('contender_id', contenderId);

    if (err) throw err;

    res.json({ success: true, data: records || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all point awards for a specific point table in an event
router.get('/:id/point-table/:pointTableId/awards', async (req, res) => {
  try {
    const eventId = req.params.id;
    const pointTableId = req.params.pointTableId;

    const { data: records, error: err } = await db
      .from('contender_point_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('point_table_id', pointTableId);

    if (err) throw err;

    res.json({ success: true, data: records || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update a point record (edit points)
router.put('/:id/contenders/:contenderId/point-records/:recordId', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;
    const recordId = req.params.recordId;
    const { points_awarded } = req.body;

    if (typeof points_awarded !== 'number') {
      return res.status(400).json({ success: false, error: 'points_awarded must be a number' });
    }

    // Get the old record to calculate difference
    const { data: oldRecord, error: getErr } = await db
      .from('contender_point_records')
      .select('*')
      .eq('id', recordId)
      .eq('event_id', eventId)
      .eq('contender_id', contenderId)
      .single();

    if (getErr || !oldRecord) {
      return res.status(404).json({ success: false, error: 'Point record not found' });
    }

    // Update the record
    const { data: updated, error: updErr } = await db
      .from('contender_point_records')
      .update({ points_awarded })
      .eq('id', recordId)
      .select()
      .single();

    if (updErr) throw updErr;

    // Update contender total_points (adjust by difference)
    const pointDifference = points_awarded - oldRecord.points_awarded;
    const { data: contender, error: cErr } = await db
      .from('contenders')
      .select('total_points')
      .eq('id', contenderId)
      .single();

    if (!cErr && contender) {
      const newTotal = (contender.total_points || 0) + pointDifference;
      await db
        .from('contenders')
        .update({ total_points: newTotal })
        .eq('id', contenderId);
    }

    res.json({ success: true, message: 'Points updated', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a point record
router.delete('/:id/contenders/:contenderId/point-records/:recordId', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;
    const recordId = req.params.recordId;

    // Get the record before deleting to adjust total_points
    const { data: record, error: getErr } = await db
      .from('contender_point_records')
      .select('*')
      .eq('id', recordId)
      .eq('event_id', eventId)
      .eq('contender_id', contenderId)
      .single();

    if (getErr || !record) {
      return res.status(404).json({ success: false, error: 'Point record not found' });
    }

    // Delete the record
    const { error: delErr } = await db
      .from('contender_point_records')
      .delete()
      .eq('id', recordId);

    if (delErr) throw delErr;

    // Update contender total_points (subtract the deleted points)
    const { data: contender, error: cErr } = await db
      .from('contenders')
      .select('total_points')
      .eq('id', contenderId)
      .single();

    if (!cErr && contender) {
      const newTotal = Math.max(0, (contender.total_points || 0) - record.points_awarded);
      await db
        .from('contenders')
        .update({ total_points: newTotal })
        .eq('id', contenderId);
    }

    res.json({ success: true, message: 'Point record deleted', data: { total_points: contender?.total_points || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a vote table by id (admin)
router.delete('/vote-tables/:tableId', verifyAdmin, async (req, res) => {
  try {
    const tableId = req.params.tableId;

    // Verify exists
    const { data: vt, error: getErr } = await db
      .from('vote_tables')
      .select('*')
      .eq('id', tableId)
      .single();

    if (getErr || !vt) {
      return res.status(404).json({ success: false, error: 'Vote table not found' });
    }

    const { error } = await db
      .from('vote_tables')
      .delete()
      .eq('id', tableId);

    if (error) throw error;

    res.json({ success: true, message: 'Vote table deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a vote table under a specific event (admin)
router.delete('/:id/vote-tables/:tableId', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const tableId = req.params.tableId;

    // Verify vote table belongs to event
    const { data: vt, error: getErr } = await db
      .from('vote_tables')
      .select('*')
      .eq('id', tableId)
      .eq('event_id', eventId)
      .single();

    if (getErr || !vt) {
      return res.status(404).json({ success: false, error: 'Vote table not found for this event' });
    }

    const { error } = await db
      .from('vote_tables')
      .delete()
      .eq('id', tableId);

    if (error) throw error;

    res.json({ success: true, message: 'Vote table deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update a contender (admin) - update name, class, country, description, picture URL
router.put('/:id/contenders/:contenderId', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;
    const { name, description, class: className, country, picture, video } = req.body;

    // Verify contender exists and belongs to event
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .eq('event_id', eventId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({ success: false, error: 'Contender not found for this event' });
    }

    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (className !== undefined) updateData.class = className;
    if (country !== undefined) updateData.country = country;
    if (picture !== undefined) updateData.picture = picture;
    if (video !== undefined) updateData.video = video;

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

// Upload video for a contender (fallback if Supabase fails)
router.post('/:id/contenders/:contenderId/upload-video', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;
    const { videoUrl } = req.body;

    // Verify contender exists and belongs to event
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .eq('event_id', eventId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({ success: false, error: 'Contender not found for this event' });
    }

    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'videoUrl is required' });
    }

    // Update contender with video URL
    const { data: updated, error: updErr } = await db
      .from('contenders')
      .update({ video: videoUrl })
      .eq('id', contenderId)
      .select()
      .single();

    if (updErr) throw updErr;

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a contender under an event (admin)
router.delete('/:id/contenders/:contenderId', verifyAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;

    // Verify contender exists and belongs to event
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .eq('event_id', eventId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({ success: false, error: 'Contender not found for this event' });
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

// ===== VOTING ENDPOINTS =====
// Submit a vote for a contender
router.post('/:id/vote', async (req, res) => {
  try {
    console.log('🔧 DEBUG: Vote submission started');
    console.log('🔧 DEBUG: Request body:', req.body);
    console.log('🔧 DEBUG: Event ID:', req.params.id);
    console.log('🔧 DEBUG: Voter IP:', req.ip || req.connection.remoteAddress);
    
    const { contenderId, voteTableId } = req.body;
    const eventId = req.params.id;
    const voterIp = req.ip || req.connection.remoteAddress;

    console.log('🔧 DEBUG: Extracted data:', { contenderId, voteTableId, eventId, voterIp });

    // Validate input
    if (!contenderId || !voteTableId) {
      console.log('🔧 DEBUG: Validation failed - missing IDs');
      return res.status(400).json({
        success: false,
        error: 'Contender ID and Vote Table ID are required'
      });
    }

    console.log('🔧 DEBUG: Validation passed, checking event...');

    // Verify event exists and is open
    const { data: event, error: eventError } = await db
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    console.log('🔧 DEBUG: Event query result:', { event, eventError });

    if (eventError || !event) {
      console.log('🔧 DEBUG: Event not found');
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    if (event.status !== 'open') {
      console.log('🔧 DEBUG: Event not open for voting, status:', event.status);
      return res.status(400).json({
        success: false,
        error: 'Voting is not open for this event'
      });
    }

    console.log('🔧 DEBUG: Event is open, checking contender...');

    // Verify contender exists and belongs to event
    const { data: contender, error: contenderError } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .eq('event_id', eventId)
      .single();

    console.log('🔧 DEBUG: Contender query result:', { contender, contenderError });

    if (contenderError || !contender) {
      console.log('🔧 DEBUG: Contender not found for this event');
      return res.status(404).json({
        success: false,
        error: 'Contender not found for this event'
      });
    }

    console.log('🔧 DEBUG: Contender found, checking vote table...');

    // Verify vote table exists and belongs to event
    const { data: voteTable, error: voteTableError } = await db
      .from('vote_tables')
      .select('*')
      .eq('id', voteTableId)
      .eq('event_id', eventId)
      .single();

    console.log('🔧 DEBUG: Vote table query result:', { voteTable, voteTableError });

    if (voteTableError || !voteTable) {
      console.log('🔧 DEBUG: Vote table not found for this event');
      return res.status(404).json({
        success: false,
        error: 'Vote table not found for this event'
      });
    }

    console.log('🔧 DEBUG: Vote table found, checking existing votes...');

    // Check if this IP has already voted for this table in this event
    const { data: existingVote, error: existingVoteError } = await db
      .from('contender_vote_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('vote_table_id', voteTableId)
      .eq('voter_ip', voterIp)
      .single();

    console.log('🔧 DEBUG: Existing vote check result:', { existingVote, existingVoteError });

    if (!existingVoteError && existingVote) {
      console.log('🔧 DEBUG: User already voted for this table');
      return res.status(400).json({
        success: false,
        error: 'You have already voted using this vote table'
      });
    }

    // Check if this IP has already voted for this contender using any table
    const { data: existingContenderVote, error: existingContenderVoteError } = await db
      .from('contender_vote_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('contender_id', contenderId)
      .eq('voter_ip', voterIp)
      .single();

    console.log('🔧 DEBUG: Existing contender vote check result:', { existingContenderVote, existingContenderVoteError });

    if (!existingContenderVoteError && existingContenderVote) {
      console.log('🔧 DEBUG: User already voted for this contender');
      return res.status(400).json({
        success: false,
        error: 'You have already voted for this contender. You must vote for different contenders using different vote tables.'
      });
    }

    console.log('🔧 DEBUG: No existing votes found, creating vote record...');

    // Create vote record
    const voteData = {
      event_id: eventId,
      contender_id: contenderId,
      vote_table_id: voteTableId,
      points_awarded: voteTable.points_per_vote,
      voter_ip: voterIp,
      voted_at: new Date().toISOString()
    };

    console.log('🔧 DEBUG: Vote data to insert:', voteData);

    const { data: voteRecord, error: voteError } = await db
      .from('contender_vote_records')
      .insert(voteData)
      .select()
      .single();

    console.log('🔧 DEBUG: Vote record creation result:', { voteRecord, voteError });

    if (voteError) {
      console.error('🔧 DEBUG: Vote record creation error:', voteError);
      throw voteError;
    }

    console.log('🔧 DEBUG: Vote record created, updating contender points...');

    // Update contender's total points
    const newTotalPoints = (contender.total_points || 0) + voteTable.points_per_vote;
    console.log('🔧 DEBUG: Updating contender points:', {
      current: contender.total_points,
      adding: voteTable.points_per_vote,
      new: newTotalPoints
    });

    const { error: updateError } = await db
      .from('contenders')
      .update({ total_points: newTotalPoints })
      .eq('id', contenderId);

    console.log('🔧 DEBUG: Points update result:', { updateError });

    if (updateError) {
      console.error('🔧 DEBUG: Points update error:', updateError);
      throw updateError;
    }

    console.log('🔧 DEBUG: Vote submission completed successfully');

    res.status(201).json({
      success: true,
      message: 'Vote submitted successfully',
      data: {
        voteRecord,
        newTotalPoints,
        pointsAwarded: voteTable.points_per_vote
      }
    });

  } catch (err) {
    console.error('🔧 DEBUG: Vote submission error:', err);
    console.error('🔧 DEBUG: Error stack:', err.stack);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Upload video for a contender (fallback if Supabase fails)
router.post('/:id/contenders/:contenderId/upload-video', verifyAdmin, upload.single('video'), async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;

    // Verify contender exists and belongs to event
    const { data: contender, error: getErr } = await db
      .from('contenders')
      .select('*')
      .eq('id', contenderId)
      .eq('event_id', eventId)
      .single();

    if (getErr || !contender) {
      return res.status(404).json({
        success: false,
        error: 'Contender not found for this event'
      });
    }

    // Handle file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video file provided'
      });
    }

    const videoFile = req.file;
    
    // For now, we'll store a placeholder URL since we don't have file storage configured
    // In a real deployment, you'd upload to cloud storage (AWS S3, Cloudinary, etc.)
    const videoUrl = `/uploads/videos/${contenderId}_${Date.now()}_${videoFile.originalname}`;

    // Update contender with video URL
    const { data: updated, error: updErr } = await db
      .from('contenders')
      .update({ video: videoUrl })
      .eq('id', contenderId)
      .select()
      .single();

    if (updErr) throw updErr;

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      data: updated
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get vote records for a specific contender
router.get('/:id/contenders/:contenderId/votes', async (req, res) => {
  try {
    const eventId = req.params.id;
    const contenderId = req.params.contenderId;

    const { data: votes, error: err } = await db
      .from('contender_vote_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('contender_id', contenderId);

    if (err) throw err;

    res.json({ success: true, data: votes || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

