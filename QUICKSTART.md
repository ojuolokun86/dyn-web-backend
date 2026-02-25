# ⚡ Quick Start Checklist

Get the Balloon Dior Admin Dashboard running in 15 minutes!

## 📋 Pre-Launch (One-Time Setup)

### Step 1: Prepare Credentials (2 min)
- [ ] Go to https://app.supabase.com
- [ ] Create or select your project
- [ ] Get: `Project URL` and `Anon Key`
- [ ] Get Gmail email: `your-email@gmail.com`
- [ ] Get Gmail App Password from https://myaccount.google.com/apppasswords

### Step 2: Update .env File (3 min)
Edit `/backend/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJxxx...
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
SUPERADMIN_EMAIL=your-email@gmail.com
JWT_SECRET=your-secret-key-123
SUPER_JWT_SECRET=super-secret-key-456
NODE_ENV=development
```

### Step 3: Create Database Tables (3 min)
1. Go to https://app.supabase.com
2. Click "SQL Editor" in left sidebar
3. Click "New Query"
4. Copy entire SQL from `/backend/ADMIN_SETUP.md`
5. Click "Run"
6. Wait for success message ✅

### Step 4: Install Dependencies (5 min)
```bash
cd backend
npm install
```

### Step 5: Start Backend Server (1 min)
```bash
npm run dev
```

You should see:
```
✅ Server running on port 5000
✅ Supabase connected
✅ Email service ready
```

---

## 🚀 Ready to Test

### Test 1: Register as Admin
1. Open: http://localhost:3000/admin-register.html
2. Fill form:
   - Full Name: `John Doe`
   - Email: `john@example.com`
   - Username: `johndoe`
   - Password: `Test1234`
   - Confirm: `Test1234`
3. Click "Register"
4. Check email at `SUPERADMIN_EMAIL`

### Test 2: Approve Registration
1. Check email inbox (SUPERADMIN_EMAIL)
2. Look for email from system with subject "🏆 New Admin Registration Request"
3. Option A: Reply to email with `APPROVE`
4. Option B: Use API:
   ```bash
   curl -X POST http://localhost:5000/api/admin/approve \
     -H "Authorization: SuperAdmin <SUPER_JWT_SECRET>" \
     -H "Content-Type: application/json" \
     -d '{"requestId":"<id-from-email>","action":"approve"}'
   ```

### Test 3: Login as Admin
1. Open: http://localhost:3000/admin-login.html
2. Enter credentials:
   - Username: `johndoe`
   - Password: `Test1234` (or temp password from approval email)
3. Click "Login"
4. You should see the dashboard ✅

---

## 🎯 What's Working

✅ Admin registration with email verification  
✅ Superadmin approval/rejection system  
✅ JWT-based authentication  
✅ Modern admin dashboard  
✅ Password hashing & security  
✅ Email notifications  

---

## 📍 URLs Reference

```
Admin Register:  http://localhost:3000/admin-register.html
Admin Login:     http://localhost:3000/admin-login.html
Admin Dashboard: http://localhost:3000/admin.html (after login)
Backend Server:  http://localhost:5000
Supabase:        https://app.supabase.com
Gmail App Pwd:   https://myaccount.google.com/apppasswords
```

---

## ❓ Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| Port 5000 in use | Change port: `set PORT=5001 && npm run dev` |
| Module not found | Run: `npm install` |
| Database tables don't exist | Run SQL from ADMIN_SETUP.md in Supabase |
| Emails not sending | Check Gmail App Password is correct |
| CORS error | Verify frontend URL in CORS config |
| Invalid token | Clear localStorage: `localStorage.clear()` |
| Supabase connection error | Check URL format and credentials |

See `TROUBLESHOOTING.md` for detailed solutions.

---

## 📚 Full Guides

- **Setup Details:** `SETUP_GUIDE.md` (comprehensive 300+ lines)
- **Superadmin Help:** `SUPERADMIN_GUIDE.md` (approval procedures)
- **Troubleshooting:** `TROUBLESHOOTING.md` (common issues & fixes)
- **Database Schema:** `ADMIN_SETUP.md` (SQL and table info)

---

## 🎓 Next Steps After Launch

1. **Test all endpoints** with Postman
2. **Create test accounts** for QA
3. **Customize email templates** in `/backend/services/email-service.js`
4. **Build Superadmin Panel** for managing approvals (frontend needed)
5. **Add Contender Management** API endpoints
6. **Implement Vote Management** system
7. **Set up Media Upload** functionality

---

## ✅ Success Indicators

- [ ] Backend console shows: "✅ Supabase connected"
- [ ] Backend console shows: "✅ Email service ready"
- [ ] Can access: http://localhost:3000/admin-register.html
- [ ] Can register without errors
- [ ] Email arrives at SUPERADMIN_EMAIL within 5 seconds
- [ ] Email is not in spam folder
- [ ] Can approve/reject via email reply
- [ ] Applicant receives approval email
- [ ] Can login to dashboard with approved account
- [ ] Dashboard loads successfully

---

## 🚨 Critical Files

Must exist and be configured:
- `/backend/.env` ← Add your credentials here
- `/backend/config/db.js` ← Supabase client
- `/backend/services/email-service.js` ← Email templates
- `/backend/routes/admin.js` ← API endpoints
- `/backend/server.js` ← Express server

---

**Ready to launch? Start from Step 1 above! ⚡**

**Estimated Time:** 15 minutes  
**Difficulty:** Beginner  
**Last Updated:** February 22, 2026
