import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Exposition from '../models/Exposition.js';
import Artwork from '../models/Artwork.js';
import Enchere from '../models/Enchere.js';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const STATUTS_PUBLIQUES = ['a_venir', 'soumission', 'active', 'vote', 'vote_clos', 'enchere', 'terminee'];

async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Auth requise.' });
  if (!JWT_SECRET || JWT_SECRET.length < 32) return res.status(500).json({ success: false, error: 'Config sécurité indisponible.' });
  try {
    const token = authorization.slice(7);
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const userId = payload.id || payload._id;
    if (!mongoose.isValidObjectId(userId)) return res.status(401).json({ success: false, error: 'ID invalide.' });
    const user = await User.findById(userId).select('_id role statut');
    if (!user || user.statut!== 'valide') return res.status(403).json({ success: false, error: 'Compte non validé.' });
    req.user = user; next();
  } catch { return res.status(401).json({ success: false, error: 'Jeton expiré.' }); }
}
function requireAdmin(req, res, next) {
  if (req.user?.role!== 'admin') return res.status(403).json({ success: false, error: 'Admin requis.' });
  next();
}
function validObjectId(id) { return mongoose.isValidObjectId(id); }

/* 1. LISTE PUBLIQUE */
router.get('/', async (req, res) => {
  try {
    const expos = await Exposition.find({ statut: { $in: STATUTS_PUBLIQUES } })
     .populate({ path: 'oeuvres', match: { statut: { $in: ['validee', 'en_enchere', 'vendue'] } }, populate: { path: 'artiste', select: 'nom nom_artiste ville avatar' } })
     .populate({ path: 'candidatures.artwork', select: 'titre image images azmId prix votesCount artiste', populate:{path:'artiste',select:'nom nom_artiste'} })
     .sort({ dateDebut: -1 }).limit(100);
    return res.json(expos);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Chargement expositions impossible.' });
  }
});

/* 2. EXPO ACTIVE */
router.get('/active', async (req, res) => {
  try {
    const expo = await Exposition.findOne({ statut: { $in: ['soumission', 'active', 'vote', 'vote_clos', 'enchere'] } })
     .populate({ path: 'oeuvres', match: { statut: { $in: ['validee', 'en_enchere'] } }, populate: { path: 'artiste', select: 'nom nom_artiste' }, options: { sort: { votesCount: -1 } } })
     .populate({ path: 'candidatures.artwork', populate:{path:'artiste',select:'nom nom_artiste'} })
     .sort({ dateDebut: -1 });
    if (!expo) return res.json({ message: 'Pas d’exposition active.', oeuvres: [] });
    return res.json(expo);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Expo active indisponible.' });
  }
});

/* 2bis. GET UNE EXPO PAR ID - MANQUAIT CHEZ TOI = ROUTE INTROUVABLE */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return res.status(400).json({ success: false, error: 'ID invalide.' });
    const expo = await Exposition.findById(id)
      .populate({ path: 'oeuvres', populate: { path: 'artiste', select: 'nom nom_artiste' } })
      .populate({ path: 'candidatures.artwork', populate:{path:'artiste',select:'nom nom_artiste'} })
      .populate({ path: 'candidatures.artiste', select: 'nom nom_artiste' });
    if (!expo) return res.status(404).json({ success: false, error: 'Expo introuvable.' });
    return res.json(expo);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Chargement expo impossible.' });
  }
});

/* 3. CRÉER */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { titre, description, theme, dateDebut, dateFin, dateFinVote, dateDebutSoumission, dateFinSoumission, dateDebutVote, lieu, image, regles } = req.body || {};
    if (!titre || titre.trim().length < 3) return res.status(400).json({ success: false, error: 'Titre min 3 caractères.' });
    const debut = dateDebut? new Date(dateDebut) : new Date();
    const fin = dateFin? new Date(dateFin) : new Date(Date.now() + 30 * 86400000);
    const finVote = dateFinVote? new Date(dateFinVote) : new Date(debut.getTime() + 27 * 86400000);
    const expo = await Exposition.create({
      titre: titre.trim(), description, theme: theme || 'Royauté Africaine',
      dateDebut: debut, dateFin: fin, dateFinVote: finVote,
      dateDebutSoumission: dateDebutSoumission? new Date(dateDebutSoumission) : debut,
      dateFinSoumission: dateFinSoumission? new Date(dateFinSoumission) : new Date(debut.getTime() + 7*86400000),
      dateDebutVote: dateDebutVote? new Date(dateDebutVote) : new Date(debut.getTime() + 8*86400000),
      lieu, image, statut: 'soumission',
      regles: { topPourEnchere: regles?.topPourEnchere || 10, maxOeuvresParArtiste: regles?.maxOeuvresParArtiste || 3 }
    });
    return res.status(201).json({ success: true, message: 'Exposition créée en mode soumission.', exposition: expo });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Création impossible.' });
  }
});

