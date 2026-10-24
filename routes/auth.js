import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import GaleriePrivee from '../models/GaleriePrivee.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET doit être configuré dans Render avec au moins 32 caractères.');
}

const ADRESSES = {
  MTN: '+2290196587303',
  MOOV: '+2290194655238',
  USDT: 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2',
  PI: 'GAF62KXAV7IUM3H5HQ3T16EFMIDSGII2EVEZFXTXGMH5D2EDPA6RVAM'
};

async function sendValidationEmail(user) {
  if (!user.email || !process.env.BREVO_API_KEY) return false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: "ART-ZEDMO", email: "artzedmo@gmail.com" },
        to: [{ email: user.email }],
        subject: 'Votre profil ART-ZEDMO a été validé',
        htmlContent: `<div style="font-family:Arial;padding:24px"><h2>Félicitations ${user.nom_artiste} !</h2><p>Votre profil a été validé.</p><p><a href="https://art-zedmo-marketplace.onrender.com">Accéder</a></p></div>`
      })
    });
    const data = await res.json();
    return true;
  } catch (e) { return false; }
}

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentification requise.' });
  const token = authorization.slice(7);
  try {
    req.auth = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!req.auth.id) return res.status(401).json({ error: 'Jeton invalide.' });
    next();
  } catch { return res.status(401).json({ error: 'Jeton invalide ou expiré.' }); }
}

async function requireAdmin(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.auth.id)) return res.status(401).json({ error: 'ID invalide.' });
    const admin = await User.findById(req.auth.id).select('_id role statut');
    if (!admin || admin.role !== 'admin' || admin.statut !== 'valide') return res.status(403).json({ error: 'Accès admin seulement.' });
    req.admin = admin;
    next();
  } catch (error) { next(error); }
}

function publicUser(user) {
  return {
    _id: user._id, nom: user.nom, nom_artiste: user.nom_artiste, whatsapp: user.whatsapp, email: user.email,
    role: user.role, ville: user.ville, bio: user.bio, avatar: user.avatar, statut: user.statut,
    estVerifie: user.estVerifie, totalOeuvres: user.totalOeuvres, adresseReception: user.adresseReception,
    forfait: user.forfait || 'gratuit',
    forfaitStatut: user.forfaitStatut || null,
    forfaitPreuve: user.forfaitPreuve || null,
    forfaitTypeDemande: user.forfaitTypeDemande || null,
    limiteOeuvres: user.limiteOeuvres ?? 5, limiteNFT: user.limiteNFT ?? 3,
    forfaitExpireAt: user.forfaitExpireAt || null,
    forfaitPrixUSD: user.forfaitPrixUSD ?? 0, forfaitPrixFCFA: user.forfaitPrixFCFA ?? 0,
    totalOeuvresPubliees: user.totalOeuvresPubliees ?? 0, totalNFTPublies: user.totalNFTPublies ?? 0,
    createdAt: user.createdAt, updatedAt: user.updatedAt
  };
}

function createToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, { algorithm: 'HS256', expiresIn: user.role === 'admin' ? '8h' : '7d' });
}

