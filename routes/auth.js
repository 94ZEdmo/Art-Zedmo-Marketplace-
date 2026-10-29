import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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

// ✅ LOGIN FIXÉ (le seul bug était le select:false)
router.post('/login', async (req,res)=>{
  try{
    const { identifiant, email, whatsapp, password } = req.body;
    const loginId = String(identifiant || email || whatsapp || '').trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Identifiant + mdp requis' });

    const user = await User.findOne({
      $or: [
        { email: loginId.toLowerCase() },
        { whatsapp: loginId },
        { email: loginId },
        { whatsapp: loginId.toLowerCase() },
        { email: { $regex: `^${loginId}$`, $options: 'i' } }
      ]
    }).select('+password');

    if (!user) return res.status(404).json({ error: 'Compte introuvable: ' + loginId });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    if (user.statut && user.statut !== 'valide' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Compte en attente de validation' });
    }

    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    res.json({ success:true, token, user: user.toJSON() });
  }catch(e){ 
    console.error('LOGIN CRASH:', e.message);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message }); 
  }
});

// ✅ INSCRIPTION - VALIDATION AUTOMATIQUE (ton travail gardé)
router.post('/register', async (req,res,next)=>{
  try{
    const { nom, nom_artiste, whatsapp, email, password, ville } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    const idCheck = String(whatsapp || email || '').trim();
    if (!idCheck) return res.status(400).json({ error: 'WhatsApp ou email requis' });

    const existing = await User.findOne({ $or: [{ whatsapp: idCheck }, { email: idCheck.toLowerCase() }, { email: idCheck }] });
    if (existing) return res.status(400).json({ error: 'Compte déjà existant' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      nom: nom || nom_artiste || idCheck,
      nom_artiste: nom_artiste || nom || idCheck,
      whatsapp: whatsapp || idCheck,
      email: email ? email.toLowerCase() : (idCheck.includes('@') ? idCheck.toLowerCase() : undefined),
      password: hash,
      ville: ville || 'Abomey-Calavi',
      role: 'artiste',
      statut: 'valide', // ✅ AUTO VALIDÉ
      estVerifie: true, // ✅ AUTO VALIDÉ
      forfait: 'gratuit',
      limiteOeuvres: 5,
      limiteNFT: 3
    });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    res.status(201).json({ success:true, token, user: user.toJSON(), message: 'Compte créé et validé automatiquement' });
  }catch(e){ next(e); }
});

// ✅ MOT DE PASSE OUBLIÉ - TON TRAVAIL GARDÉ
router.post('/forgot-password', async (req,res,next)=>{
  try{
    const { email, whatsapp, identifiant } = req.body;
    const id = String(email || whatsapp || identifiant || '').trim().toLowerCase();
    if(!id) return res.status(400).json({error:'Email ou WhatsApp requis'});

    const user = await User.findOne({ $or: [{email:id}, {whatsapp:id}, {email: id.toLowerCase()}] });
    if(!user) return res.status(404).json({error:'Compte introuvable'});

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 60*60*1000); // 1h
    await user.save();

    // Ici ton envoi d'email - si tu as nodemailer configuré
    // Pour l'instant on renvoie le token (tu peux brancher ton service email)
    console.log(`RESET TOKEN pour ${user.email}: ${resetToken}`);

    // Si tu as EMAIL_SERVICE, décommente :
    // await sendEmail({ to: user.email, subject: 'Réinitialisation ART-ZEDMO', text: `Token: ${resetToken}` });

    res.json({ success:true, message: 'Lien de réinitialisation envoyé (vérifie email)', resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined });
  }catch(e){ next(e); }
});

router.post('/reset-password', async (req,res,next)=>{
  try{
    const { token, password, newPassword } = req.body;
    const newPass = newPassword || password;
    if(!token || !newPass) return res.status(400).json({error:'Token + nouveau mot de passe requis'});

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: new Date() } }).select('+password +resetPasswordToken');

    if(!user) return res.status(400).json({error:'Token invalide ou expiré'});

    user.password = await bcrypt.hash(newPass, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();

    res.json({ success:true, message: 'Mot de passe réinitialisé avec succès' });
  }catch(e){ next(e); }
});

router.get('/me', authenticateToken, async (req,res,next)=>{
  try{ const user = await User.findById(req.userId).lean(); if(!user) return res.status(404).json({error:'Introuvable'}); res.json({success:true, user}); }catch(e){next(e)}
});

router.put('/:id/valider', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ const u = await User.findByIdAndUpdate(req.params.id, { statut: 'valide', estVerifie: true }, { new:true }); res.json({ success:true, user: u }); }catch(e){next(e)}
});
router.put('/:id/refuser', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ const u = await User.findByIdAndUpdate(req.params.id, { statut: 'refuse' }, { new:true }); res.json({ success:true, user: u }); }catch(e){next(e)}
});
router.delete('/:id', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{ await User.findByIdAndDelete(req.params.id); res.json({ success:true }); }catch(e){next(e)}
});

export default router;
