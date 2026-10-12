import express from 'express';
import mongoose from 'mongoose';

import Vote from '../models/Vote.js';
import Artwork from '../models/Artwork.js';
import Exposition from '../models/Exposition.js';

const router = express.Router();

/**
 * ART-ZEDMO MARKETPLACE
 * Gestion des votes des œuvres d'art.
 *
 * IMPORTANT :
 * Ce fichier incrémente les compteurs après la création du vote.
 * Le modèle Vote.js ne doit donc PAS incrémenter ces mêmes compteurs
 * dans un hook post('save').
 */

// Statuts des œuvres autorisées au vote.
const STATUTS_VOTABLES = ['validee', 'en_expo'];

/**
 * POST /api/votes
 *
 * Enregistre un vote pour une œuvre.
 *
 * Champs attendus :
 * - artworkId (obligatoire)
 * - userId (facultatif)
 * - expositionId (facultatif)
 * - votant_whatsapp (facultatif)
 * - source_lien (facultatif)
 */
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      artworkId,
      expositionId,
      votant_whatsapp,
      source_lien
    } = req.body || {};

    // 1. Vérification de l'identifiant de l'œuvre.
    if (
      !artworkId ||
      !mongoose.isValidObjectId(artworkId)
    ) {
      return res.status(400).json({
        success: false,
        error: "Un identifiant d'œuvre valide est requis."
      });
    }

    // 2. Vérification des identifiants facultatifs.
    if (
      userId &&
      !mongoose.isValidObjectId(userId)
    ) {
      return res.status(400).json({
        success: false,
        error: "L'identifiant du votant est invalide."
      });
    }

    if (
      expositionId &&
      !mongoose.isValidObjectId(expositionId)
    ) {
      return res.status(400).json({
        success: false,
        error: "L'identifiant de l'exposition est invalide."
      });
    }

    // 3. Vérification de l'œuvre.
    const artwork = await Artwork.findById(artworkId)
      .select('_id titre artiste exposition statut votesCount');

    if (!artwork) {
      return res.status(404).json({
        success: false,
        error: "Cette œuvre n'existe pas."
      });
    }

    if (!STATUTS_VOTABLES.includes(artwork.statut)) {
      return res.status(400).json({
        success: false,
        error: "Cette œuvre n'est pas actuellement ouverte au vote."
      });
    }

    // 4. Vérification de la cohérence de l'exposition.
    let expositionPourVote = expositionId || artwork.exposition;

    if (expositionId && artwork.exposition) {
      if (
        String(expositionId) !== String(artwork.exposition)
      ) {
        return res.status(400).json({
          success: false,
          error: "Cette œuvre n'appartient pas à l'exposition indiquée."
        });
      }
    }

    if (expositionPourVote) {
      const exposition = await Exposition.findById(
        expositionPourVote
      );

      if (!exposition) {
        return res.status(404).json({
          success: false,
          error: "Exposition introuvable."
        });
      }

      // Les noms de champs et les statuts devront être
      // adaptés si ton modèle Exposition.js diffère.
      if (
        exposition.statut === 'vote_clos' ||
        exposition.statut === 'terminee'
      ) {
        return res.status(400).json({
          success: false,
          error: "Les votes de cette exposition sont clôturés."
        });
      }

      if (
        exposition.dateFinVote &&
        new Date() > new Date(exposition.dateFinVote)
      ) {
        return res.status(400).json({
          success: false,
          error: "La période de vote est terminée."
        });
      }
    }

    // 5. Nettoyage des informations du votant.
    const whatsapp = typeof votant_whatsapp === 'string'
      ? votant_whatsapp.trim()
      : '';

    const source = typeof source_lien === 'string'
      ? source_lien.trim().slice(0, 1000)
      : '';

    // 6. Enregistrement du vote.
    // L'index unique du modèle Vote doit empêcher
    // les doublons pour les identifiants réellement fournis.
    const vote = await Vote.create({
      user: userId || undefined,
      votant_whatsapp: whatsapp || undefined,
      votant_ip: req.ip,
      artwork: artwork._id,
      exposition: expositionPourVote || undefined,
      source_lien:
        source ||
        (typeof req.headers.referer === 'string'
          ? req.headers.referer.slice(0, 1000)
          : '')
    });

    // 7. Mise à jour du compteur principal.
    // Cette opération doit être faite ici OU dans le modèle,
    // jamais aux deux endroits.
    const updatedArtwork = await Artwork.findByIdAndUpdate(
      artwork._id,
      {
        $inc: {
          votesCount: 1
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select('titre votesCount');

    if (!updatedArtwork) {
      return res.status(500).json({
        success: false,
        error: "Le vote a été enregistré, mais le compteur n'a pas pu être actualisé."
      });
    }

    return res.status(201).json({
      success: true,
      message: "Vote enregistré avec succès.",
      total_votes_oeuvre: updatedArtwork.votesCount,
      voteId: vote._id
    });

  } catch (error) {
    // Index unique : vote déjà enregistré.
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Tu as déjà voté pour cette œuvre."
      });
    }

    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        success: false,
        error: "Les informations du vote sont invalides."
      });
    }

    console.error('Erreur POST /api/votes :', error);

    return res.status(500).json({
      success: false,
      error: "Une erreur est survenue pendant l'enregistrement du vote."
    });
  }
});


/**
 * GET /api/votes/top/:expoId
 *
 * Renvoie les dix œuvres les plus votées
 * pour une exposition donnée.
 */
router.get('/top/:expoId', async (req, res) => {
  try {
    const { expoId } = req.params;

    if (!mongoose.isValidObjectId(expoId)) {
      return res.status(400).json({
        success: false,
        error: "Identifiant d'exposition invalide."
      });
    }

    const exposition = await Exposition.findById(expoId)
      .select('_id titre');

    if (!exposition) {
      return res.status(404).json({
        success: false,
        error: "Exposition introuvable."
      });
    }

    const top = await Artwork.find({
      exposition: expoId,
      statut: { $in: STATUTS_VOTABLES }
    })
      .sort({
        votesCount: -1,
        createdAt: 1
      })
      .limit(10)
      .populate('artiste', 'nom nom_artiste ville')
      .select(
        'titre description images image categorie ville artiste votesCount azmId'
      );

    return res.json({
      success: true,
      exposition: exposition.titre,
      total: top.length,
      classement: top
    });

  } catch (error) {
    console.error('Erreur GET /api/votes/top :', error);

    return res.status(500).json({
      success: false,
      error: "Impossible de charger le classement."
    });
  }
});


/**
 * GET /api/votes/artwork/:artworkId
 *
 * Renvoie uniquement le nombre de votes.
 * L'historique nominatif n'est pas exposé publiquement.
 */
router.get('/artwork/:artworkId', async (req, res) => {
  try {
    const { artworkId } = req.params;

    if (!mongoose.isValidObjectId(artworkId)) {
      return res.status(400).json({
        success: false,
        error: "Identifiant d'œuvre invalide."
      });
    }

    const artwork = await Artwork.findById(artworkId)
      .select('titre votesCount');

    if (!artwork) {
      return res.status(404).json({
        success: false,
        error: "Œuvre introuvable."
      });
    }

    return res.json({
      success: true,
      artworkId: artwork._id,
      titre: artwork.titre,
      total_votes: artwork.votesCount || 0
    });

  } catch (error) {
    console.error('Erreur GET /api/votes/artwork :', error);

    return res.status(500).json({
      success: false,
      error: "Impossible de consulter le nombre de votes."
    });
  }
});

export default router;
