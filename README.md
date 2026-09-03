# 🎈 Balloon Dior Admin Dashboard Backend

Professional-grade admin registration and authentication system for Balloon Dior voting platform.

## 🎯 Features

✅ **Admin Registration** - Self-service registration with form validation  
✅ **Superadmin Approval** - Email-based approval workflow  
✅ **JWT Authentication** - Secure token-based auth with 24h expiration  
✅ **Password Security** - bcryptjs hashing with salt rounds  
✅ **Email Service** - HTML templates for registration, approval, rejection  
✅ **Supabase Integration** - Cloud PostgreSQL database  
✅ **Role-Based Access** - Admin and Superadmin roles  
✅ **File Upload Support** - Image and media upload with multer
✅ **WhatsApp Bot Integration** - Dedicated API endpoints for automated messaging
✅ **Error Handling** - Comprehensive error messages and validation

```
backend/
├── server.js                 # Express app entry point
├── package.json              # Dependencies & scripts
├── .env                      # Configuration (KEEP SECRET!)
├── .env.example              # Template for .env
├── config/
│   ├── db.js                 # Supabase client configuration
│   ├── multer.js             # File upload configuration
│   └── multer-images.js      # Image upload configuration
├── routes/
│   ├── admin.js              # Admin API endpoints (registration, login, approval)
│   ├── bot.js                # Bot API endpoints (check-new, list-all, mark-sent)
│   ├── contenders.js         # Contender management endpoints
│   ├── events.js             # Event management endpoints
│   └── votes.js              # Voting system endpoints
├── services/
│   └── email-service.js      # Email templates and sending
├── utils/
│   └── validation.js         # Input validation & hashing
├── QUICKSTART.md             # ⚡ 15-minute setup guide
├── SETUP_GUIDE.md            # 📖 Detailed setup (300+ lines)
├── ADMIN_SETUP.md            # 📊 Database schema & SQL
├── SUPERADMIN_GUIDE.md       # 👑 Superadmin procedures
└── TROUBLESHOOTING.md        # 🔧 Common issues & fixes
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy and edit `.env`:
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Setup Database
Run SQL from `ADMIN_SETUP.md` in Supabase SQL Editor

### 4. Start Server
```bash
npm run dev
```

Server runs on: **http://localhost:5000**

## 📚 Guides

| Guide | Purpose |
|-------|---------|
| [QUICKSTART.md](QUICKSTART.md) | ⚡ Get running in 15 minutes |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | 📖 Complete setup reference |
| [ADMIN_SETUP.md](ADMIN_SETUP.md) | 📊 Database schema & configuration |
| [SUPERADMIN_GUIDE.md](SUPERADMIN_GUIDE.md) | 👑 Approval workflow & best practices |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 🔧 Debug common issues |

## 🔌 API Endpoints

### Public Endpoints (No Auth Required)

#### POST `/api/admin/register`
Register new admin account
```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "password": "SecurePass123"
  }'
```

#### POST `/api/admin/login`
Login with username and password
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "SecurePass123"
  }'
```

### Protected Endpoints (Admin Auth Required)

#### GET `/api/admin/verify`
Verify JWT token validity
```bash
curl http://localhost:5000/api/admin/verify \
  -H "Authorization: Bearer <token>"
```

### Superadmin Endpoints (Superadmin Auth Required)

#### POST `/api/admin/approve`
Approve or reject admin registration
```bash
curl -X POST http://localhost:5000/api/admin/approve \
  -H "Authorization: SuperAdmin <SUPER_JWT_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "uuid", "action": "approve"}'
```

#### GET `/api/admin/pending-requests`
Get all pending admin registrations
```bash
curl http://localhost:5000/api/admin/pending-requests \
  -H "Authorization: SuperAdmin <SUPER_JWT_SECRET>"
```

## 🔌 Contenders API Endpoints

### Public Endpoints (No Auth Required)

#### GET `/api/contenders/new`
Get new contenders for WhatsApp bot (unsent with images)
```bash
curl http://localhost:5000/api/contenders/new

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "description": "Contestant description",
      "email": "john@example.com",
      "image": "https://example.com/image.jpg",
      "created_at": "2026-04-02T10:00:00Z"
    }
  ]
}
```

#### POST `/api/contenders/mark-sent`
Mark contender as sent (for WhatsApp bot)
```bash
curl -X POST http://localhost:5000/api/contenders/mark-sent \
  -H "Content-Type: application/json" \
  -d '{"contenderId": "uuid"}'

Response:
{
  "success": true,
  "message": "Contender marked as sent",
  "data": {
    "id": "uuid",
    "sent": true
  }
}
```

#### GET `/api/bot/hall-of-fame`
Get the complete Hall of Fame ranking for WhatsApp. Each person includes their
total trophy count and separate award/season records. The WhatsApp bot should
call this endpoint when it sends the Hall of Fame message.

### Protected Endpoints (Admin Auth Required)

#### GET `/api/contenders`
Get all contenders (with optional event filter)
```bash
curl http://localhost:5000/api/contenders \
  -H "Authorization: Bearer <token>"

# Filter by event
curl "http://localhost:5000/api/contenders?eventId=event-uuid" \
  -H "Authorization: Bearer <token>"
```

#### GET `/api/contenders/:id`
Get single contender by ID
```bash
curl http://localhost:5000/api/contenders/uuid \
  -H "Authorization: Bearer <token>"
```

