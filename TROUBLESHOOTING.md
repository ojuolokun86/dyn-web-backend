# Troubleshooting Guide - Admin Dashboard System

## 🔧 Common Issues & Solutions

### Backend Server Issues

#### ❌ Error: `listen EADDRINUSE :::5000`
**Problem:** Port 5000 is already in use

**Solutions:**
```bash
# Option 1: Kill process on port 5000 (Windows)
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Option 2: Use different port
set PORT=5001
npm run dev

# Option 3: Check what's using it
lsof -i :5000  # Mac/Linux
```

---

#### ❌ Error: `Cannot find module '@supabase/supabase-js'`
**Problem:** Dependencies not installed

**Solution:**
```bash
cd backend
npm install
```

---

#### ❌ Error: `ENOENT: no such file or directory, open '.env'`
**Problem:** .env file missing

**Solution:**
```bash
# Copy template
cp .env.example .env

# Edit with your credentials
nano .env
# OR
code .env
```

---

#### ❌ Error: `Supabase connection failed`
**Problem:** Invalid Supabase credentials or database unreachable

**Solutions:**
1. Check `.env` file has correct values:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_KEY=eyJx...
   ```

2. Verify Supabase project exists:
   - Go to https://app.supabase.com
   - Check project is "Active" (not paused)
   - Check you're in correct organization

3. Test connection:
   ```bash
   node -e "require('dotenv').config(); const { createClient } = require('@supabase/supabase-js'); console.log(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY));"
   ```

---

### Database Issues

#### ❌ Error: `relation "admin_requests" does not exist`
**Problem:** Tables haven't been created

**Solution:**
1. Go to Supabase dashboard
2. Click "SQL Editor"
3. Run entire SQL from `ADMIN_SETUP.md`
4. Wait for tables to be created
5. Restart backend: `npm run dev`

---

#### ❌ Error: `duplicate key value violates unique constraint`
**Problem:** Trying to insert duplicate email or username

**Solutions:**
- Try registering with different email/username
- Check if username/email already exists in `admins` table
- Clear test data if needed:
  ```sql
  DELETE FROM admin_requests WHERE email = 'test@example.com';
  DELETE FROM admins WHERE email = 'test@example.com';
  ```

---

#### ❌ Error: `connection timeout`
**Problem:** Database taking too long to respond

**Solutions:**
1. Check Supabase status: https://status.supabase.com
2. Wait a few seconds and retry
3. Check internet connection
4. Verify SUPABASE_URL is correct (no typos)

---

### Email Issues

#### ❌ Error: `Authentication failed - 535 5.7.8`
**Problem:** Gmail App Password is incorrect

**Solution:**
1. Go to: https://myaccount.google.com/apppasswords
2. Select Mail app and Windows Device (or your device)
3. Copy the 16-character password (without spaces)
4. Paste into `.env` as `EMAIL_PASSWORD`
5. Restart backend

---

#### ❌ Error: `Email sent but not received`
**Problem:** Email lost in spam or configuration issue

**Solutions:**
1. Check spam folder for email
2. Verify `SUPERADMIN_EMAIL` in .env is correct
3. Test email service:
   ```bash
   node -e "
   require('dotenv').config();
   const nodemailer = require('nodemailer');
   const transporter = nodemailer.createTransport({
     service: 'gmail',
     auth: {
       user: process.env.EMAIL_USER,
       pass: process.env.EMAIL_PASSWORD
     }
   });
   transporter.verify((err, success) => {
     if (err) console.log('ERROR:', err);
     else console.log('✅ Email service working!');
   });
   "
   ```

---

#### ❌ Error: `Permission denied - LESS_SECURE_APP_ACCESS`
**Problem:** Gmail doesn't recognize nodemailer

**Solution:**
1. Use App Passwords (recommended) - see above
2. OR enable Less Secure Apps (not recommended):
   - https://myaccount.google.com/security
   - Turn on "Less secure app access"

---

### Frontend Issues

#### ❌ "Registration API endpoint not found"
**Problem:** Frontend trying to reach wrong URL

**Solution:**
Check `admin-register.js`:
```javascript
// Should be:
const API_BASE_URL = 'http://localhost:5000';

// NOT:
'http://localhost:3000'
'http://localhost:3001'
```

---

#### ❌ "Invalid token" after login
**Problem:** JWT token expired or corrupted

**Solutions:**
1. Clear localStorage:
   ```javascript
   localStorage.clear(); location.reload();
   ```

2. Login again and check if new token works

3. Verify token not too old (24 hour expiration):
   ```javascript
   const token = localStorage.getItem('adminToken');
   const payload = JSON.parse(atob(token.split('.')[1]));
   console.log('Expires:', new Date(payload.exp * 1000));
   ```

---

#### ❌ CORS error: "Access to XMLHttpRequest blocked"
**Problem:** Backend CORS not allowing frontend origin

**Solution:**
Check `server.js` has frontend URLs in CORS config:
```javascript
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  // Add your frontend URL if different
};
```

---

### Authentication Issues

#### ❌ "Invalid username or password"
**Problem:** Credentials don't match database

**Solutions:**
1. Request new password from superadmin (app sends temp password)
2. Check username is exact match (case-sensitive)
3. Verify admin account exists:
   ```sql
   SELECT * FROM admins WHERE username = 'your_username';
   ```

---

#### ❌ "Pending approval" message on login
**Problem:** Account hasn't been approved yet

**Solutions:**
1. Wait for superadmin approval (24-48 hours)
2. Check email for approval email
3. Superadmin should check pending requests:
   ```bash
   curl http://localhost:5000/api/admin/pending-requests \
     -H "Authorization: SuperAdmin <token>"
   ```

---

#### ❌ "Cannot verify token" after page reload
**Problem:** Token missing or endpoint issue

**Solutions:**
1. Check token stored in localStorage
2. Verify `/api/admin/verify` endpoint is working:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/admin/verify
   ```

