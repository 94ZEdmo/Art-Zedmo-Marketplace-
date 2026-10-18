import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET doit être configuré dans Render avec au moins 32 caractères.');
}

// EMAIL BREVO - PLUS DE TIMEOUT
async function sendValidationEmail(user) {
  if (!user.email || !process.env.BREVO_API_KEY) {
    console.log('Email non envoyé : BREVO_API_KEY manquante');
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: "ART-ZEDMO", email: "artzedmo@gmail.com" },
        to: [{ email: user.email }],
        subject: 'Votre profil ART-ZEDMO a été validé',
        htmlContent: `<div style="font-family:Arial;padding:24px"><h2>Félicitations ${user.nom_artiste} !</h2><p>Votre profil a été validé.</p><p><a href="https://art-zedmo.onrender.com" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Accéder à ART-ZEDMO</a></p></div>`
      })
    });
    const data = await res.json();
    console.log('Email Brevo envoyé:', data.messageId || data);
    return true;
  } catch (e) {
    console.error('Erreur Brevo:', e.message);
    return false;
  }
}

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const token = authorization.slice(7);
  try {
    req.auth = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!req.auth.id) return res.status(401).json({ error: 'Jeton invalide.' });
    next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.auth.id)) return res.status(401).json({ error: 'Identifiant utilisateur invalide.' });
    const admin = await User.findById(req.auth.id).select('_id role statut');
    if (!admin || admin.role !== 'admin' || admin.statut !== 'valide') return res.status(403).json({ error: 'Accès réservé à un administrateur autorisé.' });
    req.admin = admin;
    next();
  } catch (error) { next(error); }
}

function publicUser(user) {
  return {
    _id: user._id, nom: user.nom, nom_artiste: user.nom_artiste, whatsapp: user.whatsapp, email: user.email,
    role: user.role, ville: user.ville, bio: user.bio, avatar: user.avatar, statut: user.statut,
    estVerifie: user.estVerifie, totalOeuvres: user.totalOeuvres, totalVentes: user.totalVentes,
    totalVotesRecus: user.totalVotesRecus, createdAt: user.createdAt
  };
}

function createToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, { algorithm: 'HS256', expiresIn: user.role === 'admin' ? '8h' : '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { nom, nom_artiste, whatsapp, email, password, ville, role } = req.body;
    if (typeof nom !== 'string' || typeof nom_artiste !== 'string' || typeof whatsapp !== 'string' || typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Les informations d’inscription sont invalides.' });
    const nomNettoye = nom.trim(); const artisteNettoye = nom_artiste.trim(); const whatsappNettoye = whatsapp.trim(); const emailNettoye = email.trim().toLowerCase();
    if (!nomNettoye || !artisteNettoye || !whatsappNettoye || !emailNettoye || !password) return res.status(400).json({ error: 'Nom complet, nom d’artiste, WhatsApp, e-mail et mot de passe obligatoires.' });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Le mot de passe doit contenir entre 10 et 128 caractères.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNettoye)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    const existe = await User.findOne({ $or: [{ whatsapp: whatsappNettoye }, { email: emailNettoye }] }).select('_id');
    if (existe) return res.status(409).json({ error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.' });
    const roleAutorise = ['artiste', 'acheteur'].includes(role) ? role : 'artiste';
    const villeNettoyee = typeof ville === 'string' && ville.trim() ? ville.trim().slice(0, 100) : 'Abomey-Calavi';
    const user = await User.create({ nom: nomNettoye, nom_artiste: artisteNettoye, whatsapp: whatsappNettoye, email: emailNettoye, password, ville: villeNettoyee, role: roleAutorise, statut: 'en_attente', estVerifie: false });
    return res.status(201).json({ success: true, message: 'Inscription réussie. Votre compte attend la validation d’un administrateur.', user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { whatsapp, email, identifiant, password } = req.body;
    if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Identifiant et mot de passe obligatoires.' });
    const loginId = String(identifiant || email || whatsapp || '').trim();
    const conditions = [{ whatsapp: loginId }];
    if (loginId.includes('@')) conditions.push({ email: loginId.toLowerCase() });
    const user = await User.findOne({ $or: conditions }).select('+password');
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Identifiants invalides.' });
    if (user.statut === 'en_attente') return res.status(403).json({ error: 'Votre profil est en attente de validation.' });
    if (user.statut === 'refuse') return res.status(403).json({ error: 'Votre profil a été refusé.' });
    if (user.statut !== 'valide') return res.status(403).json({ error: 'Ce compte n’est pas autorisé à se connecter.' });
    const token = createToken(user);
    return res.json({ success: true, token, user: publicUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.statut !== 'valide') return res.status(403).json({ error: 'Votre compte n’est plus autorisé.' });
    return res.json(publicUser(user));
  } catch (error) { next(error); }
});

router.get('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(100).lean();
    return res.json(users.map(user => publicUser(user)));
  } catch (error) { next(error); }
});

async function validateUserHandler(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    user.statut = 'valide'; user.estVerifie = true; await user.save();
    const emailSent = await sendValidationEmail(user);
    return res.json({ success: true, message: 'Compte validé.', emailSent, user: publicUser(user) });
  } catch (error) { next(error); }
}
router.put('/:id/valider', authenticateToken, requireAdmin, validateUserHandler);
router.put('/users/:id/valider', authenticateToken, requireAdmin, validateUserHandler);

router.put('/:id/refuser', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    user.statut = 'refuse'; user.estVerifie = false; await user.save();
    return res.json({ success: true, message: 'Compte refusé.', user: publicUser(user) });
  } catch (error) { next(error); }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.auth.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    await User.deleteOne({ _id: req.params.id });
    return res.json({ success: true, message: 'Compte supprimé.' });
  } catch (error) { next(error); }
});

export default router;
