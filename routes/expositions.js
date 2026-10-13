import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Exposition from '../models/Exposition.js';
import Artwork from '../models/Artwork.js';
import Enchere from '../models/Enchere.js';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const STATUTS_OEUVRE_VOTABLES = ['validee', 'en_expo'];
const STATUTS_EXPOSITION_PUBLIQUES = ['a_venir', 'soumission', 'active', 'vote', 'vote_clos', 'enchere', 'terminee'];

//... GARDE TON authenticateToken et requireAdmin IDENTIQUE...
async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentification requise.' });
  }
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    return res.status(500).json({ success: false, error: 'Configuration de sécurité indisponible.' });
  }
  try {
    const token = authorization.slice(7);
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.id &&!payload._id) {
      return res.status(401).json({ success: false, error: 'Jeton invalide.' });
    }
    const userId = payload.id || payload._id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(401).json({ success: false, error: 'Identifiant utilisateur invalide.' });
    }
    const user = await User.findById(userId).select('_id role statut');
    if (!user || user.statut!== 'valide') {
      return res.status(403).json({ success: false, error: 'Compte absent, inactif ou non validé.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Jeton invalide ou expiré.' });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.role!== 'admin') {
    return res.status(403).json({ success: false, error: 'Accès réservé à l’administrateur.' });
  }
  next();
}
function validObjectId(id) { return mongoose.isValidObjectId(id); }

/* 1. LISTE DES EXPOSITIONS */
router.get('/', async (req, res) => {
  try {
    const expositions = await Exposition.find({ statut: { $in: STATUTS_EXPOSITION_PUBLIQUES } })
     .populate({ path: 'oeuvres', match: { statut: { $in: ['validee', 'en_expo', 'en_enchere', 'vendue'] } }, populate: { path: 'artiste', select: 'nom nom_artiste ville avatar' } })
     .sort({ dateDebut: -1 }).limit(100);
    return res.json(expositions);
  } catch (error) {
    console.error('Erreur GET expositions :', error);
    return res.status(500).json({ success: false, error: 'Impossible de charger les expositions.' });
  }
});

/* 2. EXPOSITION ACTIVE */
router.get('/active', async (req, res) => {
  try {
    const expo = await Exposition.findOne({ statut: { $in: ['soumission', 'active', 'vote', 'vote_clos', 'enchere'] } })
     .populate({ path: 'oeuvres', match: { statut: { $in: ['validee', 'en_expo', 'en_enchere'] } }, populate: { path: 'artiste', select: 'nom nom_artiste ville avatar' }, options: { sort: { votesCount: -1 } } })
     .sort({ dateDebut: -1 });
    if (!expo) { return res.json({ message: 'Pas d’exposition active.', oeuvres: [] }); }
    return res.json(expo);
  } catch (error) {
    console.error('Erreur exposition active :', error);
    return res.status(500).json({ success: false, error: 'Impossible de charger l’exposition active.' });
  }
});

/* 3. CRÉER UNE EXPOSITION - CORRIGÉ AVEC TES NOUVELLES DATES */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { titre, description, dateDebut, dateFin, dateFinVote, dateDebutSoumission, dateFinSoumission, dateDebutVote, lieu, image, regles } = req.body || {};
    if (typeof titre!== 'string' || titre.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Le titre doit comporter au moins 3 caractères.' });
    }
    const debut = dateDebut? new Date(dateDebut) : new Date();
    const fin = dateFin? new Date(dateFin) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const finVote = dateFinVote? new Date(dateFinVote) : new Date(debut.getTime() + 27 * 24 * 60 * 60 * 1000);

    const expo = await Exposition.create({
      titre: titre.trim(), description, dateDebut: debut, dateFin: fin, dateFinVote: finVote,
      dateDebutSoumission: dateDebutSoumission? new Date(dateDebutSoumission) : debut,
      dateFinSoumission: dateFinSoumission? new Date(dateFinSoumission) : new Date(debut.getTime() + 7*24*60*60*1000),
      dateDebutVote: dateDebutVote? new Date(dateDebutVote) : new Date(debut.getTime() + 8*24*60*60*1000),
      lieu, image, statut: 'soumission', regles
    });
    return res.status(201).json({ success: true, message: 'Exposition créée.', exposition: expo });
  } catch (error) {
    console.error('Erreur création exposition :', error);
    return res.status(500).json({ success: false, error: 'Impossible de créer l’exposition.' });
  }
});

