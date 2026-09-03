const jwt = require('jsonwebtoken');

/**
 * Strict authorization boundary for newly added protected domains.
 * Existing legacy routes retain their current middleware until they can be
 * migrated deliberately.
 */
function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ success: false, error: 'Bearer token required' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, error: 'Server authentication is not configured' });
  }

  try {
    const admin = jwt.verify(match[1], process.env.JWT_SECRET);
    if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
      return res.status(403).json({ success: false, error: 'Admin permission required' });
    }
    req.admin = admin;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function requireSuperadmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Superadmin permission required' });
    }
    return next();
  });
}

module.exports = { requireAdmin, requireSuperadmin };