// INSCRIPTION / LOGIN
router.post('/register', async (req, res, next) => {
  try {
    const { nom, nom_artiste, whatsapp, email, password, ville, role, adresseReception } = req.body;
    const nomNettoye = (nom||'').trim(); const artisteNettoye = (nom_artiste||'').trim(); const whatsappNettoye = (whatsapp||'').trim(); 
    const emailNettoye = (email||'').trim().toLowerCase();
    const adresseNettoyee = typeof adresseReception === 'string' ? adresseReception.trim() : '';
    if (!nomNettoye || !artisteNettoye || !whatsappNettoye || !emailNettoye || !password) return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    if (password.length < 10) return res.status(400).json({ error: 'Mot de passe 10 caractères min.' });
    const roleAutorise = ['artiste', 'acheteur'].includes(role) ? role : 'artiste';
    if (roleAutorise === 'artiste' && (!adresseNettoyee || adresseNettoyee.length < 8)) {
      return res.status(400).json({ error: `Adresse réception obligatoire: ${ADRESSES.USDT} / ${ADRESSES.PI} / ${ADRESSES.MTN}` });
    }
    const existe = await User.findOne({ $or: [{ whatsapp: whatsappNettoye }, { email: emailNettoye }] });
    if (existe) return res.status(409).json({ error: 'Déjà utilisé.' });
    const user = await User.create({ 
      nom: nomNettoye, nom_artiste: artisteNettoye, whatsapp: whatsappNettoye, email: emailNettoye, password, 
      ville: ville||'Abomey-Calavi', role: roleAutorise, adresseReception: adresseNettoyee,
      statut: 'en_attente', forfait: 'gratuit', limiteOeuvres: 5, limiteNFT: 3
    });
    return res.status(201).json({ success: true, message: 'En attente validation admin.', user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { identifiant, password } = req.body;
    const loginId = String(identifiant||'').trim();
    const conditions = [{ whatsapp: loginId }];
    if (loginId.includes('@')) conditions.push({ email: loginId.toLowerCase() });
    const user = await User.findOne({ $or: conditions }).select('+password');
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Identifiants invalides.' });
    if (user.statut === 'en_attente') return res.status(403).json({ error: 'En attente de validation.' });
    if (user.statut !== 'valide') return res.status(403).json({ error: 'Compte non autorisé.' });
    const token = createToken(user);
    return res.json({ success: true, token, user: publicUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ error: 'Introuvable.' });
    return res.json(publicUser(user));
  } catch (error) { next(error); }
});

router.get('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(200).lean();
    return res.json(users.map(u => publicUser(u)));
  } catch (error) { next(error); }
});

// FORFAITS LIST POUR ADMIN - C'EST CA QUI MANQUAIT
router.get('/forfaits', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const pending = await User.find({forfaitStatut:'en_attente'}).sort({updatedAt:-1}).lean();
    const result = pending.map(u=>({
      _id: u._id,
      user: u,
      userId: u._id,
      type: u.forfaitTypeDemande || u.forfait,
      forfait: u.forfaitTypeDemande || u.forfait,
      preuve: u.forfaitPreuve,
      forfaitPreuve: u.forfaitPreuve,
      statut: u.forfaitStatut,
      forfaitStatut: u.forfaitStatut,
      createdAt: u.updatedAt
    }));
    res.json(result);
  }catch(e){next(e)}
});

router.get('/forfaits/admin/all', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const pending = await User.find({forfaitStatut:'en_attente'}).sort({updatedAt:-1}).lean();
    res.json(pending.map(u=>({ _id: u._id, user: u, type: u.forfaitTypeDemande||u.forfait, preuve: u.forfaitPreuve, statut: u.forfaitStatut })));
  }catch(e){next(e)}
});

router.get('/forfaits/list', async (req, res) => {
  return res.json({
    success: true, adresses: ADRESSES,
    forfaits: [
      { id: 'gratuit', nom: 'Gratuit', prixUSD: 0, prixFCFA: 0, limiteOeuvres: 5, limiteNFT: 3 },
      { id: 'pro', nom: 'PRO 10 oeuvres / 1 mois', prixUSD: 7, prixFCFA: 4200, limiteOeuvres: 10 },
      { id: 'galerie_privee', nom: 'Galerie Privée 50 oeuvres / 1 mois', prixUSD: 50, prixFCFA: 30000, limiteOeuvres: 50 }
    ]
  });
});

// ACHAT FORFAIT - MET EN ATTENTE POUR ADMIN
async function acheterForfaitHandler(req,res,next){
  try{
    const { forfait, type, preuve, transactionId } = req.body;
    const forfaitDemande = (forfait || type || '').toLowerCase();
    const preuveFinal = (preuve || transactionId || '').toString().trim();
    if (!['pro','galerie_privee'].includes(forfaitDemande)) return res.status(400).json({ error: 'Forfait invalide: pro ou galerie_privee' });
    if (!preuveFinal || preuveFinal.length < 4) return res.status(400).json({ error: `ID transaction obligatoire MTN ${ADRESSES.MTN} / Moov ${ADRESSES.MOOV} / USDT ${ADRESSES.USDT} / Pi ${ADRESSES.PI}` });
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    user.forfaitTypeDemande = forfaitDemande;
    user.forfaitStatut = 'en_attente';
    user.forfaitPreuve = preuveFinal;
    user.forfaitDateDemande = new Date();
    await user.save();
    console.log(`💰 FORFAIT EN ATTENTE: ${forfaitDemande} par ${user.nom_artiste} - Preuve: ${preuveFinal}`);
    return res.json({ success: true, message: `Forfait ${forfaitDemande} en attente - admin va valider 1 mois. Preuve: ${preuveFinal}`, user: publicUser(user) });
  }catch(e){next(e)}
}
router.post('/forfait/acheter', authenticateToken, acheterForfaitHandler);
router.post('/forfaits/acheter', authenticateToken, acheterForfaitHandler);
router.post('/forfaits', authenticateToken, acheterForfaitHandler);

