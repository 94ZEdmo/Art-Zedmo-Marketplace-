import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import Exposition from '../models/Exposition.js';
import Artwork from '../models/Artwork.js';
import Enchere from '../models/Enchere.js';
import User from '../models/User.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

const STATUTS_OEUVRE_VOTABLES = [
  'validee',
  'en_expo'
];

const STATUTS_EXPOSITION_PUBLIQUES = [
  'active',
  'vote_clos',
  'enchere',
  'terminee'
];

/* =====================================================
   AUTHENTIFICATION
===================================================== */

async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentification requise.'
    });
  }

  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    return res.status(500).json({
      success: false,
      error: 'Configuration de sécurité indisponible.'
    });
  }

  try {
    const token = authorization.slice(7);

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });

    if (!payload.id && !payload._id) {
      return res.status(401).json({
        success: false,
        error: 'Jeton invalide.'
      });
    }

    const userId = payload.id || payload._id;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        error: 'Identifiant utilisateur invalide.'
      });
    }

    const user = await User.findById(userId)
      .select('_id role statut');

    if (!user || user.statut !== 'valide') {
      return res.status(403).json({
        success: false,
        error: 'Compte absent, inactif ou non validé.'
      });
    }

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: 'Jeton invalide ou expiré.'
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Accès réservé à l’administrateur.'
    });
  }

  next();
}

/* =====================================================
   VALIDATION DES IDENTIFIANTS
===================================================== */

function validObjectId(id) {
  return mongoose.isValidObjectId(id);
}

/* =====================================================
   1. LISTE DES EXPOSITIONS
   GET /api/expositions
===================================================== */

router.get('/', async (req, res) => {
  try {
    const expositions = await Exposition.find({
      statut: { $in: STATUTS_EXPOSITION_PUBLIQUES }
    })
      .populate({
        path: 'oeuvres',
        match: {
          statut: {
            $in: [
              'validee',
              'en_expo',
              'en_enchere',
              'vendue'
            ]
          }
        },
        populate: {
          path: 'artiste',
          select: 'nom nom_artiste ville avatar'
        }
      })
      .sort({ dateDebut: -1 })
      .limit(100);

    return res.json(expositions);
  } catch (error) {
    console.error('Erreur GET expositions :', error);

    return res.status(500).json({
      success: false,
      error: 'Impossible de charger les expositions.'
    });
  }
});

/* =====================================================
   2. EXPOSITION ACTIVE
   GET /api/expositions/active
===================================================== */

router.get('/active', async (req, res) => {
  try {
    const expo = await Exposition.findOne({
      statut: {
        $in: ['active', 'vote_clos', 'enchere']
      }
    })
      .populate({
        path: 'oeuvres',
        match: {
          statut: {
            $in: [
              'validee',
              'en_expo',
              'en_enchere'
            ]
          }
        },
        populate: {
          path: 'artiste',
          select: 'nom nom_artiste ville avatar'
        },
        options: {
          sort: { votesCount: -1 }
        }
      })
      .sort({ dateDebut: -1 });

    if (!expo) {
      return res.json({
        message: 'Pas d’exposition active.',
        oeuvres: []
      });
    }

    return res.json(expo);
  } catch (error) {
    console.error('Erreur exposition active :', error);

    return res.status(500).json({
      success: false,
      error: 'Impossible de charger l’exposition active.'
    });
  }
});

/* =====================================================
   3. CRÉER UNE EXPOSITION
   POST /api/expositions
   ADMIN UNIQUEMENT
===================================================== */

router.post(
  '/',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        titre,
        description,
        dateDebut,
        dateFin,
        dateFinVote,
        lieu,
        image
      } = req.body || {};

      if (
        typeof titre !== 'string' ||
        titre.trim().length < 3
      ) {
        return res.status(400).json({
          success: false,
          error: 'Le titre doit comporter au moins 3 caractères.'
        });
      }

      const debut = dateDebut
        ? new Date(dateDebut)
        : new Date();

      const fin = dateFin
        ? new Date(dateFin)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const finVote = dateFinVote
        ? new Date(dateFinVote)
        : new Date(debut.getTime() + 27 * 24 * 60 * 60 * 1000);

      if (
        Number.isNaN(debut.getTime()) ||
        Number.isNaN(fin.getTime()) ||
        Number.isNaN(finVote.getTime())
      ) {
        return res.status(400).json({
          success: false,
          error: 'Une ou plusieurs dates sont invalides.'
        });
      }

      if (fin <= debut) {
        return res.status(400).json({
          success: false,
          error: 'La fin de l’exposition doit être postérieure au début.'
        });
      }

      if (finVote < debut || finVote > fin) {
        return res.status(400).json({
          success: false,
          error: 'La clôture des votes doit se situer pendant l’exposition.'
        });
      }

      const expo = await Exposition.create({
        titre: titre.trim(),
        description,
        dateDebut: debut,
        dateFin: fin,
        dateFinVote: finVote,
        lieu,
        image,
        statut: 'active'
      });

      return res.status(201).json({
        success: true,
        message: 'Exposition créée.',
        exposition: expo
      });
    } catch (error) {
      console.error('Erreur création exposition :', error);

      return res.status(500).json({
        success: false,
        error: 'Impossible de créer l’exposition.'
      });
    }
  }
);

/* =====================================================
   4. AJOUTER UNE ŒUVRE À UNE EXPOSITION
   POST /api/expositions/:id/add-artwork
   ADMIN UNIQUEMENT
===================================================== */

