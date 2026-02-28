const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../config/db');
const { sendRegistrationToSuperAdmin, sendApprovalEmail, sendRejectionEmail, sendHallOfFameNotification, testEmailConfiguration, sendContenderNotification } = require('../services/email-service');
const { isValidEmail, isValidPassword, isValidUsername, hashPassword, comparePassword } = require('../utils/validation');
const { uploadImage } = require('../config/multer-images');

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
// Get all past winners (from closed events with winners)
router.get('/past-winners', async (req, res) => {
    try {
        const { data: events, error } = await supabase
            .from('events')
            .select('*')
            .eq('status', 'winner_announced')
            .order('ended_at', { ascending: false });

        if (error) throw error;

        const pastWinners = [];

        for (const event of events) {
            if (event.winner_id) {
                const { data: winner, error: winnerErr } = await supabase
                    .from('contenders')
                    .select('*')
                    .eq('id', event.winner_id)
                    .single();

                if (!winnerErr && winner) {
                    pastWinners.push({
                        id: event.id,
                        winner_name: winner.name,
                        event_name: event.name,
                        winner_class: winner.class || '',
                        winner_country: winner.country || '',
                        winner_points: winner.total_points || 0,
                        winner_picture: winner.picture || '',
                        winner_video: winner.video || '',
                        ended_at: event.ended_at,
                        updated_at: event.updated_at
                    });
                }
            }
        }

        res.json({ success: true, data: pastWinners });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add a manual past winner (creates contender and closed event)
router.post('/past-winners', async (req, res) => {
    try {
        console.log('🔧 DEBUG: Past Winners POST route called');
        console.log('🔧 DEBUG: Request body:', req.body);
        console.log('🔧 DEBUG: Request headers:', req.headers);
        
        const { name, event_name, class: className, country, points, date, picture, video } = req.body;
        
        console.log('🔧 DEBUG: Extracted data:', {
            name,
            event_name,
            className,
            country,
            points,
            date,
            picture: picture ? 'URL provided' : 'No URL',
            video
        });

        if (!name || !event_name) {
            console.log('🔧 DEBUG: Missing required fields - name or event_name');
            return res.status(400).json({ success: false, error: 'Name and event name are required' });
        }

        console.log('🔧 DEBUG: Validation passed, creating contender and event...');
        
        // First create contender
        const contenderData = {
            name: name,
            class: className || '',
            country: country || '',
            total_points: parseInt(points) || 0,
            picture: picture || '',
            video: video || '',
            created_by: req.admin?.email || 'admin@system.com'
        };
        
        console.log('🔧 DEBUG: Contender data to insert:', contenderData);
        console.log('🔧 DEBUG: Data types:', {
            name: typeof name,
            class: typeof (className || ''),
            country: typeof (country || ''),
            total_points: typeof parseInt(points),
            picture: typeof (picture || ''),
            video: typeof (video || ''),
            created_by: typeof (req.admin?.email || 'admin@system.com')
        });
        
        const { data: contender, error: contenderError } = await supabase
            .from('contenders')
            .insert(contenderData)
            .select('id, name, class, country, total_points, picture, video, created_at, updated_at')
            .single();

        if (contenderError) {
            console.error('🔧 DEBUG: Contender creation error:', contenderError);
            throw contenderError;
        }

        console.log('🔧 DEBUG: Contender created:', contender);

        // Then create the closed event with this contender as winner
        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert({
                name: event_name,
                winner_id: contender.id,
                status: 'winner_announced',
                ended_at: date || new Date().toISOString(),
                created_by: req.admin?.email || 'admin@system.com',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select('id, name, winner_id, status, ended_at, created_at, updated_at')
            .single();

        if (eventError) {
            console.error('🔧 DEBUG: Event creation error:', eventError);
            throw eventError;
        }

        console.log('🔧 DEBUG: Event created:', event);
        console.log('🔧 DEBUG: Sending success response');

        res.status(201).json({ 
            success: true, 
            message: 'Past winner added successfully', 
            data: {
                contender,
                event
            }
        });
    } catch (err) {
        console.error('🔧 DEBUG: Error in Past Winners POST route:', err);
        console.error('🔧 DEBUG: Error stack:', err.stack);
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

// Upload Past Winner image to Supabase Storage
router.post('/past-winners/upload', verifyAdmin, uploadImage.single('image'), async (req, res) => {
    try {
        console.log('🔧 DEBUG: Past Winners upload route called');
        console.log('🔧 DEBUG: Request file:', req.file);
        console.log('🔧 DEBUG: Request headers:', req.headers);
        
        if (!req.file) {
            console.log('🔧 DEBUG: No file provided');
            return res.status(400).json({ success: false, error: 'No image file provided' });
        }

        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `past-winner_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        console.log('🔧 DEBUG: File details:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            extension: fileExt,
            generatedFileName: fileName
        });

        // Upload to Supabase Storage
        console.log('🔧 DEBUG: Starting upload to profiles bucket...');
        const { data, error } = await supabase
            .storage
            .from('profiles')  // Use existing profile bucket
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            console.error('🔧 DEBUG: Supabase storage error:', error);
            return res.status(500).json({ success: false, error: 'Failed to upload image' });
        }

        console.log('🔧 DEBUG: Upload successful:', data);

        // Get public URL
        const { data: { publicUrl } } = supabase
            .storage
            .from('profiles')  // Use existing profile bucket
            .getPublicUrl(fileName);

        console.log('🔧 DEBUG: Public URL generated:', publicUrl);
        console.log('🔧 DEBUG: Sending success response');

        res.json({ success: true, url: publicUrl });
    } catch (err) {
        console.error('🔧 DEBUG: Upload error:', err);
        console.error('🔧 DEBUG: Error stack:', err.stack);
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

// Create Hall of Fame Web entry
router.post('/hall-of-fame-web', verifyAdmin, async (req, res) => {
    try {
        const { player_name, league, team_name, season, team_logo, player_image, email, phone } = req.body;

        if (!player_name || !league || !team_name || !season) {
            return res.status(400).json({ success: false, error: 'Required fields missing' });
        }

        // Check if league and season combination already exists
        const { data: existingEntry, error: checkError } = await supabase
            .from('hall_of_fame_web')
            .select('id, player_name, team_name')
            .eq('league', league)
            .eq('season', season)
            .single();

        if (!checkError && existingEntry) {
            return res.status(400).json({ 
                success: false, 
                error: `Hall of Fame entry already exists for ${league} Season ${season}. Entry: ${existingEntry.player_name} (${existingEntry.team_name}). Each league can only have one entry per season.` 
            });
        }

        // Check how many times this player has been in Hall of Fame
        const { data: existingEntries, error: countError } = await supabase
            .from('hall_of_fame_web')
            .select('id')
            .eq('player_name', player_name);

        if (countError) throw countError;

        const achievementCount = (existingEntries?.length || 0) + 1; // Include this new entry

        const { data, error } = await supabase
            .from('hall_of_fame_web')
            .insert([{
                player_name,
                league,
                team_name,
                season,
                team_logo,
                player_image,
                email: email || '',
                phone: phone || '',
                achievement_count: achievementCount,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Send email notification if email provided
        if (email && email.trim()) {
            try {
                console.log(`📧 Attempting to send Hall of Fame notification to: ${email}`);
                console.log(`📧 Email details:`, {
                    player_name,
                    league,
                    team_name,
                    season,
                    achievement_count: achievementCount,
                    phone: phone || 'Not provided'
                });
                
                await sendHallOfFameNotification({
                    player_name,
                    email,
                    league,
                    team_name,
                    season,
                    achievement_count: achievementCount,
                    phone: phone || ''
                });
                
                console.log(`✅ Hall of Fame notification sent successfully to ${email}`);
            } catch (emailErr) {
                console.error('❌ Failed to send Hall of Fame notification email:', emailErr);
                console.error('❌ Email error details:', emailErr.message);
                // Don't fail the request if email fails
            }
        } else {
            console.log(`ℹ️ No email provided for Hall of Fame entry: ${player_name}`);
        }

        res.status(201).json({
            success: true,
            message: 'Hall of Fame entry created successfully',
            data
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get single Hall of Fame Web entry
router.get('/hall-of-fame-web/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const { data, error } = await supabase
            .from('hall_of_fame_web')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hall of Fame entry not found' 
            });
        }

        res.json({ 
            success: true, 
            data: data 
        });
    } catch (err) {
        console.error('Error in Hall of Fame GET route:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/hall-of-fame-web/:id', uploadImage.fields([
    { name: 'playerImageFile', maxCount: 1 },
    { name: 'teamLogoFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { playerName, league, team, season, email, phone } = req.body;
        const { id } = req.params;
        
        // Handle file uploads
        let team_logo = req.body.team_logo; // Existing URL if no new file uploaded
        let player_image = req.body.player_image; // Existing URL if no new file uploaded
        
        // Handle player image upload
        if (req.files && req.files.playerImageFile && req.files.playerImageFile.length > 0) {
            const file = req.files.playerImageFile[0];
            const fileExt = file.originalname.split('.').pop();
            const fileName = `hof_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('profiles')  // Use existing profile bucket
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error('Supabase storage error for player image:', uploadError);
                return res.status(500).json({ success: false, error: 'Failed to upload player image' });
            }

            // Get public URL
            const { data: { publicUrl } } = supabase
                .storage
                .from('profiles')  // Use existing profile bucket
                .getPublicUrl(fileName);
            
            player_image = publicUrl;
        }
        
        // Handle team logo upload
        if (req.files && req.files.teamLogoFile && req.files.teamLogoFile.length > 0) {
            const file = req.files.teamLogoFile[0];
            const fileExt = file.originalname.split('.').pop();
            const fileName = `hof_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('profiles')  // Use existing profile bucket
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error('Supabase storage error for team logo:', uploadError);
                return res.status(500).json({ success: false, error: 'Failed to upload team logo' });
            }

            // Get public URL
            const { data: { publicUrl } } = supabase
                .storage
                .from('profiles')  // Use existing profile bucket
                .getPublicUrl(fileName);
            
            team_logo = publicUrl;
        }

        const updateData = {};
        if (playerName !== undefined) updateData.player_name = playerName.trim();
        if (league !== undefined) updateData.league = league.trim();
        if (team !== undefined) updateData.team_name = team.trim();
        if (team_logo !== undefined) updateData.team_logo = team_logo;
        if (player_image !== undefined) updateData.player_image = player_image;
        if (season !== undefined) updateData.season = parseInt(season);
        if (email !== undefined) updateData.email = email || '';
        if (phone !== undefined) updateData.phone = phone || '';

        const { data, error } = await supabase
            .from('hall_of_fame_web')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Supabase update error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            message: 'Hall of Fame entry updated',
            data: data
        });
        
    } catch (err) {
        console.error('Error in Hall of Fame PUT route:', err);
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

// Upload Hall of Fame images to Supabase Storage
router.post('/hall-of-fame-web/upload', verifyAdmin, uploadImage.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image file provided' });
        }

        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `hof_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase
            .storage
            .from('profiles')  // Use existing profile bucket
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            console.error('Supabase storage error:', error);
            return res.status(500).json({ success: false, error: 'Failed to upload image' });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase
            .storage
            .from('profiles')  // Use existing profile bucket
            .getPublicUrl(fileName);

        res.json({ success: true, url: publicUrl });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Resend Contender Email
router.post('/contenders/:id/resend-email', async (req, res) => {
    console.log('🔧 DEBUG: Contender email resend route called');
    console.log('🔧 DEBUG: Request params:', req.params);
    console.log('🔧 DEBUG: Request headers:', req.headers);
    
    try {
        const { id } = req.params;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        console.log('🔧 DEBUG: Extracted token:', token ? 'present' : 'missing');
        
        if (!token) {
            console.log('❌ DEBUG: No token provided, returning 401');
            return res.status(401).json({
                success: false,
                message: 'Authorization required'
            });
        }
        
        // Get contender data
        console.log('🔧 DEBUG: Fetching contender with ID:', id);
        const { data: contender } = await supabase
            .from('contenders')
            .select('*')
            .eq('id', id)
            .single();
            
        if (!contender) {
            console.log('❌ DEBUG: Contender not found in database');
            return res.status(404).json({
                success: false,
                message: 'Contender not found'
            });
        }
        
        console.log('🔧 DEBUG: Contender found:', contender);
        console.log('🔧 DEBUG: Attempting to send email to:', contender.email);
        
        // Get event information for the email
        console.log('🔧 DEBUG: Fetching event information for event ID:', contender.event_id);
        const { data: event } = await supabase
            .from('events')
            .select('name')
            .eq('id', contender.event_id)
            .single();
            
        console.log('🔧 DEBUG: Event found:', event);
        
        // Send contender notification email with full event details
        await sendContenderNotification({
            name: contender.name.trim(),
            email: contender.email.trim(),
            eventName: event?.name || 'Unknown Event',
            class: contender.class || 'N/A',
            country: contender.country || 'N/A'
        });
        
        console.log('✅ DEBUG: Email sent successfully to:', contender.email);
        
        res.json({
            success: true,
            message: 'Contender email sent successfully',
            data: { email: contender.email, player_name: contender.name }
        });
        
    } catch (err) {
        console.error('❌ DEBUG: Error in contender email resend route:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to resend contender email',
            error: err.message
        });
    }
});

// Resend Hall of Fame Email
router.post('/hall-of-fame/:id/resend-email', async (req, res) => {
    console.log('🔧 DEBUG: Hall of Fame email resend route called');
    console.log('🔧 DEBUG: Request params:', req.params);
    console.log('🔧 DEBUG: Request headers:', req.headers);
    
    try {
        const { id } = req.params;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        console.log('🔧 DEBUG: Extracted token:', token ? 'present' : 'missing');
        
        if (!token) {
            console.log('❌ DEBUG: No token provided, returning 401');
            return res.status(401).json({
                success: false,
                message: 'Authorization required'
            });
        }
        
        // Get Hall of Fame entry
        console.log('🔧 DEBUG: Fetching Hall of Fame entry with ID:', id);
        const { data: entry } = await supabase
            .from('hall_of_fame_web')
            .select('*')
            .eq('id', id)
            .single();
            
        if (!entry) {
            console.log('❌ DEBUG: Hall of Fame entry not found in database');
            return res.status(404).json({
                success: false,
                message: 'Hall of Fame entry not found'
            });
        }
        
        console.log('🔧 DEBUG: Hall of Fame entry found:', entry);
        console.log('🔧 DEBUG: Attempting to send Hall of Fame email to:', entry.email);
        
        // Send Hall of Fame notification email
        await sendHallOfFameNotification({
            player_name: entry.player_name,
            email: entry.email,
            league: entry.league,
            team_name: entry.team_name,
            season: entry.season,
            achievement_count: entry.trophies || 1,
            phone: entry.phone || 'Not provided'
        });
        
        console.log('✅ DEBUG: Hall of Fame email sent successfully to:', entry.email);
        
        res.json({
            success: true,
            message: 'Hall of Fame email sent successfully',
            data: { email: entry.email, player_name: entry.player_name }
        });
        
    } catch (err) {
        console.error('❌ DEBUG: Failed to send Hall of Fame email:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to resend Hall of Fame email',
            error: err.message
        });
    }
});

module.exports = router;

// Test email configuration endpoint
router.get('/test-email', verifyAdmin, async (req, res) => {
    try {
        const result = await testEmailConfiguration();
        res.json({
            success: result,
            message: result ? 'Email configuration is working' : 'Email configuration test failed'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