3. Check if backend is running:
   ```bash
   curl http://localhost:5000/
   ```

---

### Performance Issues

#### 🐢 Slow registration form submission
**Problem:** Backend response taking too long

**Debug steps:**
```bash
# Check server status
curl http://localhost:5000/

# Check database connection
# (Add debug logging to backend)
```

---

#### 🐢 Slow email sending
**Problem:** Nodemailer taking time or Gmail throttling

**Solutions:**
1. Use different email service (SendGrid, AWS SES)
2. Implement async queuing for bulk emails
3. Increase timeout in nodemailer config

---

### Data Issues

#### ❌ "Duplicate entry" for same email/username
**Problem:** Test data creating duplicates

**Solution - Clean test data:**
```sql
-- View duplicates
SELECT email, COUNT(*) FROM admin_requests 
GROUP BY email HAVING COUNT(*) > 1;

-- Delete specific test entry
DELETE FROM admin_requests 
WHERE email = 'test@example.com' AND id != 'keep_this_id';

-- Or reset entire table (CAUTION - deletes all data!)
TRUNCATE table admin_requests;
```

---

#### ❌ Applicant shows up in pending but already approved
**Problem:** Status didn't update in database

**Solutions:**
1. Manually update status:
   ```sql
   UPDATE admin_requests 
   SET status = 'approved', processedAt = NOW() 
   WHERE id = 'request_id';
   ```

2. Check if admin account was actually created:
   ```sql
   SELECT * FROM admins WHERE email = 'test@example.com';
   ```

---

### Deployment Issues

#### ❌ Working locally but fails online
**Problem:** Environmental differences

**Checklist:**
- [ ] `.env` file uploaded with correct secrets
- [ ] Supabase project accessible from hosting
- [ ] Email service credentials valid for production
- [ ] Frontend calls correct backend URL
- [ ] CORS allows frontend domain
- [ ] SSL certificates installed
- [ ] Firewall allows port 5000

---

## 🧪 Testing Checklist

### Pre-Launch Tests

- [ ] Backend starts: `npm run dev`
- [ ] Health check works: `curl http://localhost:5000/`
- [ ] Database connected: Check in console logs
- [ ] Email service working: Nodemailer verify passes
- [ ] CORS configured: Frontend can reach backend
- [ ] Registration form loads: `http://localhost:3000/admin-register.html`
- [ ] Can register new admin (fills form, submits)
- [ ] Email received by SUPERADMIN_EMAIL
- [ ] Superadmin email has approval link
- [ ] Superadmin can approve (click link or API)
- [ ] Applicant receives approval email
- [ ] Can login with approved account
- [ ] Dashboard loads after login
- [ ] Token persists after page reload
- [ ] Logout clears token and redirects

### Stress Tests

```bash
# Test rapid registrations
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/admin/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@example.com\",\"username\":\"user$i\",\"password\":\"test123\",\"fullName\":\"Test User $i\"}"
done

# Test pending requests endpoint
curl http://localhost:5000/api/admin/pending-requests \
  -H "Authorization: SuperAdmin <token>"
```

---

## 📊 Debug Mode

### Enable Extended Logging

**In `server.js`:**
```javascript
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Body:', req.body);
  next();
});

app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: err.message });
});
```

**In `email-service.js`:**
```javascript
export const sendEmail = async (to, subject, html) => {
  console.log('📧 Sending email to:', to);
  console.log('Subject:', subject);
  // ... rest of function
};
```

---

## 🆘 Still Stuck?

### Gather Debug Info
```bash
# Backend info
npm list
node --version
npm --version

# Database status
echo "Check: https://app.supabase.com - Project Status"

# Email test
node -e "require('dotenv').config(); console.log('EMAIL_USER:', process.env.EMAIL_USER);"

# Network test
ping supabase.co
curl -v http://localhost:5000/
```

### Create Issue Report
Include:
1. Error message (copy-paste exactly)
2. Which step failed (register/approve/login/etc)
3. Browser console errors
4. Backend logs output
5. `.env` file (without sensitive values)
6. Steps to reproduce

---

**For Additional Help:**
- Check logs in terminal running `npm run dev`
- Review email received (forwarded to support)
- Check Supabase dashboard > Logs
- Test endpoints with Postman
- Compare with SETUP_GUIDE.md

---

**Last Updated:** February 22, 2026  
**Version:** 1.0.0