/* 4. AJOUT ADMIN DIRECT - RESTE EN GALERIE */
router.post('/:id/add-artwork', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params; const { artworkId } = req.body || {};
    if (!validObjectId(id) ||!validObjectId(artworkId)) return res.status(400).json({ success: false, error: 'ID invalide.' });
    const expo = await Exposition.findById(id);
    if (!expo) return res.status(404).json({ success: false, error: 'Expo introuvable.' });
    if (!['a_venir', 'soumission', 'active','vote'].includes(expo.statut)) return res.status(400).json({ success: false, error: 'Expo fermée aux ajouts, statut: ' + expo.statut });
    const art = await Artwork.findById(artworkId);
    if (!art) return res.status(404).json({ success: false, error: 'Œuvre introuvable.' });
    if (!['validee'].includes(art.statut)) return res.status(400).json({ success: false, error: 'Seules œuvres validées galerie peuvent être exposées.' });

    art.expositions = art.expositions || [];
    if (!art.expositions.some(e => String(e) === String(expo._id))) art.expositions.push(expo._id);
    art.isEnExpoActuelle = true;
    await art.save();

    if (!expo.oeuvres.some(o => String(o) === String(art._id))) expo.oeuvres.push(art._id);
    
    // Si candidature en attente existe, passe en acceptee
    const existingCand = expo.candidatures.find(c=> String(c.artwork)===String(art._id));
    if(existingCand){ existingCand.statut='acceptee'; }
    else {
      expo.candidatures.push({ artwork: art._id, artiste: art.artiste, statut: 'acceptee' });
    }
    await expo.save();

    const baseUrl = (process.env.FRONTEND_URL || 'https://art-zedmo.com').split(',')[0].trim().replace(/\/+$/, '');
    return res.json({ success: true, message: 'Ajoutée (reste en galerie).', lien_vote: `${baseUrl}/expo/vote/${art._id}` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Ajout impossible.' });
  }
});

/* 5. SOUMISSION ARTISTE - GALERIE -> EXPO */
router.post('/:id/soumettre', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params; const { artworkId } = req.body || {};
    if (!validObjectId(id) ||!validObjectId(artworkId)) return res.status(400).json({ success: false, error: 'ID invalide.' });
    const expo = await Exposition.findById(id);
    if (!expo || expo.statut!== 'soumission') return res.status(400).json({ success: false, error: 'Pas ouverte aux soumissions.' });
    const art = await Artwork.findById(artworkId);
    if (!art || String(art.artiste)!== String(req.user._id)) return res.status(403).json({ success: false, error: 'Pas propriétaire.' });
    if (art.statut!== 'validee') return res.status(400).json({ success: false, error: 'Œuvre doit être validée en galerie d’abord.' });

    const countArtiste = expo.candidatures.filter(c => String(c.artiste) === String(req.user._id)).length;
    if (countArtiste >= (expo.regles?.maxOeuvresParArtiste || 3)) {
      return res.status(400).json({ success: false, error: `Limite ${expo.regles?.maxOeuvresParArtiste || 3} œuvres par artiste atteinte.` });
    }
    if (expo.candidatures.some(c => String(c.artwork) === String(artworkId))) return res.status(409).json({ success: false, error: 'Déjà soumise.' });

    expo.candidatures.push({ artwork: artworkId, artiste: req.user._id, statut: 'en_attente' });
    await expo.save();
    return res.json({ success: true, message: 'Soumise, en attente admin. Reste en galerie.' });
  } catch (e) { return res.status(500).json({ success: false, error: 'Erreur soumission.' }); }
});

/* 5bis. ADMIN ACCEPTE / REFUSE PAR ID CANDIDATURE (ton ancien) */
router.put('/:id/candidature/:candidatureId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id, candidatureId } = req.params; const { statut } = req.body;
    if (!validObjectId(id) ||!validObjectId(candidatureId)) return res.status(400).json({ error: 'ID invalide.' });
    if (!['acceptee', 'refusee','validee','rejetee'].includes(statut)) return res.status(400).json({ error: 'Statut doit être acceptee/refusee.' });

    const expo = await Exposition.findById(id);
    if (!expo) return res.status(404).json({ error: 'Expo introuvable.' });
    const cand = expo.candidatures.id(candidatureId);
    if (!cand) return res.status(404).json({ error: 'Candidature introuvable.' });

    const finalStatut = statut==='validee'?'acceptee':statut==='rejetee'?'refusee':statut;
    cand.statut = finalStatut;
    if (finalStatut === 'acceptee') {
      const art = await Artwork.findById(cand.artwork);
      if (art) {
        art.expositions = art.expositions || [];
        if (!art.expositions.some(e => String(e) === String(expo._id))) art.expositions.push(expo._id);
        art.isEnExpoActuelle = true;
        await art.save();
        if (!expo.oeuvres.some(o => String(o) === String(art._id))) expo.oeuvres.push(art._id);
      }
    } else {
      expo.oeuvres = expo.oeuvres.filter(o => String(o)!== String(cand.artwork));
    }
    await expo.save();
    return res.json({ success: true, message: `Candidature ${finalStatut}.` });
  } catch (e) { return res.status(500).json({ error: 'Erreur traitement candidature.' }); }
});

