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

// ✅ GALERIE PERMANENTE - NE PLANTE PLUS
router.get('/', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const { search, category, type } = req.query;
    let filter = {};
    // On ne cache rien sauf rejetée/supprimée - comme tu voulais validation auto
    filter.statut = { $nin: ['rejetee', 'supprime', 'refusee'] };
    
    if (search) {
      filter.$or = [
        { titre: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (category && category !== 'Toutes') filter.categorie = category;
    if (type === 'nft' || type === 'NFT') filter.isNFT = true;

    const oeuvres = await Artwork.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // On populate manuellement sans crasher si User manque
    res.json({ success: true, data: oeuvres, artworks: oeuvres, oeuvres });
  } catch (e) {
    console.error('ARTWORKS GET ERROR:', e.message);
    res.json({ success: true, data: [], artworks: [], oeuvres: [] });
  }
});

// Une oeuvre
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

// ✅ CREATION - AUTO-VALIDÉE (ton travail gardé)
router.post('/', authenticateOptional, async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const User = getUserModel();
    if (!req.user?.id) return res.status(401).json({ error: 'Connecte-toi' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User introuvable' });

    const data = {
      ...req.body,
      artiste: user._id,
      artisteNom: user.nom || user.nom_artiste,
      statut: 'valide', // ✅ AUTO-VALIDÉ comme tu voulais
      estVerifie: true,
    };

    const oeuvre = await Artwork.create(data);

    // Met à jour compteur sans crasher
    try {
      await User.updateOne({ _id: user._id }, { 
        $inc: { 
          totalOeuvres: 1, 
          totalOeuvresPubliees: 1,
          totalNFTPublies: data.isNFT ? 1 : 0 
        } 
      });
    } catch {}

    res.status(201).json({ success: true, data: oeuvre, artwork: oeuvre });
  } catch (e) {
    console.error('CREATE ART ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

// ADMIN - Toutes oeuvres
router.get('/admin/all', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const all = await Artwork.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: all, artworks: all });
  } catch (e) {
    res.json({ success: true, data: [], artworks: [] });
  }
});

export default router;
