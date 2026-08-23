const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Email transporter configuration with fallback
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    // Add connection options for better reliability
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
    // Try different ports and secure settings
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    tls: {
        rejectUnauthorized: false
    }
});

// Alternative transporter for Outlook/Hotmail
const outlookTransporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Test email configuration with fallback
async function testEmailConfiguration() {
    try {
        
        // Test primary transporter
        try {
            await transporter.verify();
            return true;
        } catch (primaryError) {
            
            // Try Outlook as fallback
            try {
                await outlookTransporter.verify();
                return true;
            } catch (outlookError) {
                return false;
            }
        }
    } catch (error) {
        return false;
    }
}

function getSafeTeamLogoUrl(teamLogo) {
    const value = String(teamLogo || '').trim();
    if (!value) return '';
    if (!/^https:\/\//i.test(value)) return '';
    if (value.includes('localhost') || value.includes('127.0.0.1') || value.includes('file:')) return '';
    return value;
}

// Send Hall of Fame notification email
async function sendHallOfFameNotification(hallOfFameData) {
    
    const { player_name, email, league, team_name, season, achievement_count, phone, team_logo } = hallOfFameData;
    const safeTeamLogo = getSafeTeamLogoUrl(team_logo);
    const teamImageHtml = safeTeamLogo ? `
        <div style="margin: 20px 0 10px 0; text-align: center;">
            <img src="${safeTeamLogo}" alt="${(team_name || 'Winning Team')} - Hall of Fame Winning Team" style="max-width: 140px; max-height: 140px; object-fit: contain; border-radius: 12px; background: #f4f4f4; padding: 12px; border: 1px solid #e2e8f0;" />
        </div>
    ` : '';
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '🏆 Congratulations! You\'ve Been Inducted into the Hall of Fame - DYNAMIC EFOOTBALL COMMUNITY',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 15px;">
                <div style="background: white; padding: 30px; border-radius: 12px; text-align: center;">
                    <h1 style="color: #667eea; margin-bottom: 20px; font-size: 32px;">🏆 Hall of Fame Induction!</h1>
                    
                    <div style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #333; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <h2 style="margin: 0 0 10px 0; font-size: 24px;">Congratulations, ${player_name}!</h2>
                        <p style="margin: 0; font-size: 18px;">You have been officially inducted into the Hall of Fame</p>
                    </div>

                    ${teamImageHtml}

                    <div style="text-align: left; background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #667eea; margin-top: 0;">📋 Achievement Details:</h3>
                        <ul style="line-height: 1.8;">
                            <li><strong>League:</strong> ${league}</li>
                            <li><strong>Team:</strong> ${team_name}</li>
                            <li><strong>Season:</strong> ${season}</li>
                            <li><strong>Phone:</strong> ${phone || 'Not provided'}</li>
                        </ul>
                    </div>

                    <div style="background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); color: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0; font-size: 20px;">🎯 Your Legacy:</h3>
                        <p style="margin: 0; font-size: 18px;">This is your <strong>${achievement_count}${getOrdinalSuffix(achievement_count)}</strong> Hall of Fame induction!</p>
                        <p style="margin: 10px 0 0 0;">Your exceptional skills and dedication have earned you a permanent place among the legends of DYNAMIC EFOOTBALL COMMUNITY.</p>
                    </div>

                    <div style="margin: 30px 0; padding: 20px; border: 2px solid #667eea; border-radius: 8px;">
                        <p style="margin: 0; color: #667eea; font-weight: bold;">🌟 "Great players are remembered, but legends never die. Your name will forever be etched in the annals of eFootball history."</p>
                    </div>

                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                        <p style="color: #666; margin: 0;">This honor was bestowed by the DYNAMIC EFOOTBALL COMMUNITY administration.</p>
                        <p style="color: #666; margin: 10px 0 0 0;">Keep up the excellent work and continue to inspire others!</p>
                    </div>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Hall of Fame email sent successfully');
        
    } catch (error) {
        console.error('Error sending Hall of Fame email:', error);
        throw error;
    }
}

// Helper function to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
function getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j == 1 && k != 11) return "st";
    if (j == 2 && k != 12) return "nd";
    if (j == 3 && k != 13) return "rd";
    return "th";
}

