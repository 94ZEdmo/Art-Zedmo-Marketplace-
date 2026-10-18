import express from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = express.Router();

// =====================================================
// 1. CONFIGURATION
// =====================================================

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET doit être configuré dans Render avec au moins 32 caractères.'
  );
}

// EMAIL UNIFIÉ - compatible SMTP_* et EMAIL_* + anti-timeout Render
let transporter = null;
function getMailer(){
  if(transporter) return transporter;
  
  const host = process.env.SMTP_HOST || (process.env.EMAIL_USER ? 'smtp.gmail.com' : null);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const port = Number(process.env.SMTP_PORT || 587);

  if(!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  return transporter;
}

// =====================================================
// 2. AUTHENTIFICATION JWT
// =====================================================

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const token = authorization.slice(7);
  try {
    req.auth = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!req.auth.id) {
      return res.status(401).json({ error: 'Jeton invalide.' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }
}

// =====================================================
// 3. AUTORISATION ADMINISTRATEUR
// =====================================================

async function requireAdmin(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.auth.id)) {
      return res.status(401).json({ error: 'Identifiant utilisateur invalide.' });
    }
    const admin = await User.findById(req.auth.id).select('_id role statut');
    if (!admin || admin.role !== 'admin' || admin.statut !== 'valide') {
      return res.status(403).json({ error: 'Accès réservé à un administrateur autorisé.' });
    }
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

// =====================================================
// 4. UTILITAIRES
// =====================================================

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[character];
  });
}

function publicUser(user) {
  return {
    _id: user._id,
    nom: user.nom,
    nom_artiste: user.nom_artiste,
    whatsapp: user.whatsapp,
    email: user.email,
    role: user.role,
    ville: user.ville,
    bio: user.bio,
    avatar: user.avatar,
    statut: user.statut,
    estVerifie: user.estVerifie,
    totalOeuvres: user.totalOeuvres,
    totalVentes: user.totalVentes,
    totalVotesRecus: user.totalVotesRecus,
    createdAt: user.createdAt
  };
}

function createToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: user.role === 'admin' ? '8h' : '7d' }
  );
}

async function sendValidationEmail(user) {
  const mailer = getMailer();
  if (!mailer || !user.email) {
    console.log('E-mail non envoyé : configuration e-mail incomplète.');
    return false;
  }
  const nomArtiste = escapeHtml(user.nom_artiste);
  const appUrl = (process.env.FRONTEND_URL || 'https://art-zedmo.onrender.com').replace(/\/+$/, '');
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;

  try {
    await mailer.sendMail({
      from: `"ART-ZEDMO" <${fromEmail}>`,
      to: user.email,
      subject: 'Votre profil ART-ZEDMO a été validé',
      html: `
        <div style="font-family:Arial,sans-serif;padding:24px">
          <h2>Félicitations ${nomArtiste} !</h2>
          <p>Votre profil ART-ZEDMO a été validé par notre équipe.</p>
          <p>Vous pouvez maintenant vous connecter à votre compte.</p>
          <p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Accéder à ART-ZEDMO</a></p>
          <p>L'équipe ART-ZEDMO MARKETPLACE</p>
        </div>
      `
    });
    console.log(`E-mail de validation envoyé à ${user.email}`);
    return true;
  } catch (error) {
    console.error('Erreur e-mail :', error.message);
    return false;
  }
}

// =====================================================
// 5. INSCRIPTION
// =====================================================

