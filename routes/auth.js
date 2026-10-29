import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'zedmo_secret_2026';

function publicUser(user) {
  return {
    _id: user._id, nom: user.nom, nom_artiste: user.nom_artiste,
    whatsapp: user.whatsapp, email: user.email, ville: user.ville,
    role: user.role, statut: user.statut, adresseReception: user.adresseReception,
    forfait: user.forfait, forfaitStatut: user.forfaitStatut,
    forfaitProStatut: user.forfaitProStatut, forfaitPriveeStatut: user.forfaitPriveeStatut,
    forfaitExpireAt: user.forfaitExpireAt, forfaitProExpire: user.forfaitProExpire,
    forfaitPriveeExpire: user.forfaitPriveeExpire, limiteOeuvres: user.limiteOeuvres, limiteNFT: user.limiteNFT,
  };
}

async function sendValidationEmail(user) {
  if (!user.email || !process.env.BREVO_API_KEY) return;
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: "ART-ZEDMO", email: "artzedmo@gmail.com" },
        to: [{ email: user.email }],
        subject: 'ART-ZEDMO - Compte validé',
        htmlContent: `<div style="font-family:Arial;padding:24px"><h2>Bienvenue ${user.nom_artiste || user.nom}</h2><p>Ton compte ART-ZEDMO est validé !</p></div>`
      })
    });
  } catch(e){ console.log('Email validation error', e.message); }
}

function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try { const decoded = jwt.verify(token, JWT_SECRET); req.user = decoded; next(); }
  catch { return res.status(401).json({ error: 'Token invalide' }); }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  next();
}

router.post('/register', async (req, res, next) => {
  try {
    const { nom, nom_artiste, whatsapp, email, ville, role, adresseReception, password } = req.body;
    if (!nom || !whatsapp || !password) return res.status(400).json({ error: 'Nom, WhatsApp et mot de passe requis' });
    const existing = await User.findOne({ $or: [{ whatsapp: whatsapp.trim() }, ...(email ? [{ email: email.toLowerCase() }] : [])] });
    if (existing) return res.status(400).json({ error: 'WhatsApp ou Email déjà utilisé' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      nom: nom.trim(), nom_artiste: (nom_artiste || '').trim(),
      whatsapp: whatsapp.trim(), email: (email || '').toLowerCase().trim(),
      ville: (ville || '').trim(), role: role || 'artiste',
      adresseReception: (adresseReception || '').trim(),
      password: hashed, statut: 'valide', forfait: 'gratuit',
      forfaitStatut: 'valide', limiteOeuvres: 5, limiteNFT: 3,
    });
    await user.save();
    const token = jwt.sign({ _id: user._id, role: user.role, whatsapp: user.whatsapp }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, message: 'Compte créé et validé', token, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const id = String(req.body.identifiant || req.body.email || req.body.whatsapp || '').trim();
    const password = String(req.body.password || '');
    if (!id || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    const cond = [{ whatsapp: id }];
    if (id.includes('@')) cond.push({ email: id.toLowerCase() });
    const user = await User.findOne({ $or: cond }).select('+password');
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });
    if (!user.password) return res.status(500).json({ error: 'Ancien compte - fais mot de passe oublié' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });
    const token = jwt.sign({ _id: user._id, role: user.role, whatsapp: user.whatsapp }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: publicUser(user) });
  } catch (e) { console.error('LOGIN ERROR', e); next(e); }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User introuvable' });
    res.json({ success: true, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/forfaits/list', (req, res) => {
  res.json([
    { id: 'gratuit', nom: 'Gratuit', prix: 0, limite: 5 },
    { id: 'pro', nom: 'PRO 7$', prix: 7, limite: 10 },
    { id: 'galerie_privee', nom: 'Galerie Privée 50$', prix: 50, limite: 50 },
  ]);
});

async function acheterForfaitHandler(req, res, next) {
  try {
    const userId = req.user._id; const { type, forfait } = req.body;
    const typeFinal = (type || forfait || '').toLowerCase();
    if (!['pro', 'galerie_privee'].includes(typeFinal)) return res.status(400).json({ error: 'Type forfait invalide' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User introuvable' });
    const expire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (typeFinal === 'pro') { user.forfaitProStatut = 'valide'; user.forfaitProExpire = expire; user.limiteOeuvres = 10; user.limiteNFT = 10; }
    else { user.forfaitPriveeStatut = 'valide'; user.forfaitPriveeExpire = expire; user.forfait = 'galerie_privee'; user.forfaitStatut = 'valide'; user.forfaitExpireAt = expire; user.limiteOeuvres = 50; user.limiteNFT = 50; }
    await user.save();
    return res.json({ success: true, message: 'Forfait activé pour 1 mois', user: publicUser(user) });
  } catch (e) { next(e); }
}
router.post('/forfaits/acheter', authenticateToken, acheterForfaitHandler);
router.post('/acheter-forfait', authenticateToken, acheterForfaitHandler);

router.post('/forfaits/valider', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { userId, type, forfait } = req.body;
    const typeFinal = (type || forfait || '').toLowerCase();
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User introuvable' });
    const expire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (typeFinal === 'pro') { user.forfaitProStatut = 'valide'; user.forfaitProExpire = expire; }
    else { user.forfaitPriveeStatut = 'valide'; user.forfaitPriveeExpire = expire; }
    user.forfaitStatut = 'valide'; user.forfaitExpireAt = expire;
    await user.save(); await sendValidationEmail(user);
    res.json({ success: true, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const id = String(req.body.identifiant || req.body.email || req.body.whatsapp || '').trim();
    if (!id) return res.status(400).json({ error: 'WhatsApp ou Email requis.' });
    const conditions = [{ whatsapp: id }];
    if (id.includes('@')) conditions.push({ email: id.toLowerCase() });
    const user = await User.findOne({ $or: conditions });
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const resetLink = `https://art-zedmo-marketplace.onrender.com/reset-password.html?token=${resetToken}&id=${user._id}`;
    if (user.email && process.env.BREVO_API_KEY) {
      try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: "ART-ZEDMO", email: "artzedmo@gmail.com" },
            to: [{ email: user.email }],
            subject: 'Réinitialisation mot de passe ART-ZEDMO',
            htmlContent: `<div style="font-family:Arial;padding:24px"><h2>Réinitialisation</h2><p>Clique pour changer ton mot de passe (valable 1h) :</p><p><a href="${resetLink}" style="background:#000;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block">Changer mon mot de passe</a></p><p>Lien: ${resetLink}</p></div>`
          })
        });
      } catch (err) { console.log('Brevo error', err.message); }
    }
    console.log(`RESET LINK ${user.email}: ${resetLink}`);
    return res.json({ success: true, message: 'Lien envoyé par email (valable 1h)', resetLink, resetToken, userId: user._id });
  } catch (e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const token = req.body.token; const userId = req.body.userId || req.body.id;
    const newPassword = req.body.newPassword || req.body.password;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
    if (newPassword.length < 10) return res.status(400).json({ error: '10 caractères minimum' });
    let user;
    if (userId) { 
      user = await User.findOne({ _id: userId, resetPasswordToken: token, resetPasswordExpire: { $gt: new Date() } }).select('+password +resetPasswordToken +resetPasswordExpire'); 
    } else { 
      user = await User.findOne({ resetPasswordToken: token, resetPasswordExpire: { $gt: new Date() } }).select('+password +resetPasswordToken +resetPasswordExpire'); 
    }
    if (!user) return res.status(400).json({ error: 'Lien expiré ou invalide' });
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined; user.resetPasswordExpire = undefined;
    await user.save();
    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (e) { next(e); }
});

export default router;
