import express from 'express';
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
    next();
  } catch(e){ next(e); }
}

// LISTE COMPTES
router.get('/', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ const users = await User.find().sort({createdAt:-1}).lean(); res.json({ success:true, comptes: users, users, total: users.length }); }catch(e){next(e)}
});
router.get('/all', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ const users = await User.find().sort({createdAt:-1}).lean(); res.json({ success:true, comptes: users, users, total: users.length }); }catch(e){next(e)}
});

// ✅ LOGIN CORRIGÉ - LE .select('+password') MANQUAIT !
router.post('/login', async (req,res,next)=>{
  try{
    const { identifiant, email, whatsapp, password } = req.body;
    const loginId = String(identifiant || email || whatsapp || '').trim().toLowerCase();
    if (!loginId || !password) return res.status(400).json({ error: 'Identifiant + mdp requis' });

    // IMPORTANT: +password car select:false dans ton modèle
    const user = await User.findOne({
      $or: [
        { email: loginId },
        { whatsapp: loginId },
        { email: loginId.toLowerCase() },
        { whatsapp: loginId.toLowerCase() }
      ]
    }).select('+password');

    if (!user) return res.status(404).json({ error: 'Compte introuvable: ' + loginId });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    const userSafe = user.toJSON();
    res.json({ success:true, token, user: userSafe });
  }catch(e){ next(e); }
});

router.post('/register', async (req,res,next)=>{
  try{
    const { nom, whatsapp, email, password } = req.body;
    const idCheck = String(whatsapp || email || '').trim();
    if(!password || password.length < 6) return res.status(400).json({error:'Mdp trop court'});
    const existing = await User.findOne({ $or: [{whatsapp:idCheck}, {email:idCheck.toLowerCase()}] });
    if(existing) return res.status(400).json({error:'Compte existe déjà'});
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      nom: nom || idCheck,
      whatsapp: idCheck,
      email: idCheck.includes('@') ? idCheck.toLowerCase() : undefined,
      password: hash,
      role:'artiste',
      statut:'valide'
    });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn:'30d' });
    res.json({success:true, token, user});
  }catch(e){ next(e); }
});

router.get('/me', authenticateToken, async (req,res,next)=>{
  try{ const user = await User.findById(req.userId).lean(); res.json({success:true, user}); }catch(e){next(e)}
});

export default router;