router.post('/register', async (req, res, next) => {
  try {
    const { nom, nom_artiste, whatsapp, email, password, ville, role } = req.body;
    if (typeof nom !== 'string' || typeof nom_artiste !== 'string' || typeof whatsapp !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Les informations d’inscription sont invalides.' });
    }
    const nomNettoye = nom.trim();
    const artisteNettoye = nom_artiste.trim();
    const whatsappNettoye = whatsapp.trim();
    const emailNettoye = email.trim().toLowerCase();
    if (!nomNettoye || !artisteNettoye || !whatsappNettoye || !emailNettoye || !password) {
      return res.status(400).json({ error: 'Nom complet, nom d’artiste, WhatsApp, e-mail et mot de passe obligatoires.' });
    }
    if (nomNettoye.length > 100 || artisteNettoye.length > 100) return res.status(400).json({ error: 'Les noms ne doivent pas dépasser 100 caractères.' });
    if (whatsappNettoye.length < 6 || whatsappNettoye.length > 25) return res.status(400).json({ error: 'Le numéro WhatsApp est invalide.' });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Le mot de passe doit contenir entre 10 et 128 caractères.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNettoye)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });

    const existe = await User.findOne({ $or: [{ whatsapp: whatsappNettoye }, { email: emailNettoye }] }).select('_id');
    if (existe) return res.status(409).json({ error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.' });

    const roleAutorise = ['artiste', 'acheteur'].includes(role) ? role : 'artiste';
    const villeNettoyee = typeof ville === 'string' && ville.trim() ? ville.trim().slice(0, 100) : 'Abomey-Calavi';

    const user = await User.create({
      nom: nomNettoye, nom_artiste: artisteNettoye, whatsapp: whatsappNettoye, email: emailNettoye,
      password, ville: villeNettoyee, role: roleAutorise, statut: 'en_attente', estVerifie: false
    });

    return res.status(201).json({
      success: true,
      message: 'Inscription réussie. Votre compte attend la validation d’un administrateur.',
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.' });
    next(error);
  }
});

// =====================================================
// 6. CONNEXION
// =====================================================

router.post('/login', async (req, res, next) => {
  try {
    const { whatsapp, email, identifiant, password } = req.body;
    if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Identifiant et mot de passe obligatoires.' });
    const loginId = String(identifiant || email || whatsapp || '').trim();
    if (!loginId || loginId.length > 254) return res.status(400).json({ error: 'Identifiant invalide.' });
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

// =====================================================
// 7. PROFIL CONNECTÉ
// =====================================================

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.auth.id)) return res.status(401).json({ error: 'Identifiant utilisateur invalide.' });
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.statut !== 'valide') return res.status(403).json({ error: 'Votre compte n’est plus autorisé.' });
    return res.json(publicUser(user));
  } catch (error) { next(error); }
});

// =====================================================
// 8. PROFIL PAR IDENTIFIANT
// =====================================================

router.get('/me/:id', authenticateToken, async (req, res, next) => {
  try {
    const requestedId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(requestedId)) return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
    const ownProfile = req.auth.id === requestedId;
    if (!ownProfile) {
      const requester = await User.findById(req.auth.id).select('_id role statut');
      if (!requester || requester.role !== 'admin' || requester.statut !== 'valide') return res.status(403).json({ error: 'Vous ne pouvez pas consulter ce profil.' });
    }
    const user = await User.findById(requestedId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.statut !== 'valide' && !ownProfile) return res.status(403).json({ error: 'Ce compte n’est pas autorisé.' });
    return res.json(publicUser(user));
  } catch (error) { next(error); }
});

// =====================================================
// 9. LISTE DES UTILISATEURS
// =====================================================

router.get('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(100).lean();
    return res.json(users.map(user => ({
      _id: user._id, nom: user.nom, nom_artiste: user.nom_artiste, whatsapp: user.whatsapp, email: user.email,
      role: user.role, ville: user.ville, statut: user.statut, estVerifie: user.estVerifie,
      totalOeuvres: user.totalOeuvres, totalVentes: user.totalVentes, totalVotesRecus: user.totalVotesRecus, createdAt: user.createdAt
    })));
  } catch (error) { next(error); }
});

// =====================================================
// 10. VALIDATION D'UN COMPTE
// =====================================================

async function validateUserHandler(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cette route ne permet pas de modifier le statut d’un administrateur.' });
    user.statut = 'valide';
    user.estVerifie = true;
    await user.save();
    const emailSent = await sendValidationEmail(user);
    return res.json({ success: true, message: 'Compte validé.', emailSent, user: publicUser(user) });
  } catch (error) { next(error); }
}

router.put('/:id/valider', authenticateToken, requireAdmin, validateUserHandler);
router.put('/users/:id/valider', authenticateToken, requireAdmin, validateUserHandler);

// =====================================================
// 11. REFUSER UN COMPTE
// =====================================================

router.put('/:id/refuser', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Impossible de refuser un compte administrateur depuis cette route.' });
    user.statut = 'refuse';
    user.estVerifie = false;
    await user.save();
    return res.json({ success: true, message: 'Compte refusé.', user: publicUser(user) });
  } catch (error) { next(error); }
});

// =====================================================
// 12. SUPPRESSION D'UN COMPTE
// =====================================================

async function deleteUserHandler(req, res, next) {
  try {
    const requestedId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(requestedId)) return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
    if (requestedId === req.auth.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte administrateur.' });
    const user = await User.findById(requestedId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'La suppression d’un administrateur est interdite par cette route.' });
    await User.deleteOne({ _id: user._id });
    return res.json({ success: true, message: 'Compte supprimé.' });
  } catch (error) { next(error); }
}

router.delete('/:id', authenticateToken, requireAdmin, deleteUserHandler);
router.delete('/users/:id', authenticateToken, requireAdmin, deleteUserHandler);

export default router;
