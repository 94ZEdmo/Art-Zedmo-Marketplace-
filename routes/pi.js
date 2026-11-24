
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';

const router = express.Router();
const PI_API = 'https://api.minepi.com/v2';

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Lit le JWT AZO s'il existe (pour LIER un compte Pi a un compte deja connecte)
function userIdFromRequest(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return String(decoded.id || decoded._id || '');
  } catch {
    return null;
  }
}

// Verifie le jeton d'acces Pi directement aupres de Pi (on ne fait JAMAIS confiance au front)
async function verifierJetonPi(accessToken) {
  const r = await fetch(`${PI_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) return null;
  const me = await r.json();
  if (!me || !me.uid) return null;
  return { uid: String(me.uid), username: String(me.username || '') };
}

// POST /api/pi/login   body: { accessToken }
router.post('/login', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken || typeof accessToken !== 'string' || accessToken.length > 4000) {
      return res.status(400).json({ error: 'Jeton Pi manquant.' });
    }

    const pi = await verifierJetonPi(accessToken);
    if (!pi) return res.status(401).json({ error: 'Jeton Pi invalide. Ouvre AZO dans Pi Browser.' });

    const dejaLie = await User.findOne({ piUid: pi.uid });
    const currentId = userIdFromRequest(req);

    // CAS 1 : utilisateur deja connecte a AZO -> on lie son compte Pi
    if (currentId) {
      const me = await User.findById(currentId);
      if (!me) return res.status(404).json({ error: 'Compte introuvable.' });
      if (dejaLie && String(dejaLie._id) !== String(me._id)) {
        return res.status(409).json({ error: 'Ce compte Pi est deja lie a un autre compte AZO.' });
      }
      me.piUid = pi.uid;
      me.piUsername = pi.username;
      me.piLinkedAt = me.piLinkedAt || new Date();
      await me.save();
      return res.json({ token: signToken(me), user: me, linked: true });
    }

    // CAS 2 : compte Pi deja lie -> connexion directe
    if (dejaLie) {
      if (pi.username && dejaLie.piUsername !== pi.username) {
        dejaLie.piUsername = pi.username;
        await dejaLie.save();
      }
      return res.json({ token: signToken(dejaLie), user: dejaLie });
    }

    // CAS 3 : premiere connexion -> creation automatique d'un compte ACHETEUR
    const suffix = pi.uid.replace(/-/g, '').slice(0, 20);
    const nom = (pi.username || 'pi_' + suffix.slice(0, 8)).padEnd(2, '_').slice(0, 100);
    const user = await User.create({
      nom,
      whatsapp: 'pi_' + suffix,                       // identifiant technique unique (modifiable plus tard)
      password: crypto.randomBytes(24).toString('hex'), // mot de passe aleatoire, jamais utilise
      role: 'acheteur',
      statut: 'valide',
      forfait: 'gratuit',
      piUid: pi.uid,
      piUsername: pi.username,
      piLinkedAt: new Date()
    });
    return res.status(201).json({ token: signToken(user), user, created: true });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: 'Compte deja existant, reessaie.' });
    }
    console.error('Pi login error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur Pi.' });
  }
});

export default router;
