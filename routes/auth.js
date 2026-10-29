import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
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
    await res.json();
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
    forfaitProStatut: user.forfaitProStatut || 'gratuit',
    forfaitProExpire: user.forfaitProExpire || null,
    forfaitProPreuve: user.forfaitProPreuve || null,
    forfaitPriveeStatut: user.forfaitPriveeStatut || 'gratuit',
    forfaitPriveeExpire: user.forfaitPriveeExpire || null,
    forfaitPriveePreuve: user.forfaitPriveePreuve || null,
    limiteOeuvres: user.limiteOeuvres ?? 5, limiteNFT: user.limiteNFT ?? 3,
    forfaitExpireAt: user.forfaitExpireAt || user.forfaitProExpire || user.forfaitPriveeExpire || null,
    forfaitPrixUSD: user.forfaitPrixUSD ?? 0, forfaitPrixFCFA: user.forfaitPrixFCFA ?? 0,
    totalOeuvresPubliees: user.totalOeuvresPubliees ?? 0, totalNFTPublies: user.totalNFTPublies ?? 0,
    createdAt: user.createdAt, updatedAt: user.updatedAt
  };
}

function createToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, { algorithm: 'HS256', expiresIn: user.role === 'admin' ? '8h' : '7d' });
}

// === INSCRIPTION AUTO-VALIDEE ===
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
      statut: 'valide', estVerifie: true, forfait: 'gratuit', limiteOeuvres: 5, limiteNFT: 3,
      forfaitProStatut: 'gratuit', forfaitPriveeStatut: 'gratuit'
    });
    const token = createToken(user);
    return res.status(201).json({ success: true, token, user: publicUser(user) });
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
    if (user.statut === 'refuse') return res.status(403).json({ error: 'Compte refusé.' });
    const token = createToken(user);
    return res.json({ success: true, token, user: publicUser(user) });
  } catch (error) { next(error); }
});

// === MOT DE PASSE OUBLIE - CORRIGE TON 404 ===
router.post('/forgot-password', async (req, res, next) => {
  try {
    const id = String(req.body.identifiant || req.body.email || req.body.whatsapp || '').trim();
    if (!id) return res.status(400).json({ error: 'WhatsApp ou Email requis.' });
    const conditions = [{ whatsapp: id }];
    if (id.includes('@')) conditions.push({ email: id.toLowerCase() });
    const user = await User.findOne({ $or: conditions });
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = new Date(Date.now() + 60*60*1000);
    await user.save();
    console.log(`RESET TOKEN ${user.email}: ${resetToken}`);
    return res.json({ success: true, message: 'Lien valable 1h', resetToken, userId: user._id });
  } catch (e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const finalToken = req.body.token || req.body.resetToken;
    const finalPassword = req.body.password || req.body.newPassword;
    if (!finalToken || !finalPassword) return res.status(400).json({ error: 'Token et mot de passe requis.' });
    if (finalPassword.length < 10) return res.status(400).json({ error: '10 caractères minimum.' });
    const user = await User.findOne({ resetPasswordToken: finalToken, resetPasswordExpire: { $gt: new Date() } }).select('+resetPasswordToken +resetPasswordExpire +password');
    if (!user) return res.status(400).json({ error: 'Lien expiré ou invalide.' });
    user.password = finalPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();
    return res.json({ success: true, message: 'Mot de passe changé.' });
  } catch (e) { next(e); }
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

router.get('/forfaits', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const pending = await User.find({ $or: [{forfaitStatut:'en_attente'},{forfaitProStatut:'en_attente'},{forfaitPriveeStatut:'en_attente'}] }).sort({updatedAt:-1}).lean();
    const result = [];
    for(const u of pending){
      if(u.forfaitProStatut==='en_attente') result.push({ _id: u._id, user: u, userId: u._id, type: 'pro', forfait: 'pro', preuve: u.forfaitProPreuve||u.forfaitPreuve, statut: 'en_attente', createdAt: u.updatedAt });
      if(u.forfaitPriveeStatut==='en_attente') result.push({ _id: u._id, user: u, userId: u._id, type: 'galerie_privee', forfait: 'galerie_privee', preuve: u.forfaitPriveePreuve||u.forfaitPreuve, statut: 'en_attente', createdAt: u.updatedAt });
      if(result.length===0 && u.forfaitStatut==='en_attente') result.push({ _id: u._id, user: u, userId: u._id, type: u.forfaitTypeDemande||u.forfait, preuve: u.forfaitPreuve, statut: u.forfaitStatut, createdAt: u.updatedAt });
    }
    res.json(result);
  }catch(e){next(e)}
});

router.get('/forfaits/admin/all', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const pending = await User.find({ $or: [{forfaitStatut:'en_attente'},{forfaitProStatut:'en_attente'},{forfaitPriveeStatut:'en_attente'}] }).sort({updatedAt:-1}).lean();
    const out=[];
    for(const u of pending){
      if(u.forfaitProStatut==='en_attente') out.push({ _id: u._id, user: u, type: 'pro', preuve: u.forfaitProPreuve, statut: 'en_attente' });
      if(u.forfaitPriveeStatut==='en_attente') out.push({ _id: u._id, user: u, type: 'galerie_privee', preuve: u.forfaitPriveePreuve, statut: 'en_attente' });
    }
    res.json(out.length?out:pending.map(u=>({ _id: u._id, user: u, type: u.forfaitTypeDemande||u.forfait, preuve: u.forfaitPreuve, statut: u.forfaitStatut })));
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

async function acheterForfaitHandler(req,res,next){
  try{
    const { forfait, type, preuve, transactionId } = req.body;
    const forfaitDemande = (forfait || type || '').toLowerCase();
    const preuveFinal = (preuve || transactionId || '').toString().trim();
    if (!['pro','galerie_privee'].includes(forfaitDemande)) return res.status(400).json({ error: 'Forfait invalide: pro ou galerie_privee' });
    if (!preuveFinal || preuveFinal.length < 4) return res.status(400).json({ error: `ID transaction obligatoire MTN ${ADRESSES.MTN} / Moov ${ADRESSES.MOOV} / USDT ${ADRESSES.USDT} / Pi ${ADRESSES.PI}` });
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if(forfaitDemande==='pro'){
      user.forfaitProStatut='en_attente';
      user.forfaitProPreuve=preuveFinal;
    } else {
      user.forfaitPriveeStatut='en_attente';
      user.forfaitPriveePreuve=preuveFinal;
    }
    user.forfaitTypeDemande = forfaitDemande;
    user.forfaitStatut = 'en_attente';
    user.forfaitPreuve = preuveFinal;
    user.forfaitDateDemande = new Date();
    await user.save();
    return
