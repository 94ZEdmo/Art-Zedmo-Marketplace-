import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.js';
import artworkRoutes from './routes/artworks.js';
import expoRoutes from './routes/expositions.js';
import voteRoutes from './routes/votes.js';
import enchereRoutes from './routes/encheres.js';
import annonceRoutes from './routes/annonces.js';
import galeriesPriveesRoutes from './routes/galeriesPrivees.js';

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 10000;
const MONGO_URL = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URL) { console.error('MONGO_URI manquant'); process.exit(1); }
if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error('JWT_SECRET manquant'); process.exit(1); }

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentification requise.' });
  const token = authorization.slice(7);
  try { 
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const rawId = decoded.id || decoded._id || decoded.userId || decoded.user_id;
    req.user = decoded;
    req.user.id = String(rawId);
    req.user._id = String(rawId);
    next(); 
  } catch { return res.status(401).json({ error: 'Jeton invalide.' }); }
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin seulement.' });
  next();
}

const allowedMimeTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) return cb(new Error('Format non autorisé.'));
    cb(null, true);
  }
});

async function uploadToPinata(buffer, filename, mimetype) {
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT manquant');
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimetype }), filename);
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Pinata error');
  return data.IpfsHash;
}

app.post('/api/upload', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image.' });
  try {
    const cid = await uploadToPinata(req.file.buffer, req.file.originalname, req.file.mimetype);
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
    return res.status(201).json({ success: true, url: imageUrl, image: imageUrl, cid });
  } catch (e) {
    const filename = `${Date.now()}-${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
    return res.status(201).json({ success: true, url: `/uploads/${filename}`, storage: 'local' });
  }
});

app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/artworks', artworkRoutes);
app.use('/api/expositions', expoRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/encheres', enchereRoutes);
app.use('/api/annonces', annonceRoutes);
app.use('/api/galeries-privees', galeriesPriveesRoutes);
app.use('/api/auth', authRoutes);

const UserModel = () => mongoose.model('User');

app.get('/api/auth/all', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const User = UserModel();
    const users = await User.find().sort({createdAt:-1}).lean();
    res.json({ success: true, comptes: users, users, total: users.length });
  }catch(e){next(e)}
});
app.get('/api/users', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const User = UserModel();
    const users = await User.find().sort({createdAt:-1}).lean();
    res.json({ success: true, comptes: users, users, total: users.length });
  }catch(e){next(e)}
});
app.get('/api/users/all', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const User = UserModel();
    const users = await User.find().sort({createdAt:-1}).lean();
    res.json({ success: true, comptes: users, users, total: users.length });
  }catch(e){next(e)}
});

async function acheterForfait(req,res,next){
  try{
    const { forfait, type, preuve, transactionId } = req.body;
    const forfaitDemande = (forfait || type || '').toLowerCase();
    const preuveFinal = (preuve || transactionId || '').toString().trim();
    if (!['pro','galerie_privee'].includes(forfaitDemande)) return res.status(400).json({ error: 'Forfait invalide' });
    if (!preuveFinal || preuveFinal.length < 4) return res.status(400).json({ error: 'ID transaction obligatoire' });
    const User = UserModel();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if(forfaitDemande==='pro'){ user.forfaitProStatut='en_attente'; user.forfaitProPreuve=preuveFinal; }
    else { user.forfaitPriveeStatut='en_attente'; user.forfaitPriveePreuve=preuveFinal; }
    user.forfaitTypeDemande = forfaitDemande;
    user.forfaitStatut = 'en_attente';
    user.forfaitPreuve = preuveFinal;
    user.forfaitDateDemande = new Date();
    await user.save();
    return res.json({ success: true, message: `Forfait ${forfaitDemande} en attente` });
  }catch(e){ next(e) }
}
app.post('/api/forfaits/acheter', authenticateToken, acheterForfait);
app.post('/api/forfait/acheter', authenticateToken, acheterForfait);
app.post('/api/forfaits', authenticateToken, acheterForfait);
app.get('/api/forfaits', authenticateToken, requireAdmin, async (req,res,next)=>{
  try{
    const User = UserModel();
    const pending = await User.find({ $or: [{forfaitStatut:'en_attente'},{forfaitProStatut:'en_attente'},{forfaitPriveeStatut:'en_attente'}] }).sort({updatedAt:-1}).lean();
    res.json(pending);
  }catch(e){next(e)}
});

const ADRESSES_OFFICIELLES = {
  momo: process.env.ADRESSE_MOMO || '0194655238',
  moov: process.env.ADRESSE_MOOV || '0194655238',
  usdt: process.env.ADRESSE_USDT || 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2',
  pi: process.env.ADRESSE_PI || 'GAF62KXAV7IUM3HSHQ3TI6EFMIDSGII2EVEZXFTXGMH5D2EDPA6RVAM',
  whatsapp: '2290194655238'
};

const settingsSchema = new mongoose.Schema({ _id: String, momo: String, moov: String, usdt: String, pi: String, updatedAt: Date });
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
app.get('/api/settings/paiements', async (req,res,next)=>{
  try{
    const s = await Settings.findById('paiements').lean();
    res.json({ momo: s?.momo || ADRESSES_OFFICIELLES.momo, moov: s?.moov || ADRESSES_OFFICIELLES.moov, usdt: s?.usdt || ADRESSES_OFFICIELLES.usdt, pi: s?.pi || ADRESSES_OFFICIELLES.pi, whatsapp: ADRESSES_OFFICIELLES.whatsapp });
  }catch(e){next(e)}
});

app.get('/admin', (req,res)=>{ res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/admin.html', (req,res)=>{ res.sendFile(path.join(__dirname, 'public', 'admin.html')); });

app.get('/api/health', (req,res)=>{ res.json({ status: mongoose.connection.readyState===1?'LIVE':'DOWN' }); });

async function fixAllCompteursGlobal() {
  try {
    const User = mongoose.model('User');
    const Artwork = mongoose.model('Artwork');
    const users = await User.find({});
    let fixed = 0;
    for (const u of users) {
      const countReel = await Artwork.countDocuments({ artiste: u._id, statut: { $nin: ['rejetee','supprime'] } });
      const countNFT = await Artwork.countDocuments({ artiste: u._id, isNFT: true, statut: { $nin: ['rejetee','supprime'] } });
      let limite = 5, limiteNFT = 3;
      if (u.forfaitProStatut === 'valide' || u.forfait === 'pro') { limite = 10; limiteNFT = 10; }
      if (u.forfaitPriveeStatut === 'valide' || u.forfait === 'galerie_privee') { limite = 50; limiteNFT = 50; }
      if (u.totalOeuvresPubliees !== countReel || u.limiteOeuvres !== limite) {
        await User.updateOne({ _id: u._id }, { $set: { totalOeuvres: countReel, totalOeuvresPubliees: countReel, totalNFTPublies: countNFT, limiteOeuvres: limite, limiteNFT: limiteNFT } });
        fixed++;
      }
    }
    console.log(`✅ Fix global: ${fixed} comptes`);
  } catch (e) { console.error("Fix global error:", e.message); }
}

app.get('*', (req,res)=>{
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable: ' + req.path });
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(404).send('index.html manquant');
});

app.use((err,req,res,next)=>{
  console.error('Erreur:', err.message);
  res.status(500).json({ error: process.env.NODE_ENV==='production'?'Erreur serveur':err.message });
});

async function startServer(){
  await mongoose.connect(MONGO_URL);
  console.log('MongoDB OK - Adresses:', ADRESSES_OFFICIELLES);
  await fixAllCompteursGlobal();
  app.listen(PORT, '0.0.0.0', ()=>{ console.log(`ART-ZEDMO sur ${PORT}`); });
}
startServer();
