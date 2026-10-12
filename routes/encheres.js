import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import Enchere from '../models/Enchere.js';
import Artwork from '../models/Artwork.js';
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

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

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
        error: 'Jeton de connexion invalide.'
      });
    }

    const user = await User.findById(decoded.id).select(
      '_id nom nom_artiste role statut'
    );

    if (!user) {
      return res.status(401).json({
        error: 'Utilisateur introuvable.'
      });
    }

    if (user.statut !== 'valide') {
      return res.status(403).json({
        error: 'Ton compte doit être validé avant cette opération.'
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

    console.error('Erreur authentification enchères :', error);

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

function validDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

// =====================================================
// GET : LISTE DES ENCHÈRES EN COURS
// =====================================================

router.get('/', async (req, res) => {
  try {
    const encheres = await Enchere.find({
      statut: 'en_cours',
      dateFin: { $gt: new Date() }
    })
      .populate({
        path: 'artwork',
        select: 'titre image images prix categorie statut artiste',
        populate: {
          path: 'artiste',
          select: 'nom nom_artiste ville'
        }
      })
      .populate('dernierEncherisseur', 'nom nom_artiste')
      .sort({ dateFin: 1 })
      .limit(100)
      .lean();

    return res.json(encheres);
  } catch (error) {
    console.error('Erreur liste enchères :', error);

    return res.status(500).json({
      error: 'Impossible de charger les enchères.'
    });
  }
});

// =====================================================
// GET : DÉTAIL D'UNE ENCHÈRE
// =====================================================

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant de l’enchère invalide.'
      });
    }

    const enchere = await Enchere.findById(req.params.id)
      .populate({
        path: 'artwork',
        populate: {
          path: 'artiste',
          select: 'nom nom_artiste ville'
        }
      })
      .populate('dernierEncherisseur', 'nom nom_artiste')
      .populate('gagnant', 'nom nom_artiste');

    if (!enchere) {
      return res.status(404).json({
        error: 'Enchère non trouvée.'
      });
    }

    return res.json(enchere);
  } catch (error) {
    console.error('Erreur détail enchère :', error);

    return res.status(500).json({
      error: 'Impossible de charger cette enchère.'
    });
  }
});

// =====================================================
// POST : ENCHÉRIR
// =====================================================

router.post('/:id/encherir', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant de l’enchère invalide.'
      });
    }

    const montant = Number(req.body.montant);

    if (!Number.isFinite(montant) || montant <= 0) {
      return res.status(400).json({
        error: 'Le montant proposé doit être un nombre positif.'
      });
    }

    // On ne prend jamais l'identité du participant depuis le navigateur.
    const userId = req.user._id;

    // Le prix de l'offre doit dépasser le prix actuel.
    // Le filtre sur le prix et la date évite qu'une offre concurrente
    // déjà enregistrée soit écrasée silencieusement.
    const maintenant = new Date();

    const enchere = await Enchere.findOneAndUpdate(
      {
        _id: req.params.id,
        statut: 'en_cours',
        dateFin: { $gt: maintenant },
        enchereActuelle: { $lt: montant }
      },
      {
        $set: {
          enchereActuelle: montant,
          dernierEncherisseur: userId
        },
        $push: {
          offres: {
            user: userId,
            montant,
            date: maintenant
          }
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!enchere) {
      const existante = await Enchere.findById(req.params.id)
        .select('statut dateFin enchereActuelle');

      if (!existante) {
        return res.status(404).json({
          error: 'Enchère non trouvée.'
        });
      }

      if (
        existante.statut !== 'en_cours' ||
        existante.dateFin <= maintenant
      ) {
        return res.status(400).json({
          error: 'Cette enchère est terminée ou fermée.'
        });
      }

      return res.status(409).json({
        error: 'Une offre supérieure a peut-être été enregistrée. Actualise la page et réessaie.',
        prixActuel: existante.enchereActuelle
      });
    }

    // Prolongation contrôlée après l'enregistrement de l'offre.
    // Le prix a déjà été modifié par findOneAndUpdate :
    // le hook pre-save du modèle ne sera pas déclenché ici.
    const tempsRestant = enchere.dateFin.getTime() - Date.now();

    if (tempsRestant > 0 && tempsRestant <= 2 * 60 * 1000) {
      const nouvelleDateFin = new Date(Date.now() + 2 * 60 * 1000);

      await Enchere.updateOne(
        {
          _id: enchere._id,
          statut: 'en_cours',
          enchereActuelle: montant,
          dernierEncherisseur: userId
        },
        {
          $set: {
            dateFin: nouvelleDateFin
          }
        }
      );

      enchere.dateFin = nouvelleDateFin;
    }

    return res.json({
      success: true,
      nouvelle_enchere: enchere.enchereActuelle,
      dateFin: enchere.dateFin,
      message: 'Offre acceptée.'
    });
  } catch (error) {
    console.error('Erreur enchère :', error);

    return res.status(500).json({
      error: 'Impossible d’enregistrer cette offre.'
    });
  }
});