/* 5ter. NOUVEAU - ADMIN VALIDE PAR ARTWORK ID (compatible avec ton admin corrigé) */
async function validerParArtworkId(req,res){
  try{
    const { id, artworkId } = req.params;
    let { statut } = req.body || {};
    if (!validObjectId(id) || !validObjectId(artworkId)) return res.status(400).json({ error: 'ID invalide.' });
    if(!statut) statut='validee';
    if (!['validee','rejetee','acceptee','refusee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });

    const expo = await Exposition.findById(id);
    if (!expo) return res.status(404).json({ error: 'Expo introuvable.' });

    const cand = expo.candidatures.find(c=> String(c.artwork)===String(artworkId) || String(c.artwork?._id)===String(artworkId));
    if (!cand) return res.status(404).json({ error: 'Candidature non trouvée pour cette œuvre. Elle doit d’abord être soumise.' });

    const finalStatut = statut==='validee'?'acceptee':statut==='rejetee'?'refusee':statut;
    cand.statut = finalStatut;

    if (finalStatut === 'acceptee') {
      const art = await Artwork.findById(artworkId);
      if (art) {
        art.expositions = art.expositions || [];
        if (!art.expositions.some(e => String(e) === String(expo._id))) art.expositions.push(expo._id);
        art.isEnExpoActuelle = true;
        await art.save();
        if (!expo.oeuvres.some(o => String(o) === String(art._id))) expo.oeuvres.push(art._id);
      }
    } else {
      expo.oeuvres = expo.oeuvres.filter(o => String(o)!== String(artworkId));
    }
    await expo.save();
    return res.json({ success: true, message: `Soumission ${finalStatut} - ${finalStatut==='acceptee'?'visible dans expo avec bouton Voter (reste en galerie)':'retirée de expo'}` });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: 'Erreur validation.' });
  }
}

// Routes compatibles avec admin corrigé (artworkId)
router.put('/:id/soumissions/:artworkId/valider', authenticateToken, requireAdmin, validerParArtworkId);
router.put('/:id/candidatures/:artworkId/valider', authenticateToken, requireAdmin, validerParArtworkId);
router.put('/:id/soumissions/:artworkId', authenticateToken, requireAdmin, validerParArtworkId);
router.delete('/:id/candidatures/:artworkId', authenticateToken, requireAdmin, async (req,res)=>{
  try{
    const { id, artworkId } = req.params;
    const expo = await Exposition.findById(id);
    if(!expo) return res.status(404).json({error:'Expo introuvable'});
    expo.candidatures = expo.candidatures.filter(c=> String(c.artwork)!==String(artworkId));
    expo.oeuvres = expo.oeuvres.filter(o=> String(o)!==String(artworkId));
    await expo.save();
    return res.json({success:true,message:'Candidature supprimée'});
  }catch(e){return res.status(500).json({error:'Erreur suppression'});}
});

/* 6. CALCUL TOP 10 -> ENCHERE */
router.post('/:id/calculer-top-et-encherir', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return res.status(400).json({ success: false, error: 'ID invalide.' });
    const expo = await Exposition.findById(id);
    if (!expo) return res.status(404).json({ success: false, error: 'Expo introuvable.' });
    const dateFin = req.body?.dateFin? new Date(req.body.dateFin) : new Date(Date.now() + 3*86400000);

    const topN = expo.regles?.topPourEnchere || 10;
    const top10 = await Artwork.find({ expositions: expo._id, statut: 'validee' }).sort({ votesCount: -1, createdAt: 1 }).limit(topN);
    if (top10.length === 0) return res.status(400).json({ success: false, error: 'Aucune œuvre validée à enchérir.' });

    const resultats = [];
    for (const art of top10) {
      let enchere = await Enchere.findOne({ artwork: art._id, statut: 'en_cours' });
      if (!enchere) {
        enchere = await Enchere.create({
          artwork: art._id, titre: art.titre, exposition: expo._id,
          prixDepart: art.prix, enchereActuelle: Math.round(art.prix * 1.5), dateFin
        });
      }
      art.statut = 'en_enchere';
      await art.save();
      resultats.push({ artworkId: art._id, enchereId: enchere._id });
    }
    expo.oeuvres_top = top10.map(a => a._id);
    expo.statut = 'enchere';
    await expo.save();
    return res.json({ success: true, message: `Top ${top10.length} en enchère.`, nombreOeuvresClassees: top10.length, dateFin, resultats });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Calcul impossible.' });
  }
});

export default router;
