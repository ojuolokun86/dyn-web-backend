# Admin Registration & Approval System - Complete Setup Guide

## 🎯 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ADMIN REGISTRATION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. User Registration (admin-register.html)
   └─→ POST /api/admin/register
       └─→ Validate input
       └─→ Hash password (bcryptjs)
       └─→ Save to Supabase admin_requests table
       └─→ Send email to SUPERADMIN_EMAIL
       └─→ Return: Registration pending

2. Superadmin Review (superadmin portal) 
   └─→ Receive email with registration details
   └─→ Reply YES or NO (email-based)
   └─→ Or use API: POST /api/admin/approve

3. If Approved
   └─→ Generate temporary password
   └─→ Create admin in admins table
   └─→ Generate JWT token
   └─→ Send email to user with credentials

4. User Login (admin-login.html)
   └─→ POST /api/admin/login
   └─→ Verify credentials from admins table
   └─→ Generate JWT token
   └─→ Return token + admin info
   └─→ User accesses admin.html
```

## 📋 Backend Setup

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

This installs:
- `express` - Web framework
- `@supabase/supabase-js` - Database client
- `nodemailer` - Email service
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT auth

### Step 2: Configure .env File

Update `backend/.env`:
```env
PORT=5000
NODE_ENV=development

# JWT Secrets
JWT_SECRET=your_super_strong_secret_key_min_32_chars_2026
SUPER_JWT_SECRET=super_admin_hardcore_secret_key_2026

# Supabase
SUPABASE_URL=https://wjpelhrjclljpgqeavyp.supabase.co
SUPABASE_KEY=eyJhbGc...

# Email (Gmail)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Superadmin
SUPERADMIN_EMAIL=your-email@gmail.com

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### Step 3: Setup Supabase Tables

Go to Supabase Dashboard → SQL Editor and run all SQL from `ADMIN_SETUP.md`

**Tables needed:**
- `admin_requests` - Pending registrations
- `admins` - Approved admins account
- `contenders` - Contest participants  
- `votes` - Voting events

### Step 4: Gmail App Password

1. Go to myaccount.google.com
2. Enable 2-Factor Authentication
3. Create App Password for Gmail
4. Copy password to .env `EMAIL_PASSWORD`

### Step 5: Run Backend

```bash
npm run dev  # Development with auto-reload
npm start    # Production
```

Server runs on: `http://localhost:5000`

## 🖥️ Frontend Setup

### Admin Registration Flow

**File:** `admin-register.html` + `admin-register.js`

Users can register by:
1. Visiting `/admin-register.html`
2. Filling: Full Name, Email, Username, Password
3. Submitting registration
4. System confirms with email: "Review in progress"
5. Superadmin reviews & approves
6. User receives email with login credentials
7. User logs in with username & temporary password

### Admin Login Flow

**File:** `admin-login.html` + `admin-login.js`

1. Visit `/admin-login.html`
2. Enter username & password
3. Click Login
4. JWT token stored in localStorage
5. Redirected to `/admin.html` (dashboard)

### Demo Credentials

For testing without Supabase:
- Username: `admin`
- Password: `admin123`

## 🔌 API Endpoints

### 1. Register
```
POST /api/admin/register
Content-Type: application/json

{
  "fullName": "John Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "password": "SecurePass123"
}
```

### 2. Login
```
POST /api/admin/login

{
  "username": "johndoe",
  "password": "SecurePass123"
}

Returns: JWT token
```

### 3. Verify Token
```
GET /api/admin/verify
Authorization: Bearer <token>
```

### 4. Approve/Reject (Superadmin)
```
POST /api/admin/approve
Authorization: SuperAdmin <token>

{
  "requestId": "...",
  "action": "approve" // or "reject"
}
```

### 5. Pending Requests (Superadmin)
```
GET /api/admin/pending-requests
Authorization: SuperAdmin <token>
```

## 📧 Email Templates

### Registration Submitted Email
Sent to: `SUPERADMIN_EMAIL`
Contains:
- User's full name, email, username
- Superadmin requested to reply YES/NO

### Approval Email
Sent to: User's email
Contains:
- "Application Approved" message
- Temporary password
- Login URL
- Security reminders

### Rejection Email
Sent to: User's email
Contains:
- "Application Rejected" message
- Reasons for rejection
- Reapply instructions

## 🔐 Security Features

✅ **Password Hashing** - bcryptjs with salt rounds
✅ **JWT Tokens** - 24-hour expiration
✅ **Email Validation** - Regex pattern checking
✅ **Input Validation** - All fields validated
✅ **Superadmin Auth** - Special token for approvals
✅ **Database Constraints** - Unique emails/usernames
✅ **Status Tracking** - Pending → Approved → Active

## 🚀 Deployment Checklist

- [ ] Update JWT secrets in .env (production)
- [ ] Update SUPERADMIN_EMAIL to your email
- [ ] Configure real Gmail account with App Password
- [ ] Test Supabase connection
- [ ] Run database migrations/schema setup
- [ ] Test email sending
- [ ] Deploy backend to server (Heroku, Railways, etc.)
- [ ] Update CORS_ORIGIN in .env for production URLs
- [ ] Enable HTTPS
- [ ] Setup email forwarding or notifications

## 🐛 Troubleshooting

### "Connection refused" error
```
Backend server not running on port 5000
Solution: npm run dev
```

### "Email sending failed"
```
Check .env EMAIL_USER and EMAIL_PASSWORD
Go to myaccount.google.com and verify App Password
```

### "Supabase connection error"
```
Verify SUPABASE_URL and SUPABASE_KEY in .env
Check internet connection
Ensure tables are created in Supabase
```

### Password hash not working
```
Ensure bcryptjs is installed: npm install bcryptjs
```

## 📚 Directory Structure

```
backend/
├── config/
│   └── db.js           # Supabase client
├── routes/
│   └── admin.js        # Admin endpoints
├── services/
│   └── email-service.js # Email functions
├── utils/
│   └── validation.js   # Validation functions
├── server.js           # Main Express server
├── package.json        # Dependencies
├── .env                # Configuration
└── ADMIN_SETUP.md      # SQL schema

frontend/
├── admin-login.html    # Login page
├── admin-register.html # Registration page
├── admin.html          # Dashboard
├── js/
│   ├── admin-login.js
│   ├── admin-register.js
│   └── admin.js       # Dashboard logic
└── css/
    ├── admin-login.css
    └── admin-dashboard.css
```

## 🎓 Use Cases

### User Tries to Register
1. Clicks "Apply for admin access" on login page
2. Fills registration form
3. Gets "Review in progress" confirmation
4. Superadmin receives email
5. Response decides approval/rejection

### Superadmin Approves Request
1. Receives email from system
2. Reply to email: "APPROVE"
3. System processes approval
4. Creates admin account with temp password
5. Sends approval email to user
6. User can now login

### New Admin Logs In
1. Uses username & temporary password
2. Should change password after login
3. Gets full dashboard access
4. Can manage contenders, votes, spectators

## 📞 Support

For issues:
1. Check logs in terminal
2. Verify .env configuration
3. Check Supabase tables
4. Test API endpoints with Postman
5. Check email spam folder

---

**Version:** 1.0.0  
**Last Updated:** February 22, 2026
