import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';

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

app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));

// Dossier upload
const uploadDir = path.join(__dirname, 'public/uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, {recursive:true});

const storage = multer.diskStorage({
  destination: (req,file,cb)=>cb(null, uploadDir),
  filename: (req,file,cb)=>cb(null, Date.now()+'-'+file.originalname.replace(/\s/g,'_'))
});
const upload = multer({storage, limits:{fileSize:5*1024*1024}});

// UPLOAD IMAGE - route pour publier
app.post('/api/upload', upload.single('image'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'Aucune image'});
  const url = `/uploads/${req.file.filename}`;
  res.json({success:true, url, image: url, fullUrl: `${req.protocol}://${req.get('host')}${url}`});
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const MONGO_URL = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log("Connexion MongoDB...");
mongoose.connect(MONGO_URL)
.then(()=>console.log("✅ MongoDB ART-ZEDMO CONNECTÉ"))
.catch(e=>console.log("❌ ERREUR MONGO:", e.message));

app.use('/api/auth', authRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/expositions', expoRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/encheres', enchereRoutes);
app.use('/api/annonces', annonceRoutes);

app.get('/api/health', (req,res)=>res.json({status:'LIVE'}));

app.get(/^(?!\/api).*/, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`🚀 ART-ZEDMO LIVE sur ${PORT}`));
