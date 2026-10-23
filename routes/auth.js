import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET doit être configuré dans Render avec au moins 32 caractères.');
}

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
        htmlContent: `<div style="font-family:Arial;padding:24px"><h2>Félicitations ${user.nom_artiste} !</h2><p>Votre profil a été validé.</p><p><a href="https://art-zedmo-marketplace.onrender.com" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Accéder à ART-ZEDMO</a></p></div>`
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

// ✅ CORRIGÉ - On ajoute adresseReception + FORFAITS
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
    adresseReception: user.adresseReception,
    // FORFAITS
    forfait: user.forfait || 'gratuit',
    limiteOeuvres: user.limiteOeuvres ?? 5,
    limiteNFT: user.limiteNFT ?? 3,
    forfaitExpireAt: user.forfaitExpireAt || null,
    forfaitPrixUSD: user.forfaitPrixUSD ?? 0,
    forfaitPrixFCFA: user.forfaitPrixFCFA ?? 0,
    totalOeuvresPubliees: user.totalOeuvresPubliees ?? 0,
    totalNFTPublies: user.totalNFTPublies ?? 0,
    createdAt: user.createdAt
  };
}

function createToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, { algorithm: 'HS256', expiresIn: user.role === 'admin' ? '8h' : '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { nom, nom_artiste, whatsapp, email, password, ville, role, adresseReception } = req.body;
    if (typeof nom !== 'string' || typeof nom_artiste !== 'string' || typeof whatsapp !== 'string' || typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Les informations d’inscription sont invalides.' });
    
    const nomNettoye = nom.trim(); 
    const artisteNettoye = nom_artiste.trim(); 
    const whatsappNettoye = whatsapp.trim(); 
    const emailNettoye = email.trim().toLowerCase();
    const adresseNettoyee = typeof adresseReception === 'string' ? adresseReception.trim() : '';

    if (!nomNettoye || !artisteNettoye || !whatsappNettoye || !emailNettoye || !password) return res.status(400).json({ error: 'Nom complet, nom d’artiste, WhatsApp, e-mail et mot de passe obligatoires.' });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Le mot de passe doit contenir entre 10 et 128 caractères.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNettoye)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });

    const roleAutorise = ['artiste', 'acheteur'].includes(role) ? role : 'artiste';

    if (roleAutorise === 'artiste' && (!adresseNettoyee || adresseNettoyee.length < 8)) {
      return res.status(400).json({ error: 'Adresse de réception obligatoire : USDT TRC20 / Pi Network / MTN Moov (+2290196587303 / TFXZ... / GAF62...)' });
    }

    const existe = await User.findOne({ $or: [{ whatsapp: whatsappNettoye }, { email: emailNettoye }] }).select('_id');
    if (existe) return res.status(409).json({ error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.' });
    
    const villeNettoyee = typeof ville === 'string' && ville.trim() ? ville.trim().slice(0, 100) : 'Abomey-Calavi';
    
    const user = await User.create({ 
      nom: nomNettoye, 
      nom_artiste: artisteNettoye, 
      whatsapp: whatsappNettoye, 
      email: emailNettoye, 
      password, 
      ville: villeNettoyee, 
      role: roleAutorise, 
      adresseReception: adresseNettoyee,
      statut: 'en_attente', 
      estVerifie: false,
      forfait: 'gratuit',
      limiteOeuvres: 5,
      limiteNFT: 3,
      forfaitPrixUSD: 0,
      forfaitPrixFCFA: 0
    });
    
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

// =================================================
// FORFAITS ART-ZEDMO - TARIFS
// =================================================
router.get('/forfaits/list', async (req, res) => {
  return res.json({
    success: true,
    forfaits: [
      { id: 'gratuit', nom: 'Gratuit', prixUSD: 0, prixFCFA: 0, limiteOeuvres: 5, limiteNFT: 3, description: '5 œuvres + 3 NFT gratuits' },
      { id: 'pro', nom: 'PRO', prixUSD: 7, prixFCFA: 4200, limiteOeuvres: 10, limiteNFT: 10, description: 'Jusqu’à 10 œuvres, 10 NFT' },
      { id: 'galerie_privee', nom: 'Galerie Privée', prixUSD: 50, prixFCFA: 30000, limiteOeuvres: 9999, limiteNFT: 9999, description: '50 œuvres minimum, illimité, page privée. Achetable par tous même avec 0 œuvre' }
    ]
  });
});

// =================================================
// ACHETER FORFAIT - 7 USD PRO / 50 USD GALERIE PRIVEE
// =================================================
router.post('/forfait/acheter', authenticateToken, async (req, res, next) => {
  try {
    const { forfait } = req.body;
    if (!['pro','galerie_privee'].includes(forfait)) return res.status(400).json({ error: 'Forfait invalide. Choisis pro ou galerie_privee' });
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    
    if (forfait === 'pro') {
      user.forfait = 'pro';
      user.limiteOeuvres = 10;
      user.limiteNFT = 10;
      user.forfaitPrixUSD = 7;
      user.forfaitPrixFCFA = 4200;
      user.forfaitExpireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (forfait === 'galerie_privee') {
      // GALERIE PRIVEE achetable par tous même si 0 œuvre
      user.forfait = 'galerie_privee';
      user.limiteOeuvres = 9999;
      user.limiteNFT = 9999;
      user.forfaitPrixUSD = 50;
      user.forfaitPrixFCFA = 30000;
      user.forfaitExpireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    await user.save();
    return res.json({ success: true, message: `Forfait ${forfait} activé. ${forfait === 'pro' ? '10 œuvres pour 7 USD (4.200 FCFA)' : 'Illimité 50+ œuvres pour 50 USD (30.000 FCFA)'}`, user: publicUser(user) });
  } catch (e) { next(e); }
});

export default router;
