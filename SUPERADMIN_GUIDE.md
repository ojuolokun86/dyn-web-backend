# Superadmin Guide - Admin Approval System

## 👑 Your Role as Superadmin

As the Superadmin, you are responsible for:
1. ✅ Reviewing admin registration requests
2. ✅ Approving or rejecting applications
3. ✅ Managing admin accounts
4. ✅ Ensuring system security
5. ✅ Monitoring admin activities

## 📧 Receiving Registration Requests

### How You Get Notified

When someone applies for admin access, you automatically receive an email to: **`SUPERADMIN_EMAIL`**

Email contains:
```
From: system@balloondior.com
Subject: 🏆 New Admin Registration Request - Balloon Dior

Body:
- Full Name
- Email Address  
- Username
- Registration ID
- Status: Pending Review

Instructions:
Reply to this email with:
  APPROVE - to accept the applicant
  REJECT - to deny the application
```

## ✅ Approving an Application

### Option 1: Email Reply (Easiest)

1. Open the registration email
2. Click "Reply"
3. Type: **`APPROVE`**
4. Add optional reason in next line
5. Send email

System will automatically:
- Create admin account
- Generate temporary password
- Send approval email to applicant
- Grant dashboard access

### Option 2: API Call

**You need:** Superadmin JWT token (set in .env as SUPER_JWT_SECRET)

```bash
curl -X POST http://localhost:5000/api/admin/approve \
  -H "Authorization: SuperAdmin <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-here",
    "action": "approve"
  }'
```

## ❌ Rejecting an Application

### Option 1: Email Reply

1. Open the registration email
2. Click "Reply"
3. Type: **`REJECT`**
4. Add reason (optional):
   - `Insufficient qualifications`
   - `Security concerns`
   - `Policy violation`
   - `Other: explain...`
5. Send email

Applicant receives:
- Rejection notification
- Reason for rejection
- Option to reapply

### Option 2: API Call

```bash
curl -X POST http://localhost:5000/api/admin/approve \
  -H "Authorization: SuperAdmin <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-here",
    "action": "reject"
  }'
```

## 📋 Viewing Pending Requests

### Via Dashboard (Future)
Admin dashboard will have a superadmin panel showing:
- Pending applicants
- Their details
- Approve/Reject buttons
- History of approvals

### Via API

```bash
curl http://localhost:5000/api/admin/pending-requests \
  -H "Authorization: SuperAdmin <your_token>"
```

Response:
```json
{
  "success": true,
  "requests": [
    {
      "id": "123...",
      "fullName": "John Doe",
      "email": "john@example.com",
      "username": "johndoe",
      "status": "pending",
      "createdAt": "2026-02-22T..."
    }
  ]
}
```

## 🎯 Best Practices

### ✅ DO:
- Review applications within 24-48 hours
- Verify applicant credentials when possible
- Keep security as top priority
- Document approval reasons
- Communicate clearly with applicants
- Monitor admin activities

### ❌ DON'T:
- Approve without verification
- Share admin credentials
- Use weak passwords
- Ignore suspicious applications
- Leave the system unattended
- Neglect security updates

## 🔒 Security Tips

1. **Protect Your Email**
   - Use strong password
   - Enable 2FA on your email account
   - Don't share your email credentials

2. **Guard the JWT Secret**
   - Keep `SUPER_JWT_SECRET` confidential
   - Never commit secrets to git
   - Rotate secrets periodically in production

3. **Verify Applicants**
   - Check email domain legitimacy
   - Google search the applicant name
   - Ask for credentials/references if needed
   - Trust your instinct

4. **Monitor Activities**
   - Check admin login logs weekly
   - Review admin actions
   - Remove inactive admins
   - Revoke access when needed

## 🚨 Red Flags

Consider rejecting applications if:

⚠️ Suspicious email domain
⚠️ Incomplete or vague information
⚠️ Multiple applications from same person
⚠️ Weak or common passwords
⚠️ No professional details
⚠️ Spammy language
⚠️ Requests for data access inappropriate for their role

## 📊 Managing Existing Admins

(Via future admin panel)

- View all admin accounts
- Filter by status (active, inactive, suspended)
- View last login time
- View actions performed
- Deactivate/suspend accounts
- Reset passwords
- Edit role or permissions

## 🆘 Emergency Procedures

### If Admin Account Compromised
1. Immediately suspend the account
2. Change all sensitive passwords
3. Contact affected parties
4. Review recent admin actions
5. Document incident

### If Someone Impersonates You
1. Immediately change SUPER_JWT_SECRET
2. Check for unauthorized approvals
3. Reject or revoke suspicious admins
4. Update password management

### System Goes Down
1. Check backend server status
2. Verify Supabase connection
3. Check logs: `npm run dev` for errors
4. Restart server if needed
5. Contact hosting provider if still down

## 📞 Escalation Process

### High-Priority Requests
For critical applications or issues:

1. Save email or request details
2. Verify all information
3. Make decision within 24 hours
4. Document reason
5. Notify applicant

### Appeals
If applicant disagrees with rejection:
1. Request formal appeal
2. Review original decision
3. Consider new information
4. Make final determination
5. Communicate clearly

## 📅 Routine Tasks

### Weekly
- [ ] Check pending applications
- [ ] Review recent approvals
- [ ] Monitor admin activities

### Monthly
- [ ] Audit admin accounts
- [ ] Review security incidents
- [ ] Update admin list
- [ ] Check abandoned accounts

### Quarterly
- [ ] Review all approvals
- [ ] Remove inactive admins
- [ ] Update security policies
- [ ] Plan infrastructure upgrades

## 💡 Templates

### Approval Email Reply
```
APPROVE

Name verified. Good credentials. Ready to contribute to the platform.
```

### Rejection Email Reply
```
REJECT

Thank you for applying. Unfortunately, we cannot approve this request at this time. 
We are looking for candidates with more experience in event management.
Please reapply in 6 months.
```

### Verification Email
```
Hi [Name],

Before approving your admin request, could you please:
1. Confirm your connection to [Organization]
2. Provide your LinkedIn profile
3. Explain your experience with event management

Regards,
Superadmin Team
```

## 🔗 Quick Links

- **Backend Server:** `http://localhost:5000`
- **Frontend Home:** `http://localhost:3000`
- **Admin Login:** `http://localhost:3000/admin-login.html`
- **Registration:** `http://localhost:3000/admin-register.html`
- **Supabase DB:** https://app.supabase.com

## 🆔 Credentials

Your superadmin credentials:
```
Email: [SUPERADMIN_EMAIL from .env]
JWT Secret: [SUPER_JWT_SECRET from .env]

Keep these secure!
```

---

**Last Updated:** February 22, 2026  
**Version:** 1.0.0
