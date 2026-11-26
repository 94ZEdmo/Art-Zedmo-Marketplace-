import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';

const router = express.Router();
const PI_API = 'https://api.minepi.com/v2';

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function verifierJetonPi(accessToken) {
  const r = await fetch(`${PI_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) return null;
  const me = await r.json();
  if (!me || !me.uid) return null;
  return { uid: String(me.uid), username: String(me.username || '') };
}

// POST /api/pi/login - CONNEXION, pas liaison. On ignore l'ancien token AZO.
router.post('/login', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken || typeof accessToken !== 'string' || accessToken.length > 4000) {
      return res.status(400).json({ error: 'Jeton Pi manquant.' });
    }
    const pi = await verifierJetonPi(accessToken);
    if (!pi) return res.status(401).json({ error: 'Jeton Pi invalide. Ouvre AZO dans Pi Browser.' });

    // 1. Pi déjà connu -> on le connecte, peu importe qui était connecté avant
    const dejaLie = await User.findOne({ piUid: pi.uid });
    if (dejaLie) {
      if (pi.username && dejaLie.piUsername !== pi.username) {
        dejaLie.piUsername = pi.username;
        await dejaLie.save();
      }
      return res.json({ token: signToken(dejaLie), user: dejaLie });
    }

    // 2. Premier Pi -> on crée le compte en ARTISTE pour qu'il puisse publier
    const suffix = pi.uid.replace(/-/g, '').slice(0, 20);
    const nom = (pi.username || 'pi_' + suffix.slice(0, 8)).padEnd(2, '_').slice(0, 100);
    const user = await User.create({
      nom,
      nom_artiste: pi.username || nom,
      whatsapp: 'pi_' + suffix,
      email: 'pi_' + suffix + '@pi.network',
      password: crypto.randomBytes(24).toString('hex'),
      role: 'artiste',
      statut: 'valide',
      forfait: 'gratuit',
      limiteOeuvres: 5,
      limiteNFT: 3,
      piUid: pi.uid,
      piUsername: pi.username,
      piLinkedAt: new Date()
    });
    return res.status(201).json({ token: signToken(user), user, created: true });
  } catch (e) {
    if (e && e.code === 11000) {
      // Si doublon sur whatsapp/email, on essaie de retrouver par piUid
      const u = await User.findOne({ piUid: req.body?.accessToken ? undefined : undefined }).catch(()=>null);
      return res.status(409).json({ error: 'Compte deja existant, reessaie.' });
    }
    console.error('Pi login error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur Pi.' });
  }
});

// POST /api/pi/approve - OBLIGATOIRE pour que le wallet reste ouvert
router.post('/approve', async (req, res) => {
  try {
    const { paymentId } = req.body || {};
    if (!paymentId) return res.status(400).json({ error: 'paymentId manquant' });
    if (!process.env.PI_API_KEY) return res.status(500).json({ error: 'PI_API_KEY manquant sur Render' });
    const r = await fetch(`${PI_API}/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.PI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Approve Pi échoué' });
    return res.json({ ok: true, payment: d });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /api/pi/complete - OBLIGATOIRE pour valider le paiement
router.post('/complete', async (req, res) => {
  try {
    const { paymentId, txid } = req.body || {};
    if (!paymentId || !txid) return res.status(400).json({ error: 'paymentId / txid manquant' });
    if (!process.env.PI_API_KEY) return res.status(500).json({ error: 'PI_API_KEY manquant sur Render' });
    const r = await fetch(`${PI_API}/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.PI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ txid })
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Complete Pi échoué' });
    return res.json({ ok: true, payment: d });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

export default router;
