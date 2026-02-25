# Balloon Dior Backend - Admin Registration System Setup

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Edit `.env` file with your configuration:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your_strong_jwt_secret_key
SUPER_JWT_SECRET=your_super_admin_jwt_secret

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Email Service (Gmail)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Superadmin
SUPERADMIN_EMAIL=superadmin@balloondior.com

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### 3. Create Supabase Tables

Login to your Supabase dashboard and run these SQL commands:

#### Create admin_requests table
```sql
CREATE TABLE admin_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by TEXT,
  
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_admin_requests_email ON admin_requests(email);
CREATE INDEX idx_admin_requests_username ON admin_requests(username);
CREATE INDEX idx_admin_requests_status ON admin_requests(status);
```

#### Create admins table
```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_username ON admins(username);
CREATE INDEX idx_admins_status ON admins(status);
```

#### Create contenders table
```sql
CREATE TABLE contenders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  class TEXT,
  country TEXT,
  pictures INT DEFAULT 0,
  videos INT DEFAULT 0,
  votes INT DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contenders_class ON contenders(class);
CREATE INDEX idx_contenders_country ON contenders(country);
```

#### Create events table
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'winner_announced')),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  winner_id UUID REFERENCES contenders(id),
  total_votes_allowed INT DEFAULT 1,
  total_votes INT DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_dates ON events(started_at, ended_at);
```

#### Update contenders table (add event reference and total_points)
```sql
ALTER TABLE contenders ADD COLUMN event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE contenders ADD COLUMN total_points INT DEFAULT 0;

CREATE INDEX idx_contenders_event ON contenders(event_id);
```

#### Create vote_tables table (for 1, 2, or 3 voting tables per event)
```sql
CREATE TABLE vote_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  table_number INT NOT NULL CHECK (table_number IN (1, 2, 3)),
  points_per_vote INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(event_id, table_number)
);

CREATE INDEX idx_vote_tables_event ON vote_tables(event_id);
```

#### Create point_tables table (custom titled point tables)
```sql
CREATE TABLE point_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  default_points NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(event_id, title)
);

CREATE INDEX idx_point_tables_event ON point_tables(event_id);
```

#### Create contender_vote_records table (track vote points awarded)
```sql
CREATE TABLE contender_vote_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contender_id UUID NOT NULL REFERENCES contenders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vote_table_id UUID NOT NULL REFERENCES vote_tables(id) ON DELETE CASCADE,
  points_awarded NUMERIC NOT NULL,
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  voter_ip TEXT
);

CREATE INDEX idx_contender_vote_records_contender ON contender_vote_records(contender_id);
CREATE INDEX idx_contender_vote_records_event ON contender_vote_records(event_id);
CREATE INDEX idx_contender_vote_records_vote_table ON contender_vote_records(vote_table_id);
```

#### Create contender_point_records table (track admin-awarded points)
```sql
CREATE TABLE contender_point_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contender_id UUID NOT NULL REFERENCES contenders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  point_table_id UUID NOT NULL REFERENCES point_tables(id) ON DELETE CASCADE,
  points_awarded NUMERIC NOT NULL,
  awarded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  voter_ip TEXT,
  note TEXT
);

CREATE INDEX idx_contender_point_records_contender ON contender_point_records(contender_id);
CREATE INDEX idx_contender_point_records_event ON contender_point_records(event_id);
CREATE INDEX idx_contender_point_records_point_table ON contender_point_records(point_table_id);
```

#### Migrations (alter existing tables to support fractional points)
Run these in Supabase SQL editor if your tables already exist and you want to allow decimal points:
```sql
ALTER TABLE point_tables ALTER COLUMN default_points TYPE NUMERIC USING default_points::numeric;
ALTER TABLE contender_vote_records ALTER COLUMN points_awarded TYPE NUMERIC USING points_awarded::numeric;
ALTER TABLE contender_point_records ALTER COLUMN points_awarded TYPE NUMERIC USING points_awarded::numeric;
-- If you track total_points on contenders, convert it too:
ALTER TABLE contenders ADD COLUMN IF NOT EXISTS total_points NUMERIC DEFAULT 0;
ALTER TABLE contenders ALTER COLUMN total_points TYPE NUMERIC USING COALESCE(total_points,0)::numeric;
```

### 4. Run Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server will be available at `http://localhost:5000`

## API Endpoints

### 🎯 Event Management APIs

#### Create Event
```
POST /api/events
Authorization: Bearer <admin_token>
Content-Type: application/json

Body:
{
  "name": "Balloon Dior 2026",
  "description": "Annual award voting event",
  "totalVotesAllowed": 1
}

Response:
{
  "success": true,
  "message": "Event created",
  "data": {
    "id": "event-uuid",
    "name": "Balloon Dior 2026",
    "status": "draft",
    "createdBy": "admin_username"
  }
}
```

