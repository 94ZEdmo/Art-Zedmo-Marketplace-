import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import GaleriePrivee from '../models/GaleriePrivee.js';
import Artwork from '../models/Artwork.js';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth requise' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.statut !== 'valide') return res.status(403).json({ error: 'Non autorisé' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Token invalide' }); }
}

// CREER SA GALERIE PRIVEE - UNIQUEMENT SI FORFAIT galerie_privee PAYE
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    if (req.user.forfait !== 'galerie_privee') {
      return res.status(403).json({ error: 'Galerie Privée réservée au forfait Galerie Privée à 50 USD (30.000 FCFA). Achetable même avec 0 œuvre.' });
    }
    const existe = await GaleriePrivee.findOne({ proprietaire: req.user._id });
    if (existe) return res.json({ success: true, galerie: existe, message: 'Tu as déjà ta galerie privée' });

    const { nomGalerie, description, banniere, logo } = req.body;
    const galerie = await GaleriePrivee.create({
      proprietaire: req.user._id,
      nomGalerie: nomGalerie || `Galerie de ${req.user.nom_artiste}`,
      description: description || '',
      banniere: banniere || '',
      logo: logo || '',
      whatsapp: req.user.whatsapp
    });
    return res.status(201).json({ success: true, message: 'Galerie Privée créée ! Lien: /galerie-privee/' + galerie.slug, galerie });
  } catch (e) { next(e); }
});

// VOIR UNE GALERIE PRIVEE PUBLIQUE PAR SLUG
router.get('/:slug', async (req, res, next) => {
  try {
    const galerie = await GaleriePrivee.findOne({ slug: req.params.slug, isActive: true }).populate('proprietaire', 'nom nom_artiste ville avatar');
    if (!galerie) return res.status(404).json({ error: 'Galerie privée introuvable' });
    
    const oeuvres = await Artwork.find({ artiste: galerie.proprietaire._id, statut: { $nin: ['en_attente','rejetee'] } }).sort({ isBoosted: -1, createdAt: -1 }).limit(100);
    
    await GaleriePrivee.updateOne({ _id: galerie._id }, { $inc: { vues: 1 } });
    
    return res.json({ success: true, galerie, artworks: oeuvres, total: oeuvres.length });
  } catch (e) { next(e); }
});

// MA GALERIE PRIVEE (pour le proprio)
router.get('/me/mine', authenticateToken, async (req, res, next) => {
  try {
    const galerie = await GaleriePrivee.findOne({ proprietaire: req.user._id });
    if (!galerie) return res.status(404).json({ error: 'Pas encore de galerie privée. Crée-la !' });
    const oeuvres = await Artwork.find({ artiste: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, galerie, artworks: oeuvres });
  } catch (e) { next(e); }
});

// LISTE TOUTES LES GALERIES PRIVEES (pour page d'accueil)
router.get('/', async (req, res, next) => {
  try {
    const galeries = await GaleriePrivee.find({ isActive: true }).populate('proprietaire', 'nom nom_artiste').sort({ createdAt: -1 }).limit(20);
    return res.json({ success: true, galeries });
  } catch (e) { next(e); }
});

export default router;
