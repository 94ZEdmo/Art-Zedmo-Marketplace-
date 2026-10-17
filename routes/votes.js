import express from 'express';
import mongoose from 'mongoose';

import Vote from '../models/Vote.js';
import Artwork from '../models/Artwork.js';
import Exposition from '../models/Exposition.js';

const router = express.Router();

const STATUTS_VOTABLES = ['validee', 'en_expo'];

/**
 * POST /api/votes
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

    if (!artworkId || !mongoose.isValidObjectId(artworkId)) {
      return res.status(400).json({ success: false, error: "Un identifiant d'œuvre valide est requis." });
    }
    if (userId && !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: "L'identifiant du votant est invalide." });
    }
    if (expositionId && !mongoose.isValidObjectId(expositionId)) {
      return res.status(400).json({ success: false, error: "L'identifiant de l'exposition est invalide." });
    }

    const artwork = await Artwork.findById(artworkId).select('_id titre artiste exposition statut votesCount');
    if (!artwork) return res.status(404).json({ success: false, error: "Cette œuvre n'existe pas." });
    if (!STATUTS_VOTABLES.includes(artwork.statut)) {
      return res.status(400).json({ success: false, error: "Cette œuvre n'est pas actuellement ouverte au vote." });
    }

    let expositionPourVote = expositionId || artwork.exposition;
    if (expositionId && artwork.exposition && String(expositionId) !== String(artwork.exposition)) {
      return res.status(400).json({ success: false, error: "Cette œuvre n'appartient pas à l'exposition indiquée." });
    }
    if (expositionPourVote) {
      const exposition = await Exposition.findById(expositionPourVote);
      if (!exposition) return res.status(404).json({ success: false, error: "Exposition introuvable." });
      if (exposition.statut === 'vote_clos' || exposition.statut === 'terminee') {
        return res.status(400).json({ success: false, error: "Les votes de cette exposition sont clôturés." });
      }
      if (exposition.dateFinVote && new Date() > new Date(exposition.dateFinVote)) {
        return res.status(400).json({ success: false, error: "La période de vote est terminée." });
      }
    }

    const whatsapp = typeof votant_whatsapp === 'string' ? votant_whatsapp.trim() : '';
    const source = typeof source_lien === 'string' ? source_lien.trim().slice(0, 1000) : '';

    // =================== CORRECTION VÉRIFICATION 1 VOTE PAR ŒUVRE ===================
    // Avant de créer, on vérifie si cet utilisateur / whatsapp / IP a déjà voté CETTE œuvre
    const ip = req.ip;
    let duplicateQuery = { artwork: artwork._id };
    let hasIdentifier = false;
    
    if (userId) {
      duplicateQuery.user = userId;
      hasIdentifier = true;
    } else {
      // Pour visiteurs sans userId, on bloque par whatsapp OU ip sur la même œuvre
      const orConditions = [];
      if (whatsapp) orConditions.push({ votant_whatsapp: whatsapp });
      if (ip) orConditions.push({ votant_ip: ip });
      
      if (orConditions.length > 0) {
        duplicateQuery = { 
          artwork: artwork._id,
          $or: orConditions
        };
        hasIdentifier = true;
      }
    }

    if (hasIdentifier) {
      const dejaVote = await Vote.findOne(duplicateQuery);
      if (dejaVote) {
        return res.status(409).json({
          success: false,
          error: "Tu as déjà voté pour cette œuvre. 1 vote par personne par œuvre."
        });
      }
    }
    // =================== FIN CORRECTION ===================

    const vote = await Vote.create({
      user: userId || undefined,
      votant_whatsapp: whatsapp || undefined,
      votant_ip: req.ip,
      artwork: artwork._id,
      exposition: expositionPourVote || undefined,
      source_lien: source || (typeof req.headers.referer === 'string' ? req.headers.referer.slice(0, 1000) : '')
    });

    const updatedArtwork = await Artwork.findByIdAndUpdate(
      artwork._id,
      { $inc: { votesCount: 1 } },
      { new: true, runValidators: true }
    ).select('titre votesCount');

    if (!updatedArtwork) {
      return res.status(500).json({ success: false, error: "Le vote a été enregistré, mais le compteur n'a pas pu être actualisé." });
    }

    return res.status(201).json({
      success: true,
      message: "Vote enregistré avec succès.",
      total_votes_oeuvre: updatedArtwork.votesCount,
      voteId: vote._id
    });

  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, error: "Tu as déjà voté pour cette œuvre." });
    }
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ success: false, error: "Les informations du vote sont invalides." });
    }
    console.error('Erreur POST /api/votes :', error);
    return res.status(500).json({ success: false, error: "Une erreur est survenue pendant l'enregistrement du vote." });
  }
});

router.get('/top/:expoId', async (req, res) => {
  try {
    const { expoId } = req.params;
    if (!mongoose.isValidObjectId(expoId)) {
      return res.status(400).json({ success: false, error: "Identifiant d'exposition invalide." });
    }
    const exposition = await Exposition.findById(expoId).select('_id titre');
    if (!exposition) return res.status(404).json({ success: false, error: "Exposition introuvable." });

    const top = await Artwork.find({ exposition: expoId, statut: { $in: STATUTS_VOTABLES } })
      .sort({ votesCount: -1, createdAt: 1 })
      .limit(10)
      .populate('artiste', 'nom nom_artiste ville')
      .select('titre description images image categorie ville artiste votesCount azmId');

    return res.json({ success: true, exposition: exposition.titre, total: top.length, classement: top });
  } catch (error) {
    console.error('Erreur GET /api/votes/top :', error);
    return res.status(500).json({ success: false, error: "Impossible de charger le classement." });
  }
});

router.get('/artwork/:artworkId', async (req, res) => {
  try {
    const { artworkId } = req.params;
    if (!mongoose.isValidObjectId(artworkId)) {
      return res.status(400).json({ success: false, error: "Identifiant d'œuvre invalide." });
    }
    const artwork = await Artwork.findById(artworkId).select('titre votesCount');
    if (!artwork) return res.status(404).json({ success: false, error: "Œuvre introuvable." });

    return res.json({ success: true, artworkId: artwork._id, titre: artwork.titre, total_votes: artwork.votesCount || 0 });
  } catch (error) {
    console.error('Erreur GET /api/votes/artwork :', error);
    return res.status(500).json({ success: false, error: "Impossible de consulter le nombre de votes." });
  }
});

export default router;
