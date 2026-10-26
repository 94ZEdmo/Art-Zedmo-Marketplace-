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

async function sendEmail(to, subject, html) {
  if (!to || !process.env.BREVO_API_KEY) return false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: "ART-ZEDMO", email: "artzedmo@gmail.com" },
        to: [{ email: to }],
        subject, htmlContent: html
      })
    });
    const data = await res.json();
    if (!res.ok) { console.error('Brevo error:', data); return false; }
    return true;
  } catch (e) { console.error('Email error', e.message); return false; }
}

async function authenticateToken(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentification requise.' });
    const token = authorization.slice(7);
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch { return res.status(401).json({ error: 'Jeton invalide ou expiré.' }); }
    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) return res.status(401).json({ error: 'Identifiant invalide.' });
    const user = await User.findById(decoded.id).select('_id nom nom_artiste role statut email ville adresseReception forfait limiteOeuvres limiteNFT forfaitExpireAt totalOeuvresPubliees totalNFTPublies forfaitProStatut forfaitPriveeStatut forfaitProExpire forfaitPriveeExpire');
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
    if (user.statut !== 'valide') return res.status(403).json({ error: 'Compte non autorisé.' });
    req.user = user; req.auth = decoded; next();
  } catch (error) { next(error); }
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Opération réservée à admin.' });
  next();
}
function validObjectId(id) { return mongoose.Types.ObjectId.isValid(id); }
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
async function getNextAZM() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate({ _id: `AZM-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  if (!counter) throw new Error('Impossible de générer AZM');
  return `AZM-${year}-${String(counter.seq).padStart(6, '0')}`;
}
function escapeRegex(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// GARDE TES VRAIES ADRESSES ICI - J'AI MASQUE POUR LE FILTRE
const ADRESSES = {
  usdt_trc20: process.env.ADRESSE_USDT || 'TON_ADRESSE_USDT',
  pi: process.env.ADRESSE_PI || 'TON_ADRESSE_PI',
  mtn: process.env.ADRESSE_MTN || '+2290196587303',
  moov: process.env.ADRESSE_MOOV || '+2290194655238',
  whatsapp: '2290194655238'
};

function publicArtworkQuery() { return { statut: { $nin: ['en_attente', 'rejetee'] } }; }

router.get('/', async (req, res, next) => {
  try {
    const { tri, search, categorie, page = '1', limit = '50' } = req.query;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const filter = publicArtworkQuery();
    if (search) { const terme = String(search).trim().slice(0, 100); if (terme) filter.titre = { $regex: escapeRegex(terme), $options: 'i' }; }
    if (categorie && categorie !== 'Tous') { if (categorie.toLowerCase() === 'nft') filter.isNFT = true; else filter.categorie = String(categorie).slice(0, 100); }
    let sort = { isBoosted: -1, boostExpireAt: -1, createdAt: -1 };
    if (tri === 'populaire') sort = { isBoosted: -1, votesCount: -1, createdAt: -1 }; else if (tri === 'prix') sort = { isBoosted: -1, prix: 1, createdAt: -1 }; else if (tri === 'prix_desc') sort = { isBoosted: -1, prix: -1, createdAt: -1 };
    const [arts, total] = await Promise.all([ Artwork.find(filter).populate('artiste', 'nom nom_artiste ville').populate('expositions', 'titre statut').sort(sort).skip((pageNumber - 1) * limitNumber).limit(limitNumber), Artwork.countDocuments(filter) ]);
    return res.json({ success: true, total, page: pageNumber, limit: limitNumber, pages: Math.ceil(total / limitNumber), artworks: arts });
  } catch (error) { next(error); }
});

router.get('/admin/all', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const arts = await Artwork.find().populate('artiste', 'nom nom_artiste ville adresseReception whatsapp').populate('expositions', 'titre statut').sort({ createdAt: -1 }).limit(500);
    return res.json({ success: true, artworks: arts });
  } catch (e) { next(e); }
});

// === ROUTE DE DEBLOCAGE - AJOUTEE ===
router.post('/admin/fix-compteurs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { whatsapp } = req.body;
    let users;
    if (whatsapp) {
      const u = await User.findOne({ whatsapp });
      users = u ? [u] : [];
    } else {
      users = await User.find({});
    }
    let fixed = [];
    for (const u of users) {
      const countReel = await Artwork.countDocuments({ artiste: u._id, statut: { $nin: ['rejetee','supprime'] } });
      if (u.totalOeuvresPubliees !== countReel || u.totalOeuvres !== countReel) {
        await User.updateOne({ _id: u._id }, { $set: { totalOeuvres: countReel, totalOeuvresPubliees: countReel, totalNFTPublies: await Artwork.countDocuments({ artiste: u._id, isNFT: true, statut: { $nin: ['rejetee','supprime'] } }) } });
        fixed.push({ whatsapp: u.whatsapp, nom: u.nom_artiste, avant: u.totalOeuvresPubliees, apres: countReel });
      }
    }
    res.json({ success: true, fixed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/verifier/:code', async (req, res, next) => {
  try {
    const raw = String(req.params.code || '').trim(); if (!raw) return res.status(400).json({ error: 'Code requis.' });
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, ''); const withDash = raw.toUpperCase();
    const art = await Artwork.findOne({ $or: [ { azmId: withDash }, { azmId: { $regex: cleaned, $options: 'i' } }, { certifId: withDash }, { tokenId: withDash } ] }).populate('artiste', 'nom nom_artiste ville');
    if (!art) return res.status(404).json({ success: false, error: 'Identifiant invalide.' });
    return res.json({ success: true, artwork: art });
  } catch (e) { next(e); }
});

router.post('/verifier', async (req, res, next) => {
  try {
    const code = req.body.azmId || req.body.code || req.body.certifId; if (!code) return res.status(400).json({ error: 'Code requis.' });
    const raw = String(code).trim(); const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, ''); const withDash = raw.toUpperCase();
    const art = await Artwork.findOne({ $or: [ { azmId: withDash }, { azmId: { $regex: cleaned, $options: 'i' } }, { certifId: withDash } ] }).populate('artiste', 'nom nom_artiste ville');
    if (!art) return res.status(404).json({ success: false, error: 'Identifiant invalide.' });
    return res.json({ success: true, artwork: art });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id).populate('artiste', 'nom nom_artiste ville bio').populate('expositions', 'titre statut');
    if (!artwork) return res.status(404).json({ error: 'Œuvre non trouvée.' });
    const isPublic = !['en_attente', 'rejetee'].includes(artwork.statut);
    if (!isPublic) {
      const auth = req.headers.authorization; if (!auth?.startsWith('Bearer ')) return res.status(404).json({ error: 'Non trouvée.' });
      let decoded; try { decoded = jwt.verify(auth.slice(7), JWT_SECRET, { algorithms: ['HS256'] }); } catch { return res.status(401).json({ error: 'Jeton invalide.' }); }
      const requester = await User.findById(decoded.id).select('_id role statut');
      const ownerId = artwork.artiste?._id?.toString() || artwork.artiste?.toString();
      const isOwner = ownerId === requester?._id.toString(); const isAdmin = requester?.role === 'admin' && requester?.statut === 'valide';
      if (!requester || requester.statut !== 'valide' || (!isOwner && !isAdmin)) return res.status(404).json({ error: 'Non trouvée.' });
    }
    await Artwork.updateOne({ _id: artwork._id }, { $inc: { vues: 1 } });
    return res.json(artwork);
  } catch (e) { next(e); }
});

// === POST OEUVRE CORRIGE - ANTI-BLOCAGE ===
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { titre, description, prix, images, image, categorie, ville, isNFT, ipfsHash, imageIPFS, dimensions, technique } = req.body;
    if (typeof titre !== 'string' || !titre.trim()) return res.status(400).json({ error: 'Titre obligatoire.' });
    const prixNumber = Number(prix); if (!Number.isFinite(prixNumber) || prixNumber < 0) return res.status(400).json({ error: 'Prix invalide.' });

    const userFull = await User.findById(req.user._id);
    const isNFTFinalCheck = Boolean(isNFT) || String(categorie).toLowerCase() === 'nft';

    const filterCount = { artiste: req.user._id, statut: { $nin: ['rejetee', 'supprime'] } };
    if (isNFTFinalCheck) filterCount.isNFT = true; else filterCount.isNFT = { $ne: true };

    const countReel = await Artwork.countDocuments(filterCount);

    // Synchronise compteur bloqué à 0
    if (isNFTFinalCheck) {
      if (userFull.totalNFTPublies !== countReel) await User.findByIdAndUpdate(req.user._id, { totalNFTPublies: countReel });
    } else {
      if (userFull.totalOeuvresPubliees !== countReel) await User.findByIdAndUpdate(req.user._id, { totalOeuvresPubliees: countReel, totalOeuvres: countReel });
    }

    const limite = isNFTFinalCheck ? userFull.limiteNFT : userFull.limiteOeuvres;
    if (countReel >= limite) {
      return res.status(403).json({ error: `Limite ${limite} oeuvres max atteinte pour ${userFull.forfait}. Passe PRO (10) ou Privée (50). Actuel: ${countReel}`, forfait: userFull.forfait, limite, countActuel: countReel });
    }

    const azmId = await getNextAZM();
    const listeImages = Array.isArray(images) ? images : (typeof image === 'string' && image.trim() ? [image.trim()] : []);

    const artwork = await Artwork.create({
      titre: titre.trim(), description: typeof description === 'string' ? description.trim().slice(0, 10000) : '', prix: prixNumber, images: listeImages, categorie: categorie || 'Autre', ville: typeof ville === 'string' && ville.trim() ? ville.trim().slice(0, 100) : req.user.ville || 'Abomey-Calavi', artiste: req.user._id, statut: 'en_attente', azmId, certifId: azmId.replace('AZM','AZC'), dimensions: dimensions || '80 x 120 cm', technique: technique || categorie, isNFT: isNFTFinalCheck, blockchain: isNFTFinalCheck ? 'polygon' : undefined, ipfsHash: ipfsHash || '', imageIPFS: imageIPFS || ''
    });

    if (isNFTFinalCheck) { await User.findByIdAndUpdate(req.user._id, { $inc: { totalOeuvres: 1, totalNFTPublies: 1 } }); } else { await User.findByIdAndUpdate(req.user._id, { $inc: { totalOeuvres: 1, totalOeuvresPubliees: 1 } }); }

    return res.status(201).json({ success: true, artwork, azmId });
  } catch (e) { next(e); }
});

router.put('/:id/valider', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const statut = req.body.statut || 'validee'; 
    const artwork = await Artwork.findById(req.params.id); if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    artwork.statut = statut; await artwork.save();
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id); if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    const isOwner = artwork.artiste.toString() === req.user._id.toString(); const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorisé.' });
    const champs = ['titre', 'description', 'prix', 'images', 'categorie', 'ville', 'ipfsHash', 'imageIPFS', 'dimensions', 'technique'];
    for (const c of champs) if (req.body[c] !== undefined) artwork[c] = req.body[c];
    if (!isAdmin && ['validee'].includes(artwork.statut)) artwork.statut = 'en_attente';
    await artwork.save(); return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id); if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    const isOwner = artwork.artiste.toString() === req.user._id.toString(); const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorisé.' });
    if (artwork.statut === 'vendue') return res.status(409).json({ error: 'Vendue, suppression impossible.' });
    await Artwork.deleteOne({ _id: artwork._id }); 
    if (artwork.isNFT) { await User.findByIdAndUpdate(artwork.artiste, { $inc: { totalOeuvres: -1, totalNFTPublies: -1 } }); } else { await User.findByIdAndUpdate(artwork.artiste, { $inc: { totalOeuvres: -1, totalOeuvresPubliees: -1 } }); }
    return res.json({ success: true, message: 'Supprimée.' });
  } catch (e) { next(e); }
});

router.post('/:id/preuve-paiement', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const { preuve, method } = req.body; 
    const artwork = await Artwork.findById(req.params.id); if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    artwork.preuvesPaiement = artwork.preuvesPaiement || [];
    artwork.preuvesPaiement.push({ user: req.user._id, preuve: preuve.trim(), method: method || 'manual', date: new Date() });
    artwork.statutPaiement = 'preuve_envoyee'; await artwork.save();
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

router.post('/:id/boost', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const { preuve } = req.body;
    if (!preuve || String(preuve).trim().length < 3) return res.status(400).json({ error: 'Preuve TxID obligatoire' });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    artwork.isBoosted = true;
    artwork.boostExpireAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    artwork.boostPreuve = preuve;
    await artwork.save();
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

router.post('/:id/vendre', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const { prixVendu, typeVente, acheteurId } = req.body;
    const artwork = await Artwork.findById(req.params.id).populate('artiste');
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    const montant = Number(prixVendu);
    const type = typeVente === 'enchere' ? 'enchere' : 'galerie';
    const rate = type === 'enchere' ? 20 : 15;
    const commission = (montant * rate) / 100;
    artwork.prixVendu = montant; artwork.typeVente = type; artwork.commissionRate = rate; artwork.montantCommission = commission; artwork.montantArtiste = montant - commission; artwork.statut = 'vendue'; artwork.dateVente = new Date();
    if (acheteurId && validObjectId(acheteurId)) artwork.acheteur = acheteurId;
    await artwork.save();
    await User.findByIdAndUpdate(artwork.artiste._id, { $inc: { solde: montant - commission, totalVentes: 1 } });
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

export default router;
