import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'zedmo_secret', { expiresIn: '30d' });
}

// REGISTER AUTO-VALIDE
router.post('/register', async (req, res) => {
  try {
    const { nom, nom_artiste, whatsapp, email, ville, role, adresseReception, password } = req.body;
    if (!nom || !whatsapp || !password) return res.status(400).json({ error: 'Nom, whatsapp, password requis' });
    if (role === 'artiste' && !adresseReception) return res.status(400).json({ error: 'Adresse reception obligatoire artiste' });

    const exists = await User.findOne({ $or: [{ whatsapp }, ...(email ? [{ email }] : [])] });
    if (exists) return res.status(400).json({ error: 'WhatsApp ou email deja utilise' });

    const user = await User.create({
      nom,
      nom_artiste,
      whatsapp,
      email,
      ville,
      role: role || 'artiste',
      adresseReception,
      password,
      statut: 'valide',
      forfait: 'gratuit',
      forfaitStatut: 'valide',
      limiteOeuvres: 5,
      limiteNFT: 3
    });

    const token = signToken(user);
    res.json({ message: 'Compte cree et valide auto', token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { identifiant, password } = req.body;
    const user = await User.findOne({ $or: [{ whatsapp: identifiant }, { email: identifiant }, { nom: identifiant }] });
    if (!user) return res.status(400).json({ error: 'Utilisateur introuvable' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });
    const token = signToken(user);
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ user });
});

// FORGOT PASSWORD
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'Si email existe, lien envoye' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpire = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'https://art-zedmo-marketplace.onrender.com'}/reset-password.html?token=${token}`;

    if (process.env.BREVO_API_KEY) {
      try {
        const brevo = await import('@getbrevo/brevo');
        const api = new brevo.TransactionalEmailsApi();
        api.setApiKey(0, process.env.BREVO_API_KEY);
        await api.sendTransacEmail({
          sender: { email: process.env.BREVO_SENDER || 'noreply@art-zedmo.com', name: 'ART-ZEDMO' },
          to: [{ email: user.email }],
          subject: 'Reinitialisation mot de passe - ART-ZEDMO',
          htmlContent: `<p>Clique pour reset: <a href="${resetUrl}">${resetUrl}</a> - expire 1h</p>`
        });
      } catch (err) {
        console.log('Brevo error', err.message);
      }
    }

    console.log('RESET LINK:', resetUrl);
    res.json({ success: true, message: 'Lien envoye', resetUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// RESET PASSWORD
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });
    if (password.length < 10) return res.status(400).json({ error: '10 caracteres min' });

    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Token invalide ou expire' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Mot de passe change' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ACHAT FORFAIT - VERSION CORRIGEE SANS SYNTAX ERROR
router.post('/forfaits/acheter', authMiddleware, async (req, res) => {
  try {
    const { type, preuve, forfait } = req.body;
    const finalType = type || forfait;
    if (!finalType) return res.status(400).json({ error: 'Type forfait requis' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User introuvable' });

    if (finalType === 'pro') {
      user.forfait = 'pro';
      user.forfaitProStatut = 'en_attente';
      user.forfaitProPreuve = preuve;
    } else if (finalType === 'galerie_privee') {
      user.forfait = 'galerie_privee';
      user.forfaitPriveeStatut = 'en_attente';
      user.forfaitPriveePreuve = preuve;
      user.forfaitPriveeExpire = null;
    }

    await user.save();
    res.json({ success: true, message: 'Preuve forfait envoyee - en attente admin', user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
