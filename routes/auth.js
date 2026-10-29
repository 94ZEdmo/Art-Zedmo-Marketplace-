import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth requise' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET, { algorithms: ['HS256'] });
    const rawId = decoded.id || decoded._id || decoded.userId;
    req.userId = String(rawId);
    next();
  } catch { return res.status(401).json({ error: 'Jeton invalide' }); }
}
function requireAdmin(req, res, next) {
  User.findById(req.userId).then(u => {
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = u;
    next();
  });
}

// ✅ ROUTE ADMIN - TOUS LES COMPTES (C'EST CELLE QUI MANQUE)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, comptes: users, users });
});

router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, comptes: users, users });
});

router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, comptes: users, users });
});

// Login / Register restent pareils en dessous...
// ... garde ton code existant pour POST /register et POST /login

export default router;