/* =====================================================
   4. AJOUTER UNE ŒUVRE - CORRIGÉ : RESTE EN GALERIE
===================================================== */
router.post('/:id/add-artwork', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { artworkId } = req.body || {};
    if (!validObjectId(id) ||!validObjectId(artworkId)) {
      return res.status(400).json({ success: false, error: 'Identifiant d’exposition ou d’œuvre invalide.' });
    }
    const expo = await Exposition.findById(id);
    if (!expo) { return res.status(404).json({ success: false, error: 'Exposition introuvable.' }); }
    if (!['a_venir', 'soumission', 'active'].includes(expo.statut)) {
      return res.status(400).json({ success: false, error: 'Cette exposition ne peut plus recevoir d’œuvres. Statut: ' + expo.statut });
    }
    const art = await Artwork.findById(artworkId);
    if (!art) { return res.status(404).json({ success: false, error: 'Œuvre introuvable.' }); }
    if (!['validee'].includes(art.statut)) { // ON ACCEPTE SEULEMENT VALIDEES DE LA GALERIE
      return res.status(400).json({ success: false, error: 'Seules les œuvres validées de la galerie peuvent être exposées.' });
    }

    // CORRECTION ESSENTIELLE : On ne change PAS le statut!
    // L'œuvre RESTE en galerie (validee)
    if (!art.expositions) art.expositions = [];
    if (!art.expositions.some(e => String(e) === String(expo._id))) {
      art.expositions.push(expo._id);
    }
    art.isEnExpoActuelle = true;
    // art.statut reste 'validee' pour rester en galerie
    await art.save();

    if (!expo.oeuvres.some(oid => String(oid) === String(art._id))) {
      expo.oeuvres.push(art._id);
    }
    // Ajoute aussi en candidature acceptée
    if (!expo.candidatures.some(c => String(c.artwork) === String(art._id))) {
      expo.candidatures.push({ artwork: art._id, artiste: art.artiste, statut: 'acceptee' });
    }
    await expo.save();

    const baseUrl = (process.env.FRONTEND_URL || 'https://art-zedmo.com').split(',')[0].trim().replace(/\/+$/, '');
    const lienVote = `${baseUrl}/expo/vote/${art._id}`;

    return res.json({
      success: true,
      message: 'Œuvre ajoutée à l’exposition (reste en galerie).',
      art,
      lien_viral: art.lien_vote_unique || lienVote,
      lien_vote: lienVote,
    });
  } catch (error) {
    console.error('Erreur ajout œuvre :', error);
    return res.status(500).json({ success: false, error: 'Impossible d’ajouter cette œuvre.' });
  }
});

/* =====================================================
   5. NOUVEAU : SOUMISSION PAR ARTISTE
   POST /api/expositions/:id/soumettre
===================================================== */
router.post('/:id/soumettre', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { artworkId } = req.body || {};
    if (!validObjectId(id) ||!validObjectId(artworkId)) {
      return res.status(400).json({ success: false, error: 'IDs invalides.' });
    }
    const expo = await Exposition.findById(id);
    if (!expo || expo.statut!== 'soumission') {
      return res.status(400).json({ success: false, error: 'Exposition non ouverte aux soumissions.' });
    }
    const art = await Artwork.findById(artworkId);
    if (!art || String(art.artiste)!== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Vous n’êtes pas propriétaire de cette œuvre.' });
    }
    // Vérifie si déjà soumise
    if (expo.candidatures.some(c => String(c.artwork) === String(artworkId))) {
      return res.status(409).json({ success: false, error: 'Déjà soumise.' });
    }
    expo.candidatures.push({ artwork: artworkId, artiste: req.user._id, statut: 'en_attente' });
    await expo.save();
    return res.json({ success: true, message: 'Candidature soumise, en attente de validation admin.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Erreur soumission.' });
  }
});

/* 6. TOP 10 ET ENCHÈRES - INCHANGÉ POUR TOI */
router.post('/:id/calculer-top-et-encherir', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) { return res.status(400).json({ success: false, error: 'ID invalide.' }); }
    const expo = await Exposition.findById(id);
    if (!expo) { return res.status(404).json({ success: false, error: 'Exposition introuvable.' }); }
    const dateFin = req.body?.dateFin? new Date(req.body.dateFin) : new Date(Date.now() + 3*24*60*60*1000);
    // On prend les œuvres les plus votées de cette expo
    const top10 = await Artwork.find({ expositions: expo._id, statut: 'validee' }).sort({ votesCount: -1, createdAt: 1 }).limit(expo.regles?.topPourEnchere || 10);
    if (top10.length === 0) { return res.status(400).json({ success: false, error: 'Aucune œuvre à mettre aux enchères.' }); }
    const resultats = [];
    for (const art of top10) {
      let enchere = await Enchere.findOne({ artwork: art._id, statut: 'en_cours' });
      if (!enchere) {
        enchere = await Enchere.create({ artwork: art._id, titre: art.titre, exposition: expo._id, prixDepart: art.prix, enchereActuelle: Math.round(art.prix * 2), dateFin });
      }
      art.statut = 'en_enchere'; // Là seulement elle quitte la galerie
      await art.save();
      resultats.push({ artworkId: art._id, titre: art.titre, enchereId: enchere._id, dateFin: enchere.dateFin });
    }
    expo.oeuvres_top = top10.map(a => a._id);
    expo.statut = 'enchere';
    await expo.save();
    return res.json({ success: true, message: 'Enchères lancées.', nombreOeuvresClassees: top10.length, dateFin, top: top10, resultats });
  } catch (error) {
    console.error('Erreur calcul Top 10 :', error);
    return res.status(500).json({ success: false, error: 'Impossible de calculer.' });
  }
});

export default router;
