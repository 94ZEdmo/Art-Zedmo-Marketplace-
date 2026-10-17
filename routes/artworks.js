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

// ================= EMAIL UTILS (PROBLÈME 6) =================
import nodemailer from 'nodemailer';
let transporter = null;
function getMailer(){
  if(transporter) return transporter;
  if(!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT||587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}
async function sendEmail(to, subject, html){
  try{
    const mailer = getMailer();
    if(!mailer || !to) return;
    await mailer.sendMail({from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html});
  }catch(e){ console.error('Email error', e.message); }
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
    const user = await User.findById(decoded.id).select('_id nom nom_artiste role statut email');
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

// ADRESSES CORRIGEES - 0194655238 PARTOUT (PROBLÈME 2)
const ADRESSES = {
  usdt_trc20: 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2',
  pi: 'GAF62KXAV7IUM3HSHQ3TI6EFMIDSGII2EVEZXFTXGMH5D2EDPA6RVAM',
  polygon: '0xZEDMO',
  mtn: '0194655238',
  moov: '0194655238',
  whatsapp: '2290194655238'
};

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
      if (categorie.toLowerCase() === 'nft') filter.isNFT = true;
      else filter.categorie = String(categorie).slice(0, 100);
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

router.get('/admin/all', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const arts = await Artwork.find().populate('artiste', 'nom nom_artiste ville').populate('expositions', 'titre statut').sort({ createdAt: -1 }).limit(500);
    return res.json({ success: true, artworks: arts });
  } catch (e) { next(e); }
});

// =================== AJOUT VÉRIFIER - CORRIGE AZM-2026-000007 ===================
// Doit être AVANT /:id sinon "verifier" est pris pour un ID
router.get('/verifier/:code', async (req, res, next) => {
  try {
    const raw = String(req.params.code || '').trim();
    if (!raw) return res.status(400).json({ error: 'Code requis.' });
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, ''); // AZM2026000007
    const withDash = raw.toUpperCase(); // AZM-2026-000007
    
    const art = await Artwork.findOne({
      $or: [
        { azmId: withDash },
        { azmId: { $regex: cleaned, $options: 'i' } },
        { azmId: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' } },
        { certifId: withDash },
        { certifId: { $regex: cleaned, $options: 'i' } },
        { tokenId: withDash }
      ]
    }).populate('artiste', 'nom nom_artiste ville').populate('expositions', 'titre');

    if (!art) {
      return res.status(404).json({ success: false, error: 'Identifiant invalide.', message: `Aucune œuvre trouvée pour ${raw}` });
    }
    return res.json({ success: true, message: 'Œuvre authentique ART-ZEDMO', artwork: art });
  } catch (e) { next(e); }
});

router.post('/verifier', async (req, res, next) => {
  try {
    const code = req.body.azmId || req.body.code || req.body.certifId;
    if (!code) return res.status(400).json({ error: 'Code requis.' });
    req.params.code = code;
    // réutilise la logique GET
    const raw = String(code).trim();
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const withDash = raw.toUpperCase();
    const art = await Artwork.findOne({
      $or: [
        { azmId: withDash },
        { azmId: { $regex: cleaned, $options: 'i' } },
        { azmId: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' } },
        { certifId: withDash },
        { certifId: { $regex: cleaned, $options: 'i' } },
        { tokenId: withDash }
      ]
    }).populate('artiste', 'nom nom_artiste ville');
    if (!art) return res.status(404).json({ success: false, error: 'Identifiant invalide.' });
    return res.json({ success: true, artwork: art });
  } catch (e) { next(e); }
});
// =================== FIN AJOUT VÉRIFIER ===================

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

// CRÉER - NFT POLYGON + IPFS + POURCENTAGES (PROBLÈMES 4 ET 5)
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { titre, description, prix, images, image, categorie, ville, isNFT, blockchain, ipfsHash, imageIPFS, dimensions, technique } = req.body;
    if (typeof titre !== 'string' || !titre.trim()) return res.status(400).json({ error: 'Titre obligatoire.' });
    const prixNumber = Number(prix);
    if (!Number.isFinite(prixNumber) || prixNumber < 0) return res.status(400).json({ error: 'Prix invalide.' });
    if (titre.trim().length > 200) return res.status(400).json({ error: 'Titre trop long.' });
    const categoriesAutorisees = ['Peinture', 'Sculpture', 'Dessin', 'Photographie', 'Art numérique', 'Artisanat', 'NFT', 'Autre', 'peinture','sculpture','dessin','photographie','artisanat','nft','autre'];
    const categorieFinale = categoriesAutorisees.includes(categorie) ? categorie : 'Autre';
    let listeImages = [];
    if (Array.isArray(images)) listeImages = images;
    else if (typeof image === 'string' && image.trim()) listeImages = [image.trim()];
    if (listeImages.length > 10 || listeImages.some(i => typeof i !== 'string' || i.length > 2048)) {
      return res.status(400).json({ error: 'Images invalides.' });
    }
    const azmId = await getNextAZM();
    const isNFTFinal = Boolean(isNFT) || String(categorieFinale).toLowerCase() === 'nft';
    const blockchainFinal = isNFTFinal ? 'polygon' : undefined;

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
      certifId: azmId.replace('AZM','AZC'),
      dimensions: dimensions || '80 x 120 cm',
      technique: technique || categorieFinale,
      isNFT: isNFTFinal,
      blockchain: blockchainFinal,
      blockchainMinted: false,
      ipfsHash: ipfsHash || '',
      imageIPFS: imageIPFS || '',
      royalties: isNFTFinal ? {
        primaire: { artiste: 85, plateforme: 15 },
        secondaire: { vendeur: 85, artiste: 10, plateforme: 5 }
      } : undefined,
      expositions: [],
      isEnExpoActuelle: false
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { totalOeuvres: 1 } });

    if(req.user.email){
      sendEmail(req.user.email, `Œuvre reçue ${azmId}`, `<p>Bonjour ${req.user.nom}, ton œuvre <b>${titre}</b> est en attente de validation. Certificat: ${artwork.certifId}. IPFS: ${ipfsHash||'en cours'}. NFT: ${isNFTFinal?'Polygon avec 85% artiste / 15% plateforme':''}</p>`);
    }

    return res.status(201).json({
      success: true,
      message: isNFTFinal ? 'NFT enregistré en galerie. Fixé IPFS, mint Polygon requis. Royalties 85/15 primaire, 85/10/5 secondaire.' : 'Œuvre enregistrée pour validation.',
      artwork, azmId
    });
  } catch (e) { next(e); }
});