router.post(
  '/:id/add-artwork',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { artworkId } = req.body || {};

      if (
        !validObjectId(id) ||
        !validObjectId(artworkId)
      ) {
        return res.status(400).json({
          success: false,
          error: 'Identifiant d’exposition ou d’œuvre invalide.'
        });
      }

      const expo = await Exposition.findById(id);

      if (!expo) {
        return res.status(404).json({
          success: false,
          error: 'Exposition introuvable.'
        });
      }

      if (
        !['active', 'a_venir'].includes(expo.statut)
      ) {
        return res.status(400).json({
          success: false,
          error: 'Cette exposition ne peut plus recevoir d’œuvres.'
        });
      }

      const art = await Artwork.findById(artworkId);

      if (!art) {
        return res.status(404).json({
          success: false,
          error: 'Œuvre introuvable.'
        });
      }

      if (!['validee', 'en_expo'].includes(art.statut)) {
        return res.status(400).json({
          success: false,
          error: 'Seules les œuvres validées peuvent être exposées.'
        });
      }

      if (
        art.exposition &&
        String(art.exposition) !== String(expo._id)
      ) {
        return res.status(409).json({
          success: false,
          error: 'Cette œuvre appartient déjà à une autre exposition.'
        });
      }

      art.statut = 'en_expo';
      art.exposition = expo._id;

      await art.save();

      if (
        !expo.oeuvres.some(
          id => String(id) === String(art._id)
        )
      ) {
        expo.oeuvres.push(art._id);
        await expo.save();
      }

      const baseUrl = (
        process.env.FRONTEND_URL ||
        process.env.FRONT_URL ||
        'https://art-zedmo.com'
      ).split(',')[0].trim().replace(/\/+$/, '');

      const lienVote = `${baseUrl}/expo/vote/${art._id}`;

      const texteWhatsApp =
        `Vote pour "${art.titre}" sur ART-ZEDMO MARKETPLACE : ${lienVote}`;

      return res.json({
        success: true,
        message: 'Œuvre ajoutée à l’exposition.',
        art,
        lien_viral: art.lien_vote_unique || lienVote,
        lien_vote: lienVote,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(texteWhatsApp)}`
      });
    } catch (error) {
      console.error('Erreur ajout œuvre :', error);

      return res.status(500).json({
        success: false,
        error: 'Impossible d’ajouter cette œuvre à l’exposition.'
      });
    }
  }
);

/* =====================================================
   5. CALCULER LE TOP 10 ET CRÉER LES ENCHÈRES
   POST /api/expositions/:id/calculer-top-et-encherir
   ADMIN UNIQUEMENT
===================================================== */

router.post(
  '/:id/calculer-top-et-encherir',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!validObjectId(id)) {
        return res.status(400).json({
          success: false,
          error: 'Identifiant d’exposition invalide.'
        });
      }

      const expo = await Exposition.findById(id);

      if (!expo) {
        return res.status(404).json({
          success: false,
          error: 'Exposition introuvable.'
        });
      }

      if (expo.statut === 'terminee') {
        return res.status(400).json({
          success: false,
          error: 'Cette exposition est terminée.'
        });
      }

      const dateFin = req.body?.dateFin
        ? new Date(req.body.dateFin)
        : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      if (Number.isNaN(dateFin.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'La date de fin des enchères est invalide.'
        });
      }

      if (dateFin <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'La date de fin des enchères doit être dans le futur.'
        });
      }

      // Classement des œuvres actuellement exposées.
      const top10 = await Artwork.find({
        exposition: expo._id,
        statut: 'en_expo'
      })
        .sort({
          votesCount: -1,
          createdAt: 1
        })
        .limit(10);

      if (top10.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Aucune œuvre exposée ne peut être mise aux enchères.'
        });
      }

      const resultats = [];

      for (const art of top10) {
        let enchere = await Enchere.findOne({
          artwork: art._id,
          statut: 'en_cours'
        });

        if (!enchere) {
          enchere = await Enchere.create({
            artwork: art._id,
            titre: art.titre,
            exposition: expo._id,
            prixDepart: art.prix,
            enchereActuelle: Math.round(art.prix * 2),
            dateFin
          });
        } else {
          // Ne pas modifier automatiquement la date
          // si des offres ont déjà été enregistrées.
          if (
            Array.isArray(enchere.offres) &&
            enchere.offres.length > 0
          ) {
            resultats.push({
              artworkId: art._id,
              titre: art.titre,
              enchereId: enchere._id,
              dateFin: enchere.dateFin,
              modificationDateRefusee: true
            });

            continue;
          }

          enchere.dateFin = dateFin;

          await enchere.save();
        }

        art.statut = 'en_enchere';
        await art.save();

        resultats.push({
          artworkId: art._id,
          titre: art.titre,
          enchereId: enchere._id,
          dateFin: enchere.dateFin
        });
      }

      expo.oeuvres_top = top10.map(art => art._id);
      expo.statut = 'enchere';

      await expo.save();

      return res.json({
        success: true,
        message: 'Classement calculé et enchères traitées.',
        nombreOeuvresClassees: top10.length,
        dateFin,
        top: top10,
        resultats
      });
    } catch (error) {
      console.error('Erreur calcul Top 10 :', error);

      return res.status(500).json({
        success: false,
        error: 'Impossible de calculer le classement et de lancer les enchères.'
      });
    }
  }
);

export default router;
