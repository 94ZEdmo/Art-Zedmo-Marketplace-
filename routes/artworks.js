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

// GALERIE - AVEC NOM ARTISTE
router.get('/', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const User = getUserModel();
    const { search, category, type } = req.query;
    let filter = { statut: { $nin: ['rejetee', 'supprime', 'refusee'] } };
    if (search) filter.$or = [{ titre: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
    if (category && category !== 'Toutes') filter.categorie = category;
    if (type === 'nft' || type === 'NFT') filter.isNFT = true;

    let oeuvres = await Artwork.find(filter)
      .populate('artiste', 'nom nom_artiste')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .catch(async () => await Artwork.find(filter).sort({ createdAt: -1 }).limit(200).lean());

    oeuvres = await Promise.all(oeuvres.map(async (o) => {
      if (o.artisteNom) return o;
      if (o.artiste && typeof o.artiste === 'object') {
        o.artisteNom = o.artiste.nom_artiste || o.artiste.nom || 'Artiste';
        return o;
      }
      if (o.artiste) {
        try {
          const u = await User.findById(o.artiste).select('nom nom_artiste').lean();
          if (u) o.artisteNom = u.nom_artiste || u.nom;
        } catch {}
      }
      if (!o.artisteNom) o.artisteNom = 'Artiste';
      return o;
    }));

    res.json({ success: true, data: oeuvres, artworks: oeuvres, oeuvres });
  } catch (e) {
    console.error(e);
    res.json({ success: true, data: [], artworks: [], oeuvres: [] });
  }
});

router.get('/admin/all', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    const all = await Artwork.find().populate('artiste', 'nom nom_artiste').sort({ createdAt: -1 }).lean()
      .catch(async () => await Artwork.find().sort({ createdAt: -1 }).lean());
    res.json({ success: true, data: all, artworks: all });
  } catch (e) {
    res.json({ success: true, data: [], artworks: [] });
  }
});

// DELETE AVANT /:id
router.delete('/:id', authenticateOptional, requireAdmin, async (req, res) => {
  try {
    console.log('DELETE OEUVRE:', req.params.id);
    const Artwork = getArtworkModel();
    const deleted = await Artwork.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Oeuvre non trouvee' });
    res.json({ success: true, message: 'Oeuvre supprimee' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const Artwork = getArtworkModel();
    let art = await Artwork.findById(req.params.id).populate('artiste', 'nom nom_artiste ville').lean()
      .catch(async () => await Artwork.findById(req.params.id).lean());
    if (!art) return res.status(404).json({ error: 'Introuvable' });
    if (!art.artisteNom && art.artiste?.nom) art.artisteNom = art.artiste.nom_artiste || art.artiste.nom;
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
    const data = { ...req.body, artiste: user._id, artisteNom: user.nom_artiste || user.nom, statut: 'valide', estVerifie: true };
    const oeuvre = await Artwork.create(data);
    try { await User.updateOne({ _id: user._id }, { $inc: { totalOeuvres: 1, totalOeuvresPubliees: 1, totalNFTPublies: data.isNFT ? 1 : 0 } }); } catch {}

    // ===== EMAIL BREVO APRES PUBLICATION - CORRIGE =====
    if (user.email && process.env.BREVO_API_KEY) {
      try {
        const rBrevo = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
          body: JSON.stringify({
            sender: { email: 'artzedmo@gmail.com', name: 'ART-ZEDMO' },
            to: [{ email: user.email, name: user.nom_artiste || user.nom }],
            subject: 'Œuvre publiée - ART-ZEDMO',
            htmlContent: `<div style="font-family:Arial;padding:20px;background:#111;color:#fff;border-radius:12px"><h2 style="color:#d4af37">ART-ZEDMO MARKETPLACE</h2><p>Bonjour ${user.nom_artiste || user.nom},</p><p>Votre œuvre "<strong>${oeuvre.titre || ''}</strong>" a été publiée avec succès dans la galerie ART-ZEDMO. ✅</p><p>Elle est maintenant visible dans votre compte.<br>Partagez votre lien pour recevoir des votes !</p><hr><p style="font-size:12px;color:#aaa">ART-ZEDMO - Galerie permanente + Expositions + Enchères<br>WhatsApp: 0194655238</p></div>`
          })
        });
        const txtBrevo = await rBrevo.text();
        console.log('📧 Brevo publication status:', rBrevo.status, 'reponse:', txtBrevo);
      } catch (e) { console.log('📧 Erreur Brevo publication:', e.message); }
    } else {
      console.log('📧 Brevo publication SKIP - email:', user.email, 'KEY present:', !!process.env.BREVO_API_KEY);
    }
    // ===== FIN AJOUT =====

    res.status(201).json({ success: true, data: oeuvre, artwork: oeuvre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
