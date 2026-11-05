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
    // ===== SEUL AJOUT - EMAIL BREVO APRES INSCRIPTION (même méthode que forgot-password) =====
    if (user.email && process.env.BREVO_API_KEY) {
      try {
        await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'accept':'application/json','content-type':'application/json','api-key':process.env.BREVO_API_KEY }, body: JSON.stringify({ sender:{email:'artzedmo@gmail.com',name:'ART-ZEDMO'}, to:[{email:user.email, name: user.nom_artiste || user.nom}], subject:'Inscription reçue - ART-ZEDMO', htmlContent:`<div style="font-family:Arial;padding:20px;background:#111;color:#fff;border-radius:12px"><h2 style="color:#d4af37">ART-ZEDMO MARKETPLACE</h2><p>Bonjour ${user.nom_artiste || user.nom},</p><p>Votre inscription est bien reçue sur ART-ZEDMO. ✅</p><p>Bienvenue dans la Marketplace des Arts !<br>Vous pouvez maintenant vous connecter et publier vos œuvres.</p><hr><p style="font-size:12px;color:#aaa">ART-ZEDMO - Galerie permanente + Expositions + Enchères<br>WhatsApp: 0194655238</p></div>` }) });
        console.log('📧 Brevo inscription envoyée à', user.email);
      } catch (e) { console.log('📧 Erreur Brevo inscription:', e.message); }
    }
    // ===== FIN AJOUT =====
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
    if (!user) return res.json({ success: true });
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpire = Date.now() + 3600000;
    await user.save();
    const resetUrl = `${process.env.FRONTEND_URL || 'https://art-zedmo-marketplace.onrender.com'}/reset-password.html?token=${token}`;
    await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'accept':'application/json','content-type':'application/json','api-key':process.env.BREVO_API_KEY }, body: JSON.stringify({ sender:{email:'artzedmo@gmail.com',name:'ART-ZEDMO'}, to:[{email:user.email}], subject:'Reset ART-ZEDMO', htmlContent:`<a href="${resetUrl}">${resetUrl}</a>` }) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === FIX SUPPRESSION COMPTES ===
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Auto-suppression interdite' });
    const del = await User.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ error: 'Compte non trouve' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
