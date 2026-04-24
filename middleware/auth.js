const db = require('../database');
const jwt = require('jsonwebtoken');

const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    const token = authHeader.split(' ')[1];
    
    try {
        // Support legacy sessionToken check
        if (token.startsWith('token-')) {
            const row = await db.get("SELECT * FROM users WHERE sessionToken = ?", [token]);
            if (!row) return res.status(401).json({ error: "Session expired or invalid" });
            req.user = row;
            return next();
        }

        // Support JWT (Planned upgrade)
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'it-guy-secret-key-2024');
            const row = await db.get("SELECT * FROM users WHERE uid = ?", [decoded.uid]);
            if (!row) return res.status(401).json({ error: "User not found" });
            req.user = row;
            next();
        } catch (jwtErr) {
            return res.status(401).json({ error: "Invalid token" });
        }
    } catch (err) {
        res.status(500).json({ error: "Database error verifying session" });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Forbidden. Admin access required." });
    }
};

module.exports = { requireAuth, requireAdmin };
