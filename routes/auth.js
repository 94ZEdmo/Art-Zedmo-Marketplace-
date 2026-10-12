import express from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import User from '../models/User.js';

const router = express.Router();

// =====================================================
// 1. CONFIGURATION
// =====================================================

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET doit être configuré dans Render ' +
    'avec une valeur secrète d’au moins 32 caractères.'
  );
}

// Le service e-mail reste facultatif pendant la configuration.
const emailConfigured = Boolean(
  process.env.EMAIL_USER && process.env.EMAIL_PASS
);

const transporter = emailConfigured
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  : null;

// =====================================================
// 2. AUTHENTIFICATION JWT
// =====================================================

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentification requise.'
    });
  }

  const token = authorization.slice(7);

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: 'Jeton invalide ou expiré.'
    });
  }
}

// =====================================================
// 3. AUTORISATION ADMINISTRATEUR
// =====================================================

async function requireAdmin(req, res, next) {
  try {
    if (!req.auth?.id || req.auth.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès réservé à l’administrateur.'
      });
    }

    // Vérifie que le compte existe toujours et est autorisé.
    const admin = await User.findById(req.auth.id)
      .select('_id role statut');

    if (
      !admin ||
      admin.role !== 'admin' ||
      admin.statut !== 'valide'
    ) {
      return res.status(403).json({
        error: 'Compte administrateur non autorisé.'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

// =====================================================
// 4. FONCTIONS UTILITAIRES
// =====================================================

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

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
    statut: user.statut,
    estVerifie: user.estVerifie,
    createdAt: user.createdAt
  };
}

function createToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: user.role === 'admin' ? '8h' : '7d'
    }
  );
}

