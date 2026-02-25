const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../config/db');
const { sendRegistrationToSuperAdmin, sendApprovalEmail, sendRejectionEmail } = require('../services/email-service');
const { isValidEmail, isValidPassword, isValidUsername, hashPassword, comparePassword } = require('../utils/validation');

const router = express.Router();

// ===== ADMIN REGISTRATION =====
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;

        // Validate input
        if (!fullName || !email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Full name, email, username, and password are required'
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        if (!isValidUsername(username)) {
            return res.status(400).json({
                success: false,
                message: 'Username must be 3+ characters and contain only letters, numbers, underscore, or dash'
            });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if email already exists
        const { data: existingEmail } = await supabase
            .from('admin_requests')
            .select('id')
            .eq('email', email)
            .single();

        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Check if username already exists
        const { data: existingUsername } = await supabase
            .from('admin_requests')
            .select('id')
            .eq('username', username)
            .single();

        if (existingUsername) {
            return res.status(400).json({
                success: false,
                message: 'Username already taken'
            });
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create registration request in database
        const { data, error } = await supabase
            .from('admin_requests')
            .insert([
                {
                    full_name: fullName,
                    email: email,
                    username: username,
                    password: hashedPassword,
                    status: 'pending',
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({
                success: false,
                message: 'Error creating registration request'
            });
        }

        // Send email to superadmin
        const registrationData = {
            id: data[0].id,
            fullName: fullName,
            email: email,
            username: username
        };

        await sendRegistrationToSuperAdmin(registrationData);

        res.status(201).json({
            success: true,
            message: 'Registration request submitted! Check your email for updates.',
            data: {
                id: data[0].id,
                email: email,
                username: username,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

// ===== ADMIN APPROVAL (Superadmin only) =====
router.post('/approve', verifySuperAdmin, async (req, res) => {
    try {
        const { requestId, action } = req.body;

        if (!requestId || !action) {
            return res.status(400).json({
                success: false,
                message: 'Request ID and action are required'
            });
        }

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Action must be "approve" or "reject"'
            });
        }

        // Get registration request
        const { data: request, error: fetchError } = await supabase
            .from('admin_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError || !request) {
            return res.status(404).json({
                success: false,
                message: 'Registration request not found'
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'This request has already been processed'
            });
        }

        if (action === 'approve') {
            // Use the password the user provided at registration (already hashed)
            const storedHashed = request.password;

            let adminData = null;
            try {
                const insertResult = await supabase
                    .from('admins')
                    .insert([
                        {
                            full_name: request.full_name,
                            email: request.email,
                            username: request.username,
                            password: storedHashed,
                            role: 'admin',
                            status: 'active',
                            approved_at: new Date().toISOString(),
                            approved_by: req.superadmin.email
                        }
                    ])
                    .select();
                adminData = insertResult.data;
            } catch (adminError) {
                console.error('Admin insert error:', adminError);
                // Attempt to recover if admin already exists (unique constraint)
                try {
                    const { data: existingAdmin } = await supabase
                        .from('admins')
                        .select('*')
                        .or(`email.eq.${request.email},username.eq.${request.username}`)
                        .limit(1)
                        .single();

                    if (existingAdmin && existingAdmin.id) {
                        const { data: updatedAdmin } = await supabase
                            .from('admins')
                            .update({
                                password: storedHashed,
                                role: 'admin',
                                status: 'active',
                                approved_at: new Date().toISOString(),
                                approved_by: req.superadmin.email
                            })
                            .eq('id', existingAdmin.id)
                            .select();
                        adminData = updatedAdmin;
                      //  console.log('Existing admin updated instead of insert');
                    } else {
                        console.error('Admin creation failed and no existing admin found');
                        return res.status(500).json({ success: false, message: 'Error creating admin account' });
                    }
                } catch (recoverErr) {
                    console.error('Error recovering from admin insert failure:', recoverErr);
                    return res.status(500).json({ success: false, message: 'Error creating admin account' });
                }
            }

            // Update request status
            await supabase
                .from('admin_requests')
                .update({ 
                    status: 'approved',
                    processed_at: new Date().toISOString(),
                    processed_by: req.superadmin.email
                })
                .eq('id', requestId);

            // Send approval email (do not send passwords; user keeps their original password)
            await sendApprovalEmail({
                fullName: request.full_name,
                email: request.email,
                username: request.username
            });

            const createdAdmin = Array.isArray(adminData) ? adminData[0] : adminData;
            res.json({
                success: true,
                message: 'Admin approved and email sent to user',
                admin: createdAdmin || null
            });

        } else {
            // Reject request
            await supabase
                .from('admin_requests')
                .update({ 
                    status: 'rejected',
                    processed_at: new Date().toISOString(),
                    processed_by: req.superadmin.email
                })
                .eq('id', requestId);

            // Send rejection email
            await sendRejectionEmail({
                fullName: request.full_name,
                email: request.email,
                username: request.username
            });

            res.json({
                success: true,
                message: 'Application rejected and email sent to user'
            });
        }

    } catch (error) {
        console.error('Approval error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during approval'
        });
    }
});

// ===== ADMIN LOGIN =====
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Get admin from database
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !admin) {
            console.warn('Admin not found in DB, checking for pending registration and superadmin env credentials');
            // If there is a pending registration request for this username/email, inform the user their application is under review
            try {
                const { data: pendingReq } = await supabase
                    .from('admin_requests')
                    .select('*')
                    .or(`username.eq.${username},email.eq.${username}`)
                    .eq('status', 'pending')
                    .limit(1)
                    .single();

                if (pendingReq) {
                    return res.status(403).json({
                        success: false,
                        message: 'Your application is under review. You will receive an email when it has been processed.'
                    });
                }
            } catch (rqErr) {
                // ignore and continue to superadmin env fallback
                console.warn('Error checking pending admin_requests:', rqErr.message || rqErr);
            }

            // If admin is not found in DB, allow superadmin fallback via env vars
            const superEmail = process.env.SUPERADMIN_EMAIL;
            const superPass = process.env.SUPERADMIN_PASSWORD;
        

            if (superEmail && superPass && (username === superEmail) && password === superPass) {
                // create a JWT for superadmin without DB lookup
                const token = jwt.sign(
                    {
                        id: null,
                        username: username,
                        email: superEmail,
                        role: 'superadmin',
                        timestamp: new Date().toISOString()
                    },
                    process.env.JWT_SECRET || 'your_jwt_secret_key',
                    { expiresIn: '24h' }
                );

                return res.json({
                    success: true,
                    message: 'Login successful',
                    token: token,
                    admin: {
                        id: null,
                        username: username,
                        email: superEmail,
                        fullName: process.env.SUPERADMIN_NAME || 'Superadmin',
                        role: 'superadmin'
                    }
                });
            }

            // Quick superadmin env fallback: check env credentials first
            const envSuperEmail = process.env.SUPERADMIN_EMAIL;
            const envSuperPass = process.env.SUPERADMIN_PASSWORD;
            if (envSuperEmail && envSuperPass && username === envSuperEmail && password === envSuperPass) {
                const token = jwt.sign(
                    {
                        id: null,
                        username: username,
                        email: envSuperEmail,
                        role: 'superadmin',
                        timestamp: new Date().toISOString()
                    },
                    process.env.JWT_SECRET || 'your_jwt_secret_key',
                    { expiresIn: '24h' }
                );
                console.log('Superadmin login via env credentials');
                return res.json({
                    success: true,
                    message: 'Login successful',
                    token: token,
                    admin: {
                        id: null,
                        username: username,
                        email: envSuperEmail,
                        fullName: process.env.SUPERADMIN_NAME || 'Superadmin',
                        role: 'superadmin'
                    }
                });
            }
            console.warn('Login failed: Admin not found');
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Check password
        const passwordMatch = await comparePassword(password, admin.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Check if admin is active
        if (admin.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Admin account is inactive'
            });
        }

        // Create JWT token
        const token = jwt.sign(
            {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                role: admin.role,
                timestamp: new Date().toISOString()
            },
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                fullName: admin.full_name,
                role: admin.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// ===== VERIFY TOKEN =====
router.get('/verify', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        admin: req.admin
    });
});

// ===== GET PENDING REQUESTS (Superadmin only) =====
router.get('/pending-requests', verifySuperAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('admin_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching requests'
            });
        }

        res.json({
            success: true,
            requests: data || []
        });

    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// ===== MIDDLEWARE: Verify Admin Token =====
