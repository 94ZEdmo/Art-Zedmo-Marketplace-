import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import Annonce from '../models/Annonce.js';
import User from '../models/User.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// =====================================================
// AUTHENTIFICATION
// =====================================================

async function authenticateToken(req, res, next) {
  try {
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
      return res.status(500).json({
        error: 'Configuration de sécurité du serveur incorrecte.'
      });
    }

    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        error: 'Connexion requise.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });

    if (!decoded.id || !mongoose.isValidObjectId(decoded.id)) {
      return res.status(401).json({
        error: 'Jeton invalide.'
      });
    }

    const user = await User.findById(decoded.id).select(
      '_id nom role statut'
    );

    if (!user) {
      return res.status(401).json({
        error: 'Utilisateur introuvable.'
      });
    }

    if (user.statut !== 'valide') {
      return res.status(403).json({
        error: 'Ton compte doit être validé.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        error: 'Session invalide ou expirée. Reconnecte-toi.'
      });
    }

    console.error('Erreur authentification annonces :', error);

    return res.status(500).json({
      error: 'Erreur pendant la vérification de la session.'
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Action réservée à l’administrateur.'
    });
  }

  next();
}

const TYPES_AUTORISES = ['info', 'expo', 'enchere', 'urgent'];

// =====================================================
// GET : ANNONCES ACTIVES POUR LA BANNIÈRE
// Route publique
// =====================================================

router.get('/', async (req, res) => {
  try {
    const annonces = await Annonce.find({ active: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json(annonces);
  } catch (error) {
    console.error('Erreur lecture annonces :', error);

    return res.status(500).json({
      error: 'Impossible de charger les annonces.'
    });
  }
});

// =====================================================
// POST : PUBLIER UNE ANNONCE
// Réservé à l'administrateur
// =====================================================

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const titre =
      typeof req.body.titre === 'string'
        ? req.body.titre.trim()
        : '';

    const message =
      typeof req.body.message === 'string'
        ? req.body.message.trim()
        : '';

    const type = req.body.type || 'expo';

    if (!titre && !message) {
      return res.status(400).json({
        error: 'Le titre ou le message est obligatoire.'
      });
    }

    if (!TYPES_AUTORISES.includes(type)) {
      return res.status(400).json({
        error: 'Type d’annonce invalide.'
      });
    }

    const titreFinal = titre || message;

    if (titreFinal.length < 3 || titreFinal.length > 200) {
      return res.status(400).json({
        error: 'Le titre doit contenir entre 3 et 200 caractères.'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        error: 'Le message ne doit pas dépasser 5 000 caractères.'
      });
    }

    // Création de l'annonce avant la désactivation des anciennes.
    // Ainsi, une erreur de validation ne fait pas disparaître
    // toutes les annonces actuellement affichées.
    const annonce = await Annonce.create({
      titre: titreFinal,
      message,
      type,
      active: true
    });

    try {
      await Annonce.updateMany(
        { _id: { $ne: annonce._id } },
        { $set: { active: false } }
      );
    } catch (error) {
      // L'annonce est créée, mais il faut signaler l'échec
      // de la désactivation des annonces précédentes.
      console.error('Annonce créée, mais anciennes annonces non désactivées :', error);

      return res.status(500).json({
        success: false,
        annonce,
        error: 'Annonce créée, mais certaines anciennes annonces peuvent rester actives.'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Annonce publiée.',
      annonce
    });
  } catch (error) {
    console.error('Erreur publication annonce :', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Les données de l’annonce sont invalides.'
      });
    }

    return res.status(500).json({
      error: 'Impossible de publier cette annonce.'
    });
  }
});

// =====================================================
// DELETE : SUPPRIMER UNE ANNONCE
// Réservé à l'administrateur
// =====================================================

router.delete(
  '/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          error: 'Identifiant d’annonce invalide.'
        });
      }

      const annonce = await Annonce.findByIdAndDelete(req.params.id);

      if (!annonce) {
        return res.status(404).json({
          error: 'Annonce non trouvée.'
        });
      }

      return res.json({
        success: true,
        message: 'Annonce supprimée.'
      });
    } catch (error) {
      console.error('Erreur suppression annonce :', error);

      return res.status(500).json({
        error: 'Impossible de supprimer cette annonce.'
      });
    }
  }
);

// =====================================================
// PUT : DÉSACTIVER UNE ANNONCE
// Compatible avec l'ancien admin.html
// Réservé à l'administrateur
// =====================================================

router.put(
  '/:id/desactiver',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          error: 'Identifiant d’annonce invalide.'
        });
      }

      const annonce = await Annonce.findByIdAndUpdate(
        req.params.id,
        { $set: { active: false } },
        {
          new: true,
          runValidators: true
        }
      );

      if (!annonce) {
        return res.status(404).json({
          error: 'Annonce non trouvée.'
        });
      }

      return res.json({
        success: true,
        message: 'Annonce désactivée.',
        annonce
      });
    } catch (error) {
      console.error('Erreur désactivation annonce :', error);

      return res.status(500).json({
        error: 'Impossible de désactiver cette annonce.'
      });
    }
  }
);

export default router;
