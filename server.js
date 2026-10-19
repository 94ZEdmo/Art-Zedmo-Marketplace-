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

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 10000;
const MONGO_URL = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URL) { console.error('ERREUR : MONGO_URI manquant.'); process.exit(1); }
if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error('ERREUR : JWT_SECRET manquant.'); process.exit(1); }

app.disable('x-powered-by');
app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(v => v.trim()) : false,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// =====================================================
// 2. DOSSIER DES IMAGES (gardé pour fallback)
// =====================================================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

// =====================================================
// 3. AUTH
// =====================================================
function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentification requise.' });
  const token = authorization.slice(7);
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Jeton invalide ou expiré.' }); }
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé à l’administrateur.' });
  next();
}

// =====================================================
// 4. TÉLÉVERSEMENT VERS PINATA IPFS - CORRIGÉ
// =====================================================
const allowedMimeTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);

// On utilise memoryStorage pour envoyer direct à Pinata, pas sur le disque
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) return cb(new Error('Format d’image non autorisé.'));
    cb(null, true);
  }
});

async function uploadToPinata(buffer, filename, mimetype) {
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT manquant dans Render');
  
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimetype });
  formData.append('file', blob, filename);
  formData.append('pinataMetadata', JSON.stringify({ name: filename }));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.PINATA_JWT}` },
    body: formData
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur Pinata');
  
  console.log('✅ Image Pinata:', data.IpfsHash);
  return data.IpfsHash;
}

app.post('/api/upload', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  
  try {
    // ESSAIE PINATA D'ABORD
    const cid = await uploadToPinata(req.file.buffer, req.file.originalname, req.file.mimetype);
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
    // Alternative gateway plus stable: `https://ipfs.io/ipfs/${cid}`
    
    return res.status(201).json({
      success: true,
      url: imageUrl,
      image: imageUrl,
      imageUrl,
      cid,
      storage: 'pinata'
    });
  } catch (e) {
    console.error('Erreur Pinata, fallback local:', e.message);
    // FALLBACK LOCAL si Pinata échoue
    const ext = { 'image/jpeg': '.jpg','image/png': '.png','image/webp': '.webp','image/gif': '.gif' }[req.file.mimetype];
    const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
    const imageUrl = `/uploads/${filename}`;
    return res.status(201).json({ success: true, url: imageUrl, image: imageUrl, imageUrl, storage: 'local', warning: e.message });
  }
});

// Le reste de ton fichier ne change pas...
app.use('/uploads', express.static(uploadDir, { index: false, dotfiles: 'deny', maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false, dotfiles: 'deny' }));

app.use('/api/auth', authRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/expositions', expoRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/encheres', enchereRoutes);
app.use('/api/annonces', annonceRoutes);

// ... copie le reste de ton fichier à partir de nftSchema jusqu'à la fin exactement comme avant