// VALIDATION FORFAIT PAR ADMIN - ACTIVE 1 MOIS AUTO
async function validerForfaitHandler(req,res,next){
  try{
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const typeDemande = (req.body.type || req.body.forfait || user.forfaitTypeDemande || user.forfait || 'pro').toLowerCase();
    const type = ['pro','galerie_privee'].includes(typeDemande) ? typeDemande : 'pro';
    
    if (type === 'pro') {
      user.forfait = 'pro'; user.limiteOeuvres = 10; user.limiteNFT = 10;
      user.forfaitPrixUSD = 7; user.forfaitPrixFCFA = 4200;
    } else {
      user.forfait = 'galerie_privee'; user.limiteOeuvres = 50; user.limiteNFT = 50;
      user.forfaitPrixUSD = 50; user.forfaitPrixFCFA = 30000;
      let galerie = await GaleriePrivee.findOne({ proprietaire: user._id });
      if (!galerie) {
        const baseSlug = (user.nom_artiste || user.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0,30);
        galerie = await GaleriePrivee.create({ proprietaire: user._id, nomGalerie: `Galerie de ${user.nom_artiste}`, slug: `${baseSlug}-${user._id.toString().slice(-6)}`, whatsapp: user.whatsapp, isActive: true });
      }
    }
    user.forfaitStatut = 'valide';
    user.forfaitExpireAt = new Date(Date.now() + 30*24*60*60*1000); // 1 MOIS AUTO
    user.forfaitPreuve = user.forfaitPreuve; // garde preuve
    user.forfaitTypeDemande = null;
    await user.save();
    return res.json({ success: true, message: `✅ ${type} validé 1 mois - ${type==='pro'?'10 oeuvres':'50 oeuvres + galerie privée'}`, user: publicUser(user) });
  }catch(e){next(e)}
}
router.put('/:id/forfait/valider', authenticateToken, requireAdmin, validerForfaitHandler);
router.put('/:id/forfaits/:id/valider', authenticateToken, requireAdmin, validerForfaitHandler);
router.put('/forfaits/:id/valider', authenticateToken, requireAdmin, async (req,res,next)=>{
  req.params.id = req.params.id; return validerForfaitHandler(req,res,next);
});
router.put('/forfaits/:id/validate', authenticateToken, requireAdmin, async (req,res,next)=>{
  req.params.id = req.params.id; return validerForfaitHandler(req,res,next);
});

// VALIDATION COMPTE
async function validateUserHandler(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Introuvable.' });
    user.statut = 'valide'; user.estVerifie = true; await user.save();
    await sendValidationEmail(user);
    return res.json({ success: true, message: 'Compte validé.', user: publicUser(user) });
  } catch (error) { next(error); }
}
router.put('/:id/valider', authenticateToken, requireAdmin, validateUserHandler);
router.put('/users/:id/valider', authenticateToken, requireAdmin, validateUserHandler);
router.put('/:id/refuser', authenticateToken, requireAdmin, async (req, res, next) => {
  try { const user = await User.findById(req.params.id); if (!user) return res.status(404).json({ error: 'Introuvable.' }); user.statut = 'refuse'; await user.save(); return res.json({ success: true, message: 'Refusé.' }); } catch (e) { next(e); }
});
router.delete('/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try { if (req.params.id === req.auth.id) return res.status(400).json({ error: 'Pas ton propre compte.' }); await User.deleteOne({ _id: req.params.id }); return res.json({ success: true, message: 'Supprimé.' }); } catch (e) { next(e); }
});

export default router;
