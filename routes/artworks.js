import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Artwork from '../models/Artwork.js';
import User from '../models/User.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET doit être configuré avec au moins 32 caractères.');
}

// AUTH
async function authenticateToken(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }
    const token = authorization.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
    }
    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({ error: 'Identifiant invalide.' });
    }
    const user = await User.findById(decoded.id).select('_id nom nom_artiste role statut');
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
    if (user.statut !== 'valide') return res.status(403).json({ error: 'Compte non autorisé.' });
    req.user = user;
    req.auth = decoded;
    next();
  } catch (error) { next(error); }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Opération réservée à admin.' });
  }
  next();
}

function validObjectId(id) { return mongoose.Types.ObjectId.isValid(id); }

// AZM ID
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
async function getNextAZM() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `AZM-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  if (!counter) throw new Error('Impossible de générer AZM');
  return `AZM-${year}-${String(counter.seq).padStart(6, '0')}`;
}

function escapeRegex(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// TES ADRESSES PAIEMENT RÉELLES
const ADRESSES = {
  usdt_trc20: 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2',
  pi: 'GAF62KXAV7IUM3HSHQ3TI6EFMIDSGII2EVEZXFTXGMH5D2EDPA6RVAM',
  mtn: '0196587303',
  moov: '0194655238'
};

// CORRIGÉ : galerie montre tout sauf en_attente / rejetee
// Donc une œuvre validee qui est en expo RESTE en galerie
function publicArtworkQuery() {
  return { statut: { $nin: ['en_attente', 'rejetee'] } };
}

// LISTE PUBLIQUE
router.get('/', async (req, res, next) => {
  try {
    const { tri, search, categorie, page = '1', limit = '50' } = req.query;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const filter = publicArtworkQuery();

    if (search) {
      const terme = String(search).trim().slice(0, 100);
      if (terme) filter.titre = { $regex: escapeRegex(terme), $options: 'i' };
    }
    if (categorie && categorie !== 'Tous') {
      if (categorie.toLowerCase() === 'nft') {
        filter.isNFT = true;
      } else {
        filter.categorie = String(categorie).slice(0, 100);
      }
    }
    let sort = { createdAt: -1 };
    if (tri === 'populaire') sort = { votesCount: -1, createdAt: -1 };
    else if (tri === 'prix') sort = { prix: 1, createdAt: -1 };
    else if (tri === 'prix_desc') sort = { prix: -1, createdAt: -1 };

    const [arts, total] = await Promise.all([
      Artwork.find(filter).populate('artiste', 'nom nom_artiste ville').populate('expositions', 'titre statut').sort(sort).skip((pageNumber - 1) * limitNumber).limit(limitNumber),
      Artwork.countDocuments(filter)
    ]);
    return res.json({ success: true, total, page: pageNumber, limit: limitNumber, pages: Math.ceil(total / limitNumber), artworks: arts });
  } catch (error) { next(error); }
});

// ADMIN ALL
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const arts = await Artwork.find().populate('artiste', 'nom nom_artiste ville').populate('expositions', 'titre statut').sort({ createdAt: -1 }).limit(500);
    return res.json({ success: true, artworks: arts });
  } catch (e) { next(e); }
});

// DETAIL
router.get('/:id', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id).populate('artiste', 'nom nom_artiste ville bio').populate('exposition', 'titre').populate('expositions', 'titre statut');
    if (!artwork) return res.status(404).json({ error: 'Œuvre non trouvée.' });
    const isPublic = !['en_attente', 'rejetee'].includes(artwork.statut);
    if (!isPublic) {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) return res.status(404).json({ error: 'Non trouvée.' });
      let decoded; try { decoded = jwt.verify(auth.slice(7), JWT_SECRET, { algorithms: ['HS256'] }); } catch { return res.status(401).json({ error: 'Jeton invalide.' }); }
      const requester = await User.findById(decoded.id).select('_id role statut');
      const ownerId = artwork.artiste?._id?.toString() || artwork.artiste?.toString();
      const isOwner = ownerId === requester?._id.toString();
      const isAdmin = requester?.role === 'admin' && requester?.statut === 'valide';
      if (!requester || requester.statut !== 'valide' || (!isOwner && !isAdmin)) return res.status(404).json({ error: 'Non trouvée.' });
    }
    await Artwork.updateOne({ _id: artwork._id }, { $inc: { vues: 1 } });
    artwork.vues = (artwork.vues || 0) + 1;
    return res.json(artwork);
  } catch (e) { next(e); }
});

// CRÉER - AVEC NFT PI
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { titre, description, prix, images, image, categorie, ville, isNFT, blockchain } = req.body;
    if (typeof titre !== 'string' || !titre.trim()) return res.status(400).json({ error: 'Titre obligatoire.' });
    const prixNumber = Number(prix);
    if (!Number.isFinite(prixNumber) || prixNumber < 0) return res.status(400).json({ error: 'Prix invalide.' });
    if (titre.trim().length > 200) return res.status(400).json({ error: 'Titre trop long.' });

    const categoriesAutorisees = ['Peinture', 'Sculpture', 'Dessin', 'Photographie', 'Art numérique', 'Artisanat', 'NFT', 'Autre'];
    const categorieFinale = categoriesAutorisees.includes(categorie) ? categorie : 'Autre';

    let listeImages = [];
    if (Array.isArray(images)) listeImages = images;
    else if (typeof image === 'string' && image.trim()) listeImages = [image.trim()];
    if (listeImages.length > 10 || listeImages.some(i => typeof i !== 'string' || i.length > 2048)) {
      return res.status(400).json({ error: 'Images invalides.' });
    }

    const azmId = await getNextAZM();

    // NFT : on marque isNFT true mais blockchainMinted false tant que pas minté réellement sur Pi
    const isNFTFinal = Boolean(isNFT) || categorieFinale === 'NFT';
    const blockchainFinal = isNFTFinal ? (blockchain === 'pi' ? 'pi' : 'pi') : undefined;

    const artwork = await Artwork.create({
      titre: titre.trim(),
      description: typeof description === 'string' ? description.trim().slice(0, 10000) : '',
      prix: prixNumber,
      images: listeImages,
      categorie: categorieFinale,
      ville: typeof ville === 'string' && ville.trim() ? ville.trim().slice(0, 100) : req.user.ville || 'Abomey-Calavi',
      artiste: req.user._id,
      statut: 'en_attente',
      azmId,
      isNFT: isNFTFinal,
      blockchain: blockchainFinal,
      blockchainMinted: false, // IMPORTANT : pas authentique tant que pas minté
      expositions: [],
      isEnExpoActuelle: false
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { totalOeuvres: 1 } });

    return res.status(201).json({
      success: true,
      message: isNFTFinal ? 'NFT enregistré en galerie. Mint réel sur Pi requis pour authenticité.' : 'Œuvre enregistrée pour validation.',
      artwork, azmId
    });
  } catch (e) { next(e); }
});

// VALIDER
router.put('/:id/valider', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const statut = req.body.statut || 'validee';
    if (!['validee', 'rejetee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    if (artwork.statut !== 'en_attente') return res.status(409).json({ error: 'Déjà traitée.' });
    artwork.statut = statut;
    await artwork.save();
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

// MODIFIER
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    const isOwner = artwork.artiste.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorisé.' });
    const champs = ['titre', 'description', 'prix', 'images', 'categorie', 'ville'];
    for (const c of champs) if (req.body[c] !== undefined) artwork[c] = req.body[c];
    if (!isAdmin && ['validee'].includes(artwork.statut)) artwork.statut = 'en_attente';
    await artwork.save();
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

// SUPPRIMER
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    const isOwner = artwork.artiste.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorisé.' });
    if (artwork.statut === 'vendue') return res.status(409).json({ error: 'Vendue, suppression impossible.' });
    await Artwork.deleteOne({ _id: artwork._id });
    await User.findByIdAndUpdate(artwork.artiste, { $inc: { totalOeuvres: -1 } });
    return res.json({ success: true, message: 'Supprimée.' });
  } catch (e) { next(e); }
});

// PREUVE DE PAIEMENT AVEC TES ADRESSES
router.post('/:id/preuve-paiement', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const { preuve, method } = req.body;
    if (!preuve || typeof preuve !== 'string' || preuve.trim().length < 3) {
      return res.status(400).json({ error: 'Preuve requise.' });
    }
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Œuvre non trouvée.' });
    if (artwork.statut === 'vendue') return res.status(409).json({ error: 'Déjà vendue.' });

    artwork.preuvesPaiement = artwork.preuvesPaiement || [];
    artwork.preuvesPaiement.push({
      user: req.user._id,
      preuve: preuve.trim().slice(0, 2000),
      method: method || 'manual',
      adressesUtilisees: ADRESSES,
      date: new Date()
    });
    // On ne marque pas vendue directement, admin doit valider
    artwork.statutPaiement = 'preuve_envoyee';
    await artwork.save();

    return res.json({
      success: true,
      message: `Preuve reçue. Admin va vérifier le paiement sur ${ADRESSES.mtn} / ${ADRESSES.moov} / ${ADRESSES.usdt_trc20} / Pi ${ADRESSES.pi} et valider.`,
      artwork
    });
  } catch (e) { next(e); }
});

// ANCIENNE ROUTE VOTE DÉSACTIVÉE
router.post('/:id/vote', (req, res) => {
  return res.status(410).json({ error: 'Route désactivée, utilisez /api/votes.' });
});

export default router;
