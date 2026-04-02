require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.disable('x-powered-by'); // Hide Express signature for security
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
// server.js
const DYNAMIC_EFOOTBALL_COMMUNITY_origins = [
  'http://localhost:3000', // if you use this
  'http://localhost:5000', // optional
  'http://127.0.0.1:8080',
  'http://127.0.0.1:59135',
  'https://dynamicfootball.netlify.app',
  'http://192.168.137.1:8080'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests
    if (DYNAMIC_EFOOTBALL_COMMUNITY_origins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
// Routes
const adminRoutes = require('./routes/admin');
const eventsRoutes = require('./routes/events');
const contendersRoutes = require('./routes/contenders');
const votesRoutes = require('./routes/votes');
const botRoutes = require('./routes/bot');

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/contenders', contendersRoutes);
app.use('/api/votes', votesRoutes);
app.use('/api/bot', botRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'DYNAMIC EFOOTBALL COMMUNITY API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            admin_login: 'POST /api/admin/login',
            admin_verify: 'GET /api/admin/verify'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
});
console.log(`Server is running on port ${PORT}`);   
module.exports = app;
