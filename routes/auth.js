import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentification requise.' });
  const token = authorization.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const rawId = decoded.id || decoded._id || decoded.userId || decoded.user_id;
    if (!rawId) return res.status(401).json({ error: 'Token invalide' });
    req.userId = String(rawId);
    req.user = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Jeton expiré' }); }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin seulement' });
    req.userDoc = user;
    next();
  } catch(e){ next(e); }
}

// ✅ LISTE TOUS LES COMPTES - FIX POUR TON SCREENSHOT ADMIN
router.get('/', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const users = await User.find().sort({createdAt:-1}).lean();
    res.json({ success:true, comptes: users, users, total: users.length });
  }catch(e){next(e)}
});
router.get('/all', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const users = await User.find().sort({createdAt:-1}).lean();
    res.json({ success:true, comptes: users, users, total: users.length });
  }catch(e){next(e)}
});

// ✅ LOGIN - ACCEPTE EMAIL OU WHATSAPP OU IDENTIFIANT
router.post('/login', async (req,res,next)=>{
  try{
    const { identifiant, email, whatsapp, password } = req.body;
    const loginId = (identifiant || email || whatsapp || '').toString().trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

    // cherche par email OU whatsapp OU nom
    const user = await User.findOne({
      $or: [
        { email: loginId },
        { whatsapp: loginId },
        { email: loginId.toLowerCase() },
        { whatsapp: loginId.toLowerCase() }
      ]
    });
    if (!user) return res.status(404).json({ error: 'Compte introuvable: ' + loginId });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    if (user.statut && user.statut !== 'valide' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Compte en attente de validation' });
    }

    const token = jwt.sign({ id: user._id, role: user.role, email: user.email, whatsapp: user.whatsapp }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    res.json({ success:true, token, user, message: 'Connecté' });
  }catch(e){ next(e); }
});

// REGISTER
router.post('/register', async (req,res,next)=>{
  try{
    const { nom, nom_artiste, whatsapp, email, password, ville } = req.body;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis' });
    const idCheck = (whatsapp || email || '').toString().trim();
    if (!idCheck) return res.status(400).json({ error: 'WhatsApp ou email requis' });

    const existing = await User.findOne({ $or: [{ whatsapp: idCheck }, { email: idCheck }] });
    if (existing) return res.status(400).json({ error: 'Compte déjà existant' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      nom: nom || nom_artiste || idCheck,
      nom_artiste: nom_artiste || nom || idCheck,
      whatsapp: whatsapp || idCheck,
      email: email || (idCheck.includes('@') ? idCheck : ''),
      password: hashed,
      ville: ville || 'Abomey-Calavi',
      role: 'user',
      statut: 'valide',
      forfait: 'gratuit',
      limiteOeuvres: 5,
      limiteNFT: 3,
      totalOeuvres: 0,
      totalOeuvresPubliees: 0,
      totalNFTPublies: 0
    });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    res.status(201).json({ success:true, token, user });
  }catch(e){ next(e); }
});

router.get('/me', authenticateToken, async (req,res,next)=>{
  try{
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ success:true, user });
  }catch(e){next(e)}
});

router.put('/:id/valider', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ const u = await User.findByIdAndUpdate(req.params.id, { statut: 'valide' }, { new:true }); res.json({ success:true, user: u }); }catch(e){next(e)}
});
router.put('/:id/refuser', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ const u = await User.findByIdAndUpdate(req.params.id, { statut: 'refuse' }, { new:true }); res.json({ success:true, user: u }); }catch(e){next(e)}
});
router.delete('/:id', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ await User.findByIdAndDelete(req.params.id); res.json({ success:true }); }catch(e){next(e)}
});

export default router;