#### Get Current Event
```
GET /api/events/current

Response:
{
  "success": true,
  "data": {
    "id": "event-uuid",
    "name": "Balloon Dior 2026",
    "description": "...",
    "status": "open",
    "totalVotes": 1234,
    "winnerId": null,
    "startedAt": "2026-02-22T10:00:00Z",
    "endedAt": null
  }
}
```

#### Get All Events
```
GET /api/events
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "data": [...]
}
```

#### Open Event (Start Voting)
```
PUT /api/events/:id/open
Authorization: Bearer <admin_token>
Content-Type: application/json

Response:
{
  "success": true,
  "message": "Event opened for voting",
  "data": {
    "id": "event-uuid",
    "status": "open",
    "startedAt": "2026-02-22T10:00:00Z"
  }
}
```

#### Close Event (Stop Voting)
```
PUT /api/events/:id/close
Authorization: Bearer <admin_token>
Content-Type: application/json

Response:
{
  "success": true,
  "message": "Event closed",
  "data": {
    "id": "event-uuid",
    "status": "closed",
    "endedAt": "2026-02-22T18:00:00Z"
  }
}
```

#### Announce Winner
```
PUT /api/events/:id/winner
Authorization: Bearer <admin_token>
Content-Type: application/json

Body:
{
  "winnerId": "contender-uuid"
}

Response:
{
  "success": true,
  "message": "Winner announced",
  "data": {
    "id": "event-uuid",
    "status": "winner_announced",
    "winnerId": "contender-uuid"
  }
}
```

### Admin Registration
```
POST /api/admin/register
Content-Type: application/json

Body:
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "password": "SecurePass123"
}

Response:
{
  "success": true,
  "message": "Registration request submitted! Check your email for updates.",
  "data": {
    "id": "...",
    "email": "john@example.com",
    "username": "johndoe",
    "status": "pending"
  }
}
```

### Admin Login
```
POST /api/admin/login
Content-Type: application/json

Body:
{
  "username": "johndoe",
  "password": "SecurePass123"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGc...",
  "admin": {
    "id": "...",
    "username": "johndoe",
    "email": "john@example.com",
    "fullName": "John Doe",
    "role": "admin"
  }
}
```

### Superadmin Approval
```
POST /api/admin/approve
Authorization: SuperAdmin <superadmin_token>
Content-Type: application/json

Body:
{
  "requestId": "...",
  "action": "approve" // or "reject"
}
```

### Get Pending Requests
```
GET /api/admin/pending-requests
Authorization: SuperAdmin <superadmin_token>

Response:
{
  "success": true,
  "requests": [...]
}
```

### Verify Token
```
GET /api/admin/verify
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "admin": {
    "id": "...",
    "username": "...",
    "email": "...",
    "role": "admin"
  }
}
```

## Admin Registration Flow

1. **User submits registration** (`POST /api/admin/register`)
2. **System validates input** - Checks email, username, password
3. **Email sent to superadmin** - Contains registration details
4. **Superadmin reviews & approves/rejects**
5. **If approved**: Email sent to user with temporary password
6. **User logs in** with username & temporary password
7. **JWT token generated** for authenticated requests

## Email Configuration

### Gmail Setup
1. Go to myaccount.google.com
2. Enable 2-Factor Authentication
3. Create App Password for Gmail
4. Use the App Password in `.env` file

### Alternative Email Services
Update `EMAIL_SERVICE` in `.env` and configure accordingly in `services/email-service.js`

## Security Notes

- 🔐 Change `JWT_SECRET` and `SUPER_JWT_SECRET` in production
- 🔐 Use strong `SUPERADMIN_EMAIL` password
- 🔐 Never commit `.env` file to version control
- 🔐 Implement rate limiting for login/register endpoints
- 🔐 Use HTTPS in production
- 🔐 Regularly update dependencies

## Troubleshooting

### Email not sending
- ✅ Check EMAIL_USER and EMAIL_PASSWORD in .env
- ✅ Verify email service is enabled
- ✅ Check spam folder for test emails

### Supabase connection error
- ✅ Verify SUPABASE_URL and SUPABASE_KEY
- ✅ Check internet connection
- ✅ Ensure tables are created

### Token verification fails
- ✅ Check JWT_SECRET matches frontend
- ✅ Verify token hasn't expired (24h)
- ✅ Ensure token is passed correctly in Authorization header

## Next Steps

- [ ] Implement rate limiting
- [ ] Add refresh tokens
- [ ] Add profile management
- [ ] Add 2FA support
- [ ] Add audit logging
- [ ] Add dashboard admin management