function verifyAdmin(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
        req.admin = decoded;
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
}

// ===== MIDDLEWARE: Verify Superadmin =====
function verifySuperAdmin(req, res, next) {
    try {
        const superadminEmail = process.env.SUPERADMIN_EMAIL;
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'Superadmin authentication required' });
        }

        // Support either the special SuperAdmin token header or a Bearer JWT for an admin with role 'superadmin'
        if (authHeader.startsWith('SuperAdmin ')) {
            const token = authHeader.substring(11);
            const decoded = jwt.verify(token, process.env.SUPER_JWT_SECRET || 'super_admin_hardcore_secret_key_2026');
            if (decoded.email !== superadminEmail) {
                return res.status(403).json({ success: false, message: 'Unauthorized: Not a superadmin' });
            }
            req.superadmin = decoded;
            return next();
        }

        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
            if (!decoded || decoded.role !== 'superadmin') {
                return res.status(403).json({ success: false, message: 'Unauthorized: Not a superadmin' });
            }
            req.superadmin = decoded;
            return next();
        }

        return res.status(401).json({ success: false, message: 'Superadmin authentication required' });

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid superadmin token'
        });
    }
}

// ===== ONE-CLICK EMAIL APPROVAL =====
// This route allows processing approve/reject actions from secure links in the superadmin email.
// The link contains a signed token (SUPER_JWT_SECRET). Example: /api/admin/approve-via-email?token=...
router.get('/approve-via-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Missing token' });
        }

        const decoded = jwt.verify(token, process.env.SUPER_JWT_SECRET || 'super_admin_hardcore_secret_key_2026');
        const { requestId, action } = decoded;

        if (!requestId || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid token payload' });
        }

        // Fetch the request
        const { data: request, error: fetchError } = await supabase
            .from('admin_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError || !request) {
            return res.status(404).json({ success: false, message: 'Registration request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'This request has already been processed' });
        }

        if (action === 'approve') {
            // Use the password the user set during registration (already hashed)
            const storedHashed = request.password;

            let adminData = null;
            try {
                const insertResult = await supabase
                    .from('admins')
                    .insert([
                        {
                            full_name: request.full_name,
                            email: request.email,
                            username: request.username,
                            password: storedHashed,
                            role: 'admin',
                            status: 'active',
                            approved_at: new Date().toISOString(),
                            approved_by: decoded.email || process.env.SUPERADMIN_EMAIL
                        }
                    ])
                    .select();
                adminData = insertResult.data;
            } catch (adminError) {
                console.error('Admin insert error (email link):', adminError);
                // Attempt recovery for existing admin
                try {
                    const { data: existingAdmin } = await supabase
                        .from('admins')
                        .select('*')
                        .or(`email.eq.${request.email},username.eq.${request.username}`)
                        .limit(1)
                        .single();

                    if (existingAdmin && existingAdmin.id) {
                        const { data: updatedAdmin } = await supabase
                            .from('admins')
                            .update({
                                password: storedHashed,
                                role: 'admin',
                                status: 'active',
                                approved_at: new Date().toISOString(),
                                approved_by: decoded.email || process.env.SUPERADMIN_EMAIL
                            })
                            .eq('id', existingAdmin.id)
                            .select();
                        adminData = updatedAdmin;
                        console.log('Existing admin updated via email-approval');
                    } else {
                        console.error('Admin creation failed (email link) and no existing admin found');
                        return res.status(500).json({ success: false, message: 'Error creating admin account' });
                    }
                } catch (recoverErr) {
                    console.error('Error recovering from admin insert failure (email link):', recoverErr);
                    return res.status(500).json({ success: false, message: 'Error creating admin account' });
                }
            }

            await supabase
                .from('admin_requests')
                .update({
                    status: 'approved',
                    processed_at: new Date().toISOString(),
                    processed_by: decoded.email || process.env.SUPERADMIN_EMAIL
                })
                .eq('id', requestId);

            // Send approval email (do not include passwords)
            await sendApprovalEmail({ fullName: request.full_name, email: request.email, username: request.username });

            // Respond with a friendly HTML page
            return res.send(`<html><body><h2>Request Approved</h2><p>User ${request.username} has been approved.</p></body></html>`);
        }

        // Reject path
        await supabase
            .from('admin_requests')
            .update({ status: 'rejected', processed_at: new Date().toISOString(), processed_by: decoded.email || process.env.SUPERADMIN_EMAIL })
            .eq('id', requestId);

        await sendRejectionEmail({ fullName: request.full_name, email: request.email, username: request.username });
        return res.send(`<html><body><h2>Request Rejected</h2><p>User ${request.username} has been rejected.</p></body></html>`);

    } catch (err) {
        console.error('Email-approval error:', err);
        return res.status(400).send(`<html><body><h2>Invalid or expired token</h2><p>${err.message}</p></body></html>`);
    }
});