// Send registration submission email to superadmin
async function sendRegistrationToSuperAdmin(registrationData) {
    const { fullName, email, username, id } = registrationData;
    const superSecret = process.env.SUPER_JWT_SECRET || 'super_admin_hardcore_secret_key_2026';
    const backendHost = (process.env.BACKEND_URL || process.env.ACKEND_URL || '').replace(/\/+$/, '');

    if (!backendHost) {
        throw new Error('BACKEND_URL or ACKEND_URL must be configured in the environment before sending admin approval emails.');
    }

    // Generate one-click approve/reject tokens
    const approveToken = jwt.sign({ requestId: id, action: 'approve', email: process.env.SUPERADMIN_EMAIL }, superSecret, { expiresIn: '7d' });
    const rejectToken = jwt.sign({ requestId: id, action: 'reject', email: process.env.SUPERADMIN_EMAIL }, superSecret, { expiresIn: '7d' });

    const approveUrl = `${backendHost}/api/admin/approve-via-email?token=${encodeURIComponent(approveToken)}`;
    const rejectUrl = `${backendHost}/api/admin/approve-via-email?token=${encodeURIComponent(rejectToken)}`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.SUPERADMIN_EMAIL,
        subject: '🏆 New Admin Registration Request - DYNAMIC EFOOTBALL COMMUNITY',
        html: `
            <h2>New Admin Registration Request</h2>
            <p>A new user has requested admin access. Please review and approve/reject:</p>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Full Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Username:</strong> ${username}</p>
                <p><strong>Registration ID:</strong> ${id}</p>
                <p><strong>Status:</strong> Pending Review</p>
            </div>

            <p>To approve or reject this request, you can click one of the secure links below:</p>
            <div style="margin: 18px 0;">
                <a href="${approveUrl}" style="display:inline-block;padding:12px 18px;background:#4caf50;color:#fff;border-radius:6px;text-decoration:none;margin-right:8px;">✅ Approve</a>
                <a href="${rejectUrl}" style="display:inline-block;padding:12px 18px;background:#e53935;color:#fff;border-radius:6px;text-decoration:none;">❌ Reject</a>
            </div>

            <p style="color: #666; font-size: 0.9em;">If the links do not work, copy the Registration ID <strong>${id}</strong> and use the admin panel to process the request.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Admin registration email sent successfully');
        
        return true;
    } catch (error) {
        console.error('Error sending admin registration email:', error);
        return false;
    }
}

// Send approval email to user
async function sendApprovalEmail(userData) {
    const { fullName, email, username } = userData;
    const adminFrontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const loginUrl = adminFrontendUrl ? `${adminFrontendUrl.replace(/\/api?$/, '')}/admin-login.html` : '';
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '✅ Admin Application Approved - DYNAMIC EFOOTBALL COMMUNITY',
        html: `
            <h2>Welcome to DYNAMIC EFOOTBALL COMMUNITY Admin Panel!</h2>
            <p>Dear ${fullName},</p>
            
            <p>Your admin application has been <strong>APPROVED!</strong> 🎉</p>

            <p>You can now login to the admin dashboard with the username you provided during registration.</p>
            <p>If you forget your password, use the password reset flow to set a new one.</p>

            <p><strong>Login URL:</strong> ${loginUrl ? `<a href="${loginUrl}">${loginUrl}</a>` : 'Configuration missing: set BACKEND_URL or ACKEND_URL'}</p>

            <p>If you have any questions, contact the superadmin.</p>
            <p>Best regards,<br>DYNAMIC EFOOTBALL COMMUNITY Team</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Approval email sent successfully');
        
        return true;
    } catch (error) {
        console.error('Error sending approval email:', error);
        return false;
    }
}

// Send rejection email to user
async function sendRejectionEmail(userData) {
    const { fullName, email, username } = userData;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '❌ Admin Application Status - DYNAMIC EFOOTBALL COMMUNITY',
        html: `
            <h2>Admin Application Status</h2>
            <p>Dear ${fullName},</p>
            
            <p>Thank you for applying to become an admin on the DYNAMIC EFOOTBALL COMMUNITY platform.</p>

            <p>Unfortunately, your application has been <strong>REJECTED</strong> at this time.</p>

            <p>This may be due to various reasons, including:</p>
            <ul>
                <li>Insufficient experience or qualifications</li>
                <li>Security concerns</li>
                <li>Policy violations</li>
                <li>Administrative capacity</li>
            </ul>

            <p>You may reapply in the future. If you believe this is an error, please contact support.</p>

            <p>Best regards,<br>DYNAMIC EFOOTBALL COMMUNITY Team</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Rejection email sent successfully');
        
        return true;
    } catch (error) {
        console.error('Error sending rejection email:', error);
        return false;
    }
}

// Send contender registration notification
async function sendContenderNotification(contenderData) {
    const { name, email, eventName, class: className, country } = contenderData;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `🏆 You've been registered as a contender - ${eventName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #667eea; margin: 0;">🏆 DYNAMIC EFOOTBALL COMMUNITY</h1>
                    <p style="color: #666; margin: 10px 0;">Contender Registration Confirmed</p>
                </div>

                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #333; margin-top: 0;">Hello ${name}!</h2>
                    
                    <p style="font-size: 16px; line-height: 1.6; color: #555;">
                        Great news! You have been successfully registered as a contender for:
                    </p>

                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <h3 style="margin: 0 0 10px 0; font-size: 24px;">${eventName}</h3>
                        <p style="margin: 0; font-size: 14px;">🏟️ ${className} | 🌍 ${country}</p>
                    </div>

                    <p style="font-size: 16px; line-height: 1.6; color: #555;">
                        Get ready to showcase your skills! The competition is about to begin.
                    </p>

                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                        <p style="color: #666; font-size: 14px;">
                            <strong>What's next?</strong><br>
                            • Prepare for the event<br>
                            • Share with your fans to get votes<br>
                            • Stay tuned for updates
                        </p>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
                    <p>Best of luck!<br>The DYNAMIC EFOOTBALL COMMUNITY Team</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Contender notification email sent successfully');
        
        return true;
    } catch (error) {
        console.error('Error sending contender notification email:', error);
        return false;
    }
}

module.exports = {
    sendRegistrationToSuperAdmin,
    sendApprovalEmail,
    sendRejectionEmail,
    sendContenderNotification,
    sendHallOfFameNotification,
    testEmailConfiguration
};