// VALIDER + MINT SIMULATION POLYGON
router.put('/:id/valider', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const statut = req.body.statut || 'validee';
    if (!['validee', 'rejetee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
    const artwork = await Artwork.findById(req.params.id).populate('artiste');
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    if (artwork.statut !== 'en_attente') return res.status(409).json({ error: 'Déjà traitée.' });
    artwork.statut = statut;

    if(statut==='validee' && artwork.isNFT){
      artwork.blockchain = 'polygon';
      artwork.blockchainMinted = true;
      artwork.tokenId = `POL-${artwork.azmId}-${Date.now()}`;
      artwork.contractAddress = process.env.POLYGON_CONTRACT || '0xZEDMO_CONTRACT';
    }

    await artwork.save();

    if(statut==='validee' && artwork.artiste?.email){
      sendEmail(artwork.artiste.email, `Œuvre validée ${artwork.azmId}`, `<p>Ton œuvre ${artwork.titre} est validée. Certificat ${artwork.certifId}. ${artwork.isNFT?'Mint Polygon effectué, royalties 85% artiste.':''} WhatsApp: 0194655238</p>`);
    }

    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Non trouvée.' });
    const isOwner = artwork.artiste.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorisé.' });
    const champs = ['titre', 'description', 'prix', 'images', 'categorie', 'ville', 'ipfsHash', 'imageIPFS', 'dimensions', 'technique'];
    for (const c of champs) if (req.body[c] !== undefined) artwork[c] = req.body[c];
    if (!isAdmin && ['validee'].includes(artwork.statut)) artwork.statut = 'en_attente';
    await artwork.save();
    return res.json({ success: true, artwork });
  } catch (e) { next(e); }
});

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

router.post('/:id/preuve-paiement', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const { preuve, method } = req.body;
    if (!preuve || typeof preuve !== 'string' || preuve.trim().length < 3) return res.status(400).json({ error: 'Preuve requise.' });
    const artwork = await Artwork.findById(req.params.id).populate('artiste');
    if (!artwork) return res.status(404).json({ error: 'Œuvre non trouvée.' });
    if (artwork.statut === 'vendue') return res.status(409).json({ error: 'Déjà vendue.' });
    artwork.preuvesPaiement = artwork.preuvesPaiement || [];
    artwork.preuvesPaiement.push({ user: req.user._id, preuve: preuve.trim().slice(0, 2000), method: method || 'manual', adressesUtilisees: ADRESSES, date: new Date() });
    artwork.statutPaiement = 'preuve_envoyee';
    await artwork.save();

    sendEmail(process.env.ADMIN_EMAIL, `Preuve paiement ${artwork.azmId}`, `<p>Preuve de ${req.user.nom} pour ${artwork.titre}: ${preuve}. Vérifier sur 0194655238</p>`);

    return res.json({ success: true, message: `Preuve reçue. Admin va vérifier sur ${ADRESSES.mtn} / ${ADRESSES.moov} / ${ADRESSES.usdt_trc20} et valider. WhatsApp 0194655238`, artwork });
  } catch (e) { next(e); }
});

router.post('/:id/vote', (req, res) => { return res.status(410).json({ error: 'Route désactivée, utilisez /api/votes.' }); });

export default router;
