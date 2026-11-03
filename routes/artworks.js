import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const router = express.Router();

function getArtworkModel() {
  try { return mongoose.model('Artwork'); } 
  catch { return mongoose.models.Artwork; }
}
function getUserModel() {
  try { return mongoose.model('User'); }
  catch { return mongoose.models.User; }
}

function authenticateOptional(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const token = auth.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.user.id = String(decoded.id || decoded._id);
    } catch {}
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'Non connecte' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  next();
}

// GALERIE
router.get('/', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const { search, category, type } = req.query;
    let filter = { statut: { $nin: ['rejetee', 'supprime', 'refusee'] } };
    if (search) filter.$or = [{ titre: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
    if (category && category !== 'Toutes') filter.categorie = category;
    if (type === 'nft' || type === 'NFT') filter.isNFT = true;
    const oeuvres = await Artwork.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, data: oeuvres, artworks: oeuvres, oeuvres });
  } catch (e) {
    res.json({ success: true, data: [], artworks: [], oeuvres: [] });
  }
});

// ADMIN ALL - METTRE AVANT /:id
router.get('/admin/all', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const all = await Artwork.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: all, artworks: all });
  } catch (e) {
    res.json({ success: true, data: [], artworks: [] });
  }
});

// === DELETE - METTRE AVANT GET /:id C'EST LA CLÉ ===
router.delete('/:id', authenticateOptional, requireAdmin, async (req, res) => {
  try {
    console.log('DELETE OEUVRE DEMANDE:', req.params.id);
    const Artwork = getArtworkModel();
    const deleted = await Artwork.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Oeuvre non trouvee' });
    console.log('OEUVRE SUPPRIMEE OK:', req.params.id);
    res.json({ success: true, message: 'Oeuvre supprimee' });
  } catch (e) {
    console.log('DELETE ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET UNE OEUVRE - TOUJOURS APRES DELETE ET ADMIN/ALL
router.get('/:id', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const art = await Artwork.findById(req.params.id).lean();
    if (!art) return res.status(404).json({ error: 'Introuvable' });
    res.json({ success: true, data: art, artwork: art });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authenticateOptional, async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const User = getUserModel();
    if (!req.user?.id) return res.status(401).json({ error: 'Connecte-toi' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User introuvable' });
    const data = { ...req.body, artiste: user._id, artisteNom: user.nom || user.nom_artiste, statut: 'valide', estVerifie: true };
    const oeuvre = await Artwork.create(data);
    try { await User.updateOne({ _id: user._id }, { $inc: { totalOeuvres: 1, totalOeuvresPubliees: 1, totalNFTPublies: data.isNFT ? 1 : 0 } }); } catch {}
    res.status(201).json({ success: true, data: oeuvre, artwork: oeuvre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