#### POST `/api/contenders`
Create new contender
```bash
curl -X POST http://localhost:5000/api/contenders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "event-uuid",
    "name": "John Doe",
    "description": "Contestant description",
    "email": "john@example.com",
    "picture": "https://bucket-url/image.jpg",
    "class": "Professional",
    "country": "USA"
  }'
```

#### PUT `/api/contenders/:id`
Update contender
```bash
curl -X PUT http://localhost:5000/api/contenders/uuid \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "email": "updated@example.com",
    "picture": "https://bucket-url/new-image.jpg"
  }'
```

#### DELETE `/api/contenders/:id`
Delete contender
```bash
curl -X DELETE http://localhost:5000/api/contenders/uuid \
  -H "Authorization: Bearer <token>"
```

## 🤖 Bot API Endpoints

### Public Endpoints (No Auth Required - For Bot Integration)

#### GET `/api/bot/check-new`
Check for new contenders with images (for WhatsApp bot)
```bash
curl http://localhost:5000/api/bot/check-new

Response:
{
  "success": true,
  "hasNew": true,
  "count": 2,
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "description": "Contestant description",
      "email": "john@example.com",
      "picture": "https://bucket-url/image.jpg",
      "created_at": "2026-04-02T10:00:00Z"
    }
  ]
}
```

#### GET `/api/bot/list-all`
List all active contenders (draft/open events only, excluding images)
```bash
curl http://localhost:5000/api/bot/list-all

Response:
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "description": "Contestant description",
      "email": "john@example.com",
      "created_at": "2026-04-02T10:00:00Z",
      "sent": false,
      "trophies": 3
    }
  ]
}
```

#### POST `/api/bot/mark-sent`
Mark contender as sent (for WhatsApp bot)
```bash
curl -X POST http://localhost:5000/api/bot/mark-sent \
  -H "Content-Type: application/json" \
  -d '{"contenderId": "uuid"}'

Response:
{
  "success": true,
  "message": "Contender marked as sent",
  "data": {
    "id": "uuid",
    "sent": true
  }
}
```

## 🔐 Authentication

- **Admin Token:** JWT with 24-hour expiration
- **Superadmin Token:** Special token for approval operations
- **Storage:** localStorage on frontend
- **Header Format:** `Authorization: Bearer <token>`

## 📊 Database Schema

**admin_requests** - Pending registrations  
**admins** - Approved admin accounts  
**contenders** - Ballot participants (name, description, email, picture, sent, event_id, total_points, etc.)
**events** - Voting events
**vote_tables** - Voting table configurations
**point_tables** - Custom point table configurations
**contender_vote_records** - Vote tracking
**contender_point_records** - Admin point awards
**hall_of_fame_web** - Hall of Fame entries for trophy counting
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJxxx...
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
JWT_SECRET=your-secret-key
SUPER_JWT_SECRET=super-secret-key
SUPERADMIN_EMAIL=admin@example.com
NODE_ENV=development
PORT=5000
```

## 📦 Dependencies

- **express** - Web framework
- **cors** - Cross-origin requests
- **dotenv** - Environment variables
- **jsonwebtoken** - JWT tokens
- **@supabase/supabase-js** - Database client
- **nodemailer** - Email service
- **bcryptjs** - Password hashing
- **multer** - File upload handling
- **imap-simple** - Email inbox monitoring
- **mailparser** - Email parsing
- **nodemon** - Development auto-restart

## 🧪 Testing

### Test Registration
```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test","email":"test@example.com","username":"test","password":"Test1234"}'
```

### Test Login
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Test1234"}'
```

## 🔧 Development

Start in development mode:
```bash
npm run dev
```

Files automatically reload on changes. Check logs for errors.

## 🚀 Deployment

- **Heroku:** See SETUP_GUIDE.md
- **Firebase:** See SETUP_GUIDE.md
- **Docker:** See SETUP_GUIDE.md

## 🎯 Roadmap

### Phase 1 (Complete)
- ✅ Admin registration & approval
- ✅ JWT authentication
- ✅ Password security
- ✅ Email notifications

### Phase 2 (Next)
- [ ] Contender management API
- [ ] Vote management API
- [ ] Media upload
- [ ] Spectator tracking

## 📞 Support

- **Quick Help:** `TROUBLESHOOTING.md`
- **Setup:** `SETUP_GUIDE.md`
- **Admin Questions:** `SUPERADMIN_GUIDE.md`

---

**Version:** 1.0.0
**Status:** Ready for Production Testing
**Last Updated:** April 2, 2026

## Tournament System (Phase 2)

The tournament system is additive and does not alter the existing event/voting tables. Apply [tournament-schema.sql](tournament-schema.sql) in Supabase before using these endpoints.

- `GET /api/tournaments` and `GET /api/tournaments/:id` expose public tournament details, registrations, rounds, and matches.
- `POST /api/tournaments/:id/registrations` accepts participant registration during registration, rejects duplicates, and enforces the participant limit.
- Admin JWT endpoints create, edit, cancel, and open tournaments; approve registrations; generate draws; record disputes; and submit match results.
- Tournament statuses are `draft`, `registration`, `draw`, `in_progress`, `completed`, and `cancelled`.
- Matches support scheduled, in-progress, completed, and disputed states, score validation, deadlines, and winner progression.
- All admin mutations use the existing `requireAdmin` Bearer JWT boundary.

The implementation currently supports `single_elimination`. Tournament registration is free. Prize information is informational metadata only; payment processing is not implemented.
#   d y n - w e b 
 
 #   d y n - w e b - b a c k e n d 
 
 #   d y n - w e b - b a c k e n d 
 
 