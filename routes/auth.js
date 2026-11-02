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
    const { nom, whatsapp, password, email, ville, role } = req.body;
    if (!nom || !whatsapp || !password) return res.status(400).json({ error: 'Nom, whatsapp, password requis' });
    const exists = await User.findOne({ $or: [{ whatsapp }, ...(email ? [{ email }] : [])] });
    if (exists) return res.status(400).json({ error: 'WhatsApp ou email deja utilise' });
    const user = await User.create({ nom, whatsapp, password, email, ville, role: role || 'artiste', statut: 'valide', forfait: 'gratuit' });
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { identifiant, password } = req.body;
    const user = await User.findOne({ $or: [{ whatsapp: identifiant }, { email: identifiant }, { nom: identifiant }] });
    if (!user || !(await user.comparePassword(password))) return res.status(400).json({ error: 'Identifiant ou mot de passe incorrect' });
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpire = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;

    const brevo = await import('@getbrevo/brevo');
    const api = new brevo.TransactionalEmailsApi();
    api.setApiKey(0, process.env.BREVO_API_KEY);
    await api.sendTransacEmail({
      sender: { email: process.env.BREVO_SENDER, name: 'ART-ZEDMO' },
      to: [{ email: user.email }],
      subject: 'Reset mot de passe ART-ZEDMO',
      htmlContent: `<p>Lien reset (1h) : <a href="${resetUrl}">${resetUrl}</a></p>`
    });

    res.json({ success: true, message: 'Email envoye' });
  } catch (e) { 
    console.log(e);
    res.status(500).json({ error: e.message }); 
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Token invalide' });
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
