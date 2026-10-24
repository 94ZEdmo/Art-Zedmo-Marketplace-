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
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Jeton invalide.' }); }
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
    const ext = '.jpg';
    const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
    return res.status(201).json({ success: true, url: `/uploads/${filename}`, storage: 'local' });
  }
});

// STATIC - IMPORTANT: avant les routes API, mais avec index false
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// API ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/expositions', expoRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/encheres', enchereRoutes);
app.use('/api/annonces', annonceRoutes);
app.use('/api/galeries-privees', galeriesPriveesRoutes);

// ADRESSES OFFICIELLES
const ADRESSES_OFFICIELLES = {
  momo: '+2290196587303',
  moov: '+2290194655238',
  usdt: 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2',
  pi: 'GAF62KXAV7IUM3H5HQ3T16EFMIDSGII2EVEZFXTXGMH5D2EDPA6RVAM'
};

const settingsSchema = new mongoose.Schema({ _id: String, momo: String, moov: String, usdt: String, pi: String, updatedAt: Date });
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

app.get('/api/settings/paiements', async (req,res,next)=>{
  try{
    const s = await Settings.findById('paiements').lean();
    res.json({ momo: s?.momo || ADRESSES_OFFICIELLES.momo, moov: s?.moov || ADRESSES_OFFICIELLES.moov, usdt: s?.usdt || ADRESSES_OFFICIELLES.usdt, pi: s?.pi || ADRESSES_OFFICIELLES.pi });
  }catch(e){next(e)}
});

// ADMIN HTML - FIXE TON PROBLEME DE LIEN
app.get('/admin', (req,res)=>{ res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/admin.html', (req,res)=>{ res.sendFile(path.join(__dirname, 'public', 'admin.html')); });

// NFT / HEALTH etc...
const nftSchema = new mongoose.Schema({ titre: String, description: String, azmId: { type: String, unique: true, sparse: true }, artiste: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }, { strict: false, timestamps: true });
const NFT = mongoose.models.NFT || mongoose.model('NFT', nftSchema);
app.get('/api/health', (req,res)=>{ res.json({ status: mongoose.connection.readyState===1?'LIVE':'DOWN' }); });
app.get('/api/nft', async (req,res,next)=>{ try{ const nfts = await NFT.find().sort({createdAt:-1}).limit(100).lean(); res.json(nfts);}catch(e){next(e)} });

// FRONT - TOUJOURS EN DERNIER, APRES ADMIN
app.get('*', (req,res)=>{
  // Si c'est /api, on ne sert pas index.html
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable.' });
  // Sinon on sert l'app
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
  app.listen(PORT, '0.0.0.0', ()=>{ console.log(`ART-ZEDMO sur ${PORT}`); });
}
startServer();