// ===== PAST WINNERS MANAGEMENT =====
// Get all past winners (admin view - includes all, not just 3 months)
router.get('/past-winners', async (req, res) => {
    try {
        const { data: events, error } = await supabase
            .from('events')
            .select('*')
            .eq('status', 'winner_announced')
            .order('ended_at', { ascending: false });

        if (error) throw error;

        if (!events || events.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const pastWinners = [];

        for (const event of events) {
            const { data: winner, error: winnerErr } = await supabase
                .from('contenders')
                .select('*')
                .eq('id', event.winner_id)
                .single();

            if (!winnerErr && winner) {
                pastWinners.push({
                    event_id: event.id,
                    event_name: event.name,
                    winner_id: event.winner_id,
                    winner_name: winner.name,
                    winner_class: winner.class,
                    winner_country: winner.country,
                    winner_picture: winner.picture,
                    winner_video: winner.video,
                    winner_points: winner.total_points || 0,
                    ended_at: event.ended_at,
                    updated_at: event.updated_at
                });
            }
        }

        res.json({ success: true, data: pastWinners });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add a manual past winner (for historical data)
router.post('/past-winners', async (req, res) => {
    try {
        const { name, event_name, class: className, country, points, date, picture, video } = req.body;

        if (!name || !event_name) {
            return res.status(400).json({ success: false, error: 'Name and event name are required' });
        }

        // Insert into past_winners table
        const { data, error } = await supabase
            .from('past_winners')
            .insert({
                winner_name: name,
                event_name: event_name,
                winner_class: className || '',
                winner_country: country || '',
                winner_points: points || 0,
                winner_date: date || new Date().toISOString(),
                winner_picture: picture || '',
                winner_video: video || ''
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, message: 'Past winner added successfully', data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===== HALL OF FAME MANAGEMENT =====
// Get all Hall of Fame entries (matching bot structure)
router.get('/hall-of-fame', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hall_of_fame')
            .select('*')
            .order('trophies', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add to Hall of Fame (matching bot structure with community_jid, user_jid, etc)
router.post('/hall-of-fame', async (req, res) => {
    try {
        const { user_jid, player_name, community_jid, community_name, league, team, trophies } = req.body;

        if (!player_name || !league || !team) {
            return res.status(400).json({ 
                success: false, 
                error: 'Player name, league, and team are required' 
            });
        }

        // Check if exact same user + league + team exists (matching bot logic)
        let query = supabase
            .from('hall_of_fame')
            .select('*')
            .eq('league', league)
            .eq('team', team);
        
        if (user_jid) {
            query = query.eq('user_jid', user_jid);
        } else {
            query = query.eq('player_name', player_name);
        }
        
        const { data: existing, error: checkErr } = await query.single();

        if (!checkErr && existing) {
            // Same team, same league → increment trophies (matching bot logic)
            const { data: updated, error: updErr } = await supabase
                .from('hall_of_fame')
                .update({ trophies: existing.trophies + (trophies || 1) })
                .eq('id', existing.id)
                .select()
                .single();

            if (updErr) throw updErr;

            return res.json({ 
                success: true, 
                message: `Trophies updated for ${player_name}`, 
                data: updated,
                updated: true
            });
        }

        // Insert new entry (matching bot structure)
        const insertData = {
            player_name: player_name,
            league: league,
            team: team,
            trophies: trophies || 1
        };
        
        // Add optional fields if provided
        if (user_jid) insertData.user_jid = user_jid;
        if (community_jid) insertData.community_jid = community_jid;
        if (community_name) insertData.community_name = community_name;

        const { data, error } = await supabase
            .from('hall_of_fame')
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ 
            success: true, 
            message: 'Hall of Fame entry added', 
            data,
            updated: false
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete Hall of Fame entry
router.delete('/hall-of-fame/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('hall_of_fame')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, message: 'Hall of Fame entry deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===== HALL OF FAME WEB (New Structure) =====
// Get all Hall of Fame Web entries grouped by league
router.get('/hall-of-fame-web', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hall_of_fame_web')
            .select('*')
            .order('league', { ascending: true })
            .order('season', { ascending: true });

        if (error) throw error;

        // Group by league and aggregate player wins
        const leagueMap = {};
        
        (data || []).forEach(entry => {
            if (!leagueMap[entry.league]) {
                leagueMap[entry.league] = {};
            }
            
            const playerKey = entry.player_name;
            if (!leagueMap[entry.league][playerKey]) {
                leagueMap[entry.league][playerKey] = {
                    player_name: entry.player_name,
                    player_image: entry.player_image,
                    wins: []
                };
            }
            
            leagueMap[entry.league][playerKey].wins.push({
                team_name: entry.team_name,
                team_logo: entry.team_logo,
                season: entry.season,
                id: entry.id
            });
        });

        res.json({ success: true, data: leagueMap });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add new Hall of Fame Web entry
router.post('/hall-of-fame-web', async (req, res) => {
    try {
        const { player_name, league, team_name, team_logo, player_image, season } = req.body;

        if (!player_name || !league || !team_name || !season) {
            return res.status(400).json({ 
                success: false, 
                error: 'Player name, league, team name, and season are required' 
            });
        }

        const { data, error } = await supabase
            .from('hall_of_fame_web')
            .insert({
                player_name: player_name.trim(),
                league: league.trim(),
                team_name: team_name.trim(),
                team_logo: team_logo || '',
                player_image: player_image || '',
                season: parseInt(season) || 1
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ 
            success: true, 
            message: 'Hall of Fame entry added', 
            data 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update Hall of Fame Web entry
router.put('/hall-of-fame-web/:id', async (req, res) => {
    try {
        const { player_name, league, team_name, team_logo, player_image, season } = req.body;
        const { id } = req.params;

        const updateData = {};
        if (player_name !== undefined) updateData.player_name = player_name.trim();
        if (league !== undefined) updateData.league = league.trim();
        if (team_name !== undefined) updateData.team_name = team_name.trim();
        if (team_logo !== undefined) updateData.team_logo = team_logo;
        if (player_image !== undefined) updateData.player_image = player_image;
        if (season !== undefined) updateData.season = parseInt(season);

        const { data, error } = await supabase
            .from('hall_of_fame_web')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            success: true, 
            message: 'Hall of Fame entry updated', 
            data 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete Hall of Fame Web entry
router.delete('/hall-of-fame-web/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('hall_of_fame_web')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, message: 'Hall of Fame entry deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