async function sendValidationEmail(user) {
  if (!transporter || !user.email) {
    console.log(
      'E-mail non envoyé : configuration e-mail incomplète.'
    );
    return false;
  }

  const nomArtiste = escapeHtml(user.nom_artiste);
  const appUrl = (
    process.env.FRONTEND_URL ||
    'https://art-zedmo.onrender.com'
  ).replace(/\/+$/, '');

  try {
    await transporter.sendMail({
      from: `"ART-ZEDMO" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Votre profil ART-ZEDMO a été validé',

      html: `
        <div style="font-family:Arial,sans-serif;padding:24px">
          <h2>Félicitations ${nomArtiste} !</h2>

          <p>
            Votre profil ART-ZEDMO a été validé
            par notre équipe.
          </p>

          <p>
            Vous pouvez maintenant vous connecter à votre compte
            et accéder aux fonctionnalités autorisées.
          </p>

          <p>
            <a
              href="${escapeHtml(appUrl)}"
              style="
                display:inline-block;
                background:#111;
                color:#fff;
                padding:12px 22px;
                border-radius:8px;
                text-decoration:none
              "
            >
              Accéder à ART-ZEDMO
            </a>
          </p>

          <p>
            L'équipe ART-ZEDMO MARKETPLACE
          </p>
        </div>
      `
    });

    return true;
  } catch (error) {
    // Une panne de messagerie ne doit pas annuler la validation.
    console.error('Erreur e-mail :', error.message);
    return false;
  }
}

// =====================================================
// 5. INSCRIPTION
// POST /api/auth/register
// =====================================================

router.post('/register', async (req, res, next) => {
  try {
    const {
      nom,
      nom_artiste,
      whatsapp,
      email,
      password,
      ville,
      role
    } = req.body;

    const nomNettoye = String(nom || '').trim();
    const artisteNettoye = String(nom_artiste || '').trim();
    const whatsappNettoye = String(whatsapp || '').trim();
    const emailNettoye = String(email || '').trim().toLowerCase();
    const passwordNettoye = String(password || '');

    if (
      !nomNettoye ||
      !artisteNettoye ||
      !whatsappNettoye ||
      !emailNettoye ||
      !passwordNettoye
    ) {
      return res.status(400).json({
        error:
          'Nom complet, nom d’artiste, WhatsApp, e-mail ' +
          'et mot de passe sont obligatoires.'
      });
    }

    if (passwordNettoye.length < 10) {
      return res.status(400).json({
        error: 'Le mot de passe doit contenir au moins 10 caractères.'
      });
    }

    if (passwordNettoye.length > 128) {
      return res.status(400).json({
        error: 'Le mot de passe est trop long.'
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNettoye)
    ) {
      return res.status(400).json({
        error: 'Adresse e-mail invalide.'
      });
    }

    const existe = await User.findOne({
      $or: [
        { whatsapp: whatsappNettoye },
        { email: emailNettoye }
      ]
    });

    if (existe) {
      return res.status(409).json({
        error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.'
      });
    }

    // Le navigateur ne peut jamais créer un administrateur.
    const roleAutorise = ['artiste', 'acheteur'].includes(role)
      ? role
      : 'artiste';

    const user = await User.create({
      nom: nomNettoye,
      nom_artiste: artisteNettoye,
      whatsapp: whatsappNettoye,
      email: emailNettoye,
      password: passwordNettoye,
      ville: String(ville || 'Abomey-Calavi').trim(),
      role: roleAutorise,
      statut: 'en_attente',
      estVerifie: false
    });

    // Aucun jeton n'est délivré avant validation du compte.
    return res.status(201).json({
      success: true,
      message:
        'Votre inscription a été enregistrée. ' +
        'Votre compte doit être validé par un administrateur.',
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Ce numéro WhatsApp ou cette adresse e-mail est déjà utilisé.'
      });
    }

    next(error);
  }
});

// =====================================================
// 6. CONNEXION
// POST /api/auth/login
// =====================================================

router.post('/login', async (req, res, next) => {
  try {
    const { whatsapp, email, identifiant, password } = req.body;

    const loginId = String(
      identifiant || email || whatsapp || ''
    ).trim();

    if (!loginId || !password) {
      return res.status(400).json({
        error: 'Identifiant et mot de passe obligatoires.'
      });
    }

    const loginEmail = loginId.toLowerCase();

    const user = await User.findOne({
      $or: [
        { whatsapp: loginId },
        { email: loginEmail }
      ]
    });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        error: 'Identifiants invalides.'
      });
    }

    if (user.statut === 'en_attente') {
      return res.status(403).json({
        error: 'Votre profil est en attente de validation.'
      });
    }

    if (user.statut === 'refuse') {
      return res.status(403).json({
        error: 'Votre profil a été refusé.'
      });
    }

    if (user.statut !== 'valide') {
      return res.status(403).json({
        error: 'Ce compte n’est pas autorisé à se connecter.'
      });
    }

    const token = createToken(user);

    return res.json({
      success: true,
      token,
      user: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 7. PROFIL DE L'UTILISATEUR CONNECTÉ
// GET /api/auth/me
// =====================================================

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable.'
      });
    }

    if (user.statut !== 'valide') {
      return res.status(403).json({
        error: 'Compte non autorisé.'
      });
    }

    res.json(publicUser(user));
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 8. COMPATIBILITÉ AVEC L'ANCIENNE ROUTE /me/:id
// GET /api/auth/me/:id
// =====================================================

router.get('/me/:id', authenticateToken, async (req, res, next) => {
  try {
    const requestedId = req.params.id;
    const ownProfile = req.auth.id === requestedId;

    if (!ownProfile && req.auth.role !== 'admin') {
      return res.status(403).json({
        error: 'Vous ne pouvez pas consulter ce profil.'
      });
    }

    const user = await User.findById(requestedId)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable.'
      });
    }

    res.json(publicUser(user));
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 9. LISTE DES UTILISATEURS
// GET /api/auth
// ADMIN UNIQUEMENT
// =====================================================

router.get('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(users);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 10. VALIDATION D'UN COMPTE
// PUT /api/auth/:id/valider
// ADMIN UNIQUEMENT
// =====================================================

async function validateUserHandler(req, res, next) {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable.'
      });
    }

    user.statut = 'valide';
    user.estVerifie = true;

    await user.save();

    const emailSent = await sendValidationEmail(user);

    res.json({
      success: true,
      user: publicUser(user),
      emailSent
    });
  } catch (error) {
    next(error);
  }
}

router.put(
  '/:id/valider',
  authenticateToken,
  requireAdmin,
  validateUserHandler
);

// Ancienne route conservée temporairement pour compatibilité.
// Elle bénéficie des mêmes contrôles d'accès.
router.put(
  '/users/:id/valider',
  authenticateToken,
  requireAdmin,
  validateUserHandler
);

// =====================================================
// 11. REFUSER UN COMPTE
// PUT /api/auth/:id/refuser
// ADMIN UNIQUEMENT
// =====================================================

router.put(
  '/:id/refuser',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          error: 'Utilisateur introuvable.'
        });
      }

      user.statut = 'refuse';
      user.estVerifie = false;

      await user.save();

      res.json({
        success: true,
        user: publicUser(user)
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// 12. SUPPRESSION D'UN COMPTE
// DELETE /api/auth/:id
// ADMIN UNIQUEMENT
// =====================================================

router.delete(
  '/:id',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (req.params.id === req.auth.id) {
        return res.status(400).json({
          error: 'Vous ne pouvez pas supprimer votre propre compte administrateur.'
        });
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          error: 'Utilisateur introuvable.'
        });
      }

      if (user.role === 'admin') {
        return res.status(403).json({
          error:
            'La suppression d’un administrateur doit suivre une procédure dédiée.'
        });
      }

      await User.deleteOne({ _id: user._id });

      res.json({
        success: true,
        message: 'Compte supprimé.'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Ancienne route conservée temporairement.
// Elle doit elle aussi être protégée.
router.delete(
  '/users/:id',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (req.params.id === req.auth.id) {
        return res.status(400).json({
          error: 'Vous ne pouvez pas supprimer votre propre compte administrateur.'
        });
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          error: 'Utilisateur introuvable.'
        });
      }

      if (user.role === 'admin') {
        return res.status(403).json({
          error: 'La suppression d’un administrateur est interdite par cette route.'
        });
      }

      await User.deleteOne({ _id: user._id });

      res.json({
        success: true,
        message: 'Compte supprimé.'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