// =====================================================
// DELETE : SUPPRIMER UNE ENCHÈRE
// Réservé à l'administrateur
// =====================================================

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant de l’enchère invalide.'
      });
    }

    const enchere = await Enchere.findById(req.params.id);

    if (!enchere) {
      return res.status(404).json({
        error: 'Enchère non trouvée.'
      });
    }

    // Ne pas remettre en galerie une œuvre déjà vendue.
    const artwork = await Artwork.findById(enchere.artwork);

    if (artwork && artwork.statut === 'vendue') {
      return res.status(409).json({
        error: 'Cette œuvre est déjà vendue. Suppression refusée.'
      });
    }

    await Enchere.findByIdAndDelete(enchere._id);

    if (artwork && artwork.statut === 'en_enchere') {
      artwork.statut = 'validee';
      artwork.exposition = null;
      await artwork.save();
    }

    return res.json({
      success: true,
      message: 'Enchère supprimée.'
    });
  } catch (error) {
    console.error('Erreur suppression enchère :', error);

    return res.status(500).json({
      error: 'Impossible de supprimer cette enchère.'
    });
  }
});

// =====================================================
// PUT : MODIFIER LA DATE D'UNE ENCHÈRE
// Réservé à l'administrateur
// =====================================================

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant de l’enchère invalide.'
      });
    }

    const dateFin = validDate(req.body.dateFin);

    if (!dateFin || dateFin <= new Date()) {
      return res.status(400).json({
        error: 'La date de fin doit être une date future valide.'
      });
    }

    const enchere = await Enchere.findOneAndUpdate(
      {
        _id: req.params.id,
        statut: 'en_cours'
      },
      {
        $set: { dateFin }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!enchere) {
      return res.status(404).json({
        error: 'Enchère active non trouvée.'
      });
    }

    return res.json({
      success: true,
      enchere
    });
  } catch (error) {
    console.error('Erreur modification date :', error);

    return res.status(500).json({
      error: 'Impossible de modifier la date.'
    });
  }
});

// =====================================================
// PUT : MODIFIER LES DATES DE TOUTES LES ENCHÈRES ACTIVES
// Réservé à l'administrateur
// =====================================================

router.put(
  '/bulk/update-date',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const dateFin = validDate(req.body.dateFin);

      if (!dateFin || dateFin <= new Date()) {
        return res.status(400).json({
          error: 'La date de fin doit être une date future valide.'
        });
      }

      const result = await Enchere.updateMany(
        {
          statut: 'en_cours'
        },
        {
          $set: { dateFin }
        },
        {
          runValidators: true
        }
      );

      return res.json({
        success: true,
        modified: result.modifiedCount,
        dateFin,
        message: 'Dates des enchères actives mises à jour.'
      });
    } catch (error) {
      console.error('Erreur modification globale des dates :', error);

      return res.status(500).json({
        error: 'Impossible de modifier les dates.'
      });
    }
  }
);

export default router;
