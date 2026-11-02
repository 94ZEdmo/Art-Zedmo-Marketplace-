import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'zedmo_secret_dev_32_chars_minimum', { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  try {
    const { nom, whatsapp, password, email, ville, role, nom_artiste, adresseReception } = req.body;
    if (!nom || !whatsapp || !password) return res.status(400).json({ error: 'Nom, whatsapp, password requis' });
    const exists = await User.findOne({ $or: [{ whatsapp }, ...(email ? [{ email: email.toLowerCase().trim() }] : [])] });
    if (exists) return res.status(400).json({ error: 'WhatsApp ou email deja utilise' });
    const user = await User.create({ nom, whatsapp, password, email: email?.toLowerCase().trim(), ville, role: role || 'artiste', nom_artiste, adresseReception, statut: 'valide', forfait: 'gratuit' });
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { identifiant, password } = req.body;
    const user = await User.findOne({ $or: [{ whatsapp: identifiant }, { email: identifiant.toLowerCase?.() || identifiant }, { nom: identifiant }] });
    if (!user || !(await user.comparePassword(password))) return res.status(400).json({ error: 'Identifiant ou mot de passe incorrect' });
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json({ success: true, message: 'Si email existe, lien envoye' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpire = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'https://art-zedmo-marketplace.onrender.com'}/reset-password.html?token=${token}`;
    
    console.log('RESET LINK FOR', email, ':', resetUrl);

    // ENVOI AVEC artzedmo@gmail.com - VERSION FINALE QUI MARCHE
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { email: 'artzedmo@gmail.com', name: 'ART-ZEDMO' },
        to: [{ email: user.email }],
        subject: 'Reset mot de passe ART-ZEDMO',
        htmlContent: `<html><body style="font-family:Arial;background:#111;color:#fff;padding:20px"><h2 style="color:#d4af37">ART-ZEDMO - Reset mot de passe</h2><p>Clique ici, valable 1h :</p><a href="${resetUrl}" style="background:#d4af37;color:#000;padding:14px 24px;text-decoration:none;font-weight:bold;border-radius:8px;display:inline-block">Changer mon mot de passe</a><p style="margin-top:20px;color:#888">${resetUrl}</p></body></html>`
      })
    });

    const brevoData = await brevoRes.text();
    console.log('BREVO RESPONSE:', brevoRes.status, brevoData);

    if(!brevoRes.ok) throw new Error(brevoData);

    res.json({ success: true, message: 'Email envoye a '+email });
  } catch (e) { 
    console.log('FORGOT ERROR:', e.message);
    res.status(500).json({ error: 'Brevo error: '+e.message }); 
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Token invalide ou expire' });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ user });
});

export default router;
