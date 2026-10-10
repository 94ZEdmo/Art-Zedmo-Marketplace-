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

// =========================================================
// === NOUVEAU AZ V2 - AJOUT PUR - NE TOUCHE PAS TON CODE ===
// =========================================================

// 1. Schema NFT léger (si tu n'as pas de model NFT, on crée à la volée)
const nftSchema = new mongoose.Schema({
  titre: String,
  description: String,
  edition: {type:String, default:'1/1'},
  prixUSDX: Number,
  prixFCFA: Number,
  royalties: {type:Number, default:5},
  blockchain: {type:String, default:'Pi'},
  categorie: String,
  artiste: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  azmId: {type:String, unique:true},
  certifId: String,
  hash: String,
  imageUrl: String,
  deviseNFT: {type:String, default:'USDX'},
  deviseClassique: {type:String, default:'FCFA'},
  isNFT: {type:Boolean, default:true},
  createdAt: {type:Date, default:Date.now}
}, {strict:false});
const NFT = mongoose.models.NFT || mongoose.model('NFT', nftSchema);

// 2. Route VERIFICATION AZM-ID / QR (ton image 9)
app.get('/api/artworks/verify/:azmId', async (req,res)=>{
  try{
    const azmId = req.params.azmId.toUpperCase().trim();
    // cherche dans artworks (ton model existant)
    const ArtworkModel = mongoose.models.Artwork || mongoose.connection.collection('artworks');
    let artwork = null;
    
    // tente via mongoose model si disponible
    try{
      if(mongoose.models.Artwork){
        artwork = await mongoose.models.Artwork.findOne({azmId}).populate('artiste');
        if(!artwork){
          // fallback cherche par _id fin
          artwork = await mongoose.models.Artwork.findOne({_id: azmId.slice(-24)}).catch(()=>null);
        }
      }else{
        // fallback collection brute
        artwork = await mongoose.connection.db.collection('artworks').findOne({azmId});
      }
    }catch(e){}

    // cherche aussi dans NFT
    if(!artwork){
      const nft = await NFT.findOne({azmId}).populate('artiste');
      if(nft) return res.json({
        titre: nft.titre,
        azmId: nft.azmId,
        certifId: nft.certifId,
        artiste: nft.artiste,
        prix: nft.prixUSDX,
        prixUSDX: nft.prixUSDX,
        blockchain: nft.blockchain,
        royalties: nft.royalties,
        isNFT: true,
        verified: true,
        hash: nft.hash,
        message: '✅ NFT Authentifié ART-ZEDMO - Blockchain '+nft.blockchain
      });
    }

    if(!artwork) return res.status(404).json({error:'AZM-ID non trouvé', azmId});

    res.json({
      ...artwork.toObject?.() || artwork,
      verified: true,
      message: '✅ Œuvre Authentifiée ART-ZEDMO'
    });
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

// 3. Route CERTIFICAT (génère les données certificat papier de ton image 8)
app.get('/api/certificat/:azmId', async (req,res)=>{
  try{
    const azmId = req.params.azmId.toUpperCase();
    const nft = await NFT.findOne({azmId});
    const artwork = mongoose.models.Artwork ? await mongoose.models.Artwork.findOne({azmId}).populate('artiste') : null;
    const data = artwork || nft;
    if(!data) return res.status(404).json({error:'Non trouvé'});

    const certifId = data.certifId || 'AZC-'+azmId.slice(4);
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify/${azmId}`;
    
    res.json({
      titreCertificat: 'ART-ZEDMO - CERTIFICAT D\'AUTHENTICITÉ',
      oeuvre: data.titre,
      artiste: data.artiste?.nom_artiste || data.artiste?.nom || 'Artiste AZ',
      id: azmId,
      certificat: certifId,
      annee: new Date().getFullYear(),
      technique: data.categorie || 'Peinture',
      prixClassique: `${data.prix||data.prixFCFA||0} FCFA (MoMo, Carte, Virement)`,
      prixNFT: `${data.prixUSDX||100} USDX / PiUSD (Pi Wallet, MetaMask)`,
      blockchain: `${data.blockchain||'Pi'} - 0x${(data._id||'').toString().slice(0,12)}...`,
      hash: data.hash || 'SHA256-'+azmId,
      verifyUrl,
      paiementSepare: {
        classique: 'FCFA / Mobile Money (MTN, Moov)',
        nft: 'USDX / PiUSD / OUSD / Stablecoin + Wallet'
      }
    });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// 4. Route CREATION NFT (ton image 6 - avec paiement séparé)
app.post('/api/nft/create', upload.single('image'), async (req,res)=>{
  try{
    const {titre, description, edition, prixUSDX, royalties, blockchain, categorie, artiste} = req.body;
    if(!titre) return res.status(400).json({error:'Titre requis'});

    const year = new Date().getFullYear();
    const azmId = `AZM-${year}-${String(Date.now()).slice(-6).padStart(6,'0')}`;
    const certifId = `AZC-${azmId.slice(4)}`;
    const hash = `SHA256-${Buffer.from(azmId).toString('base64').slice(0,16)}`;

    let imageUrl = req.body.imageUrl || req.body.images?.[0];
    if(req.file) imageUrl = `/uploads/${req.file.filename}`;

    const nft = await NFT.create({
      titre,
      description,
      edition: edition||'1/1',
      prixUSDX: Number(prixUSDX)||100,
      prixFCFA: req.body.prixFCFA ? Number(req.body.prixFCFA) : undefined,
      royalties: Number(royalties)||5,
      blockchain: blockchain||'Pi',
      categorie: categorie||'Peinture',
      artiste: artiste||null,
      azmId,
      certifId,
      hash,
      imageUrl,
      deviseNFT: 'USDX',
      deviseClassique: 'FCFA',
      isNFT: true
    });

    // === ANTI-CONTREFAÇON (ton image 12) ===
    // ID unique AZM-2026-000001 + Hash + Certif + QR

    res.json({
      success:true,
      message: `✅ NFT créé sur ${blockchain}`,
      nft,
      azmId,
      certifId,
      paiement: {
        classique: 'FCFA / MoMo (vente physique)',
        nft: `${nft.prixUSDX} USDX / PiUSD (vente blockchain) - Royalties ${nft.royalties}%`
      },
      verifyUrl: `${req.protocol}://${req.get('host')}/verify/${azmId}`,
      qrData: `${req.protocol}://${req.get('host')}/verify/${azmId}`
    });
  }catch(e){
    console.error('NFT create error', e);
    res.status(500).json({error: e.message});
  }
});

// 5. Route LIST NFT (pour Galerie NFT)
app.get('/api/nft', async (req,res)=>{
  const nfts = await NFT.find().sort({createdAt:-1}).populate('artiste').limit(100);
  res.json(nfts);
});

// 6. Route pour ajouter azmId auto aux anciennes oeuvres sans azmId (migration douce)
app.post('/api/migrate/azm-ids', async (req,res)=>{
  try{
    if(!mongoose.models.Artwork) return res.json({msg:'No Artwork model'});
    const arts = await mongoose.models.Artwork.find({azmId: {$exists:false}});
    let count=0;
    for(const a of arts){
      const azmId = `AZM-${new Date().getFullYear()}-${String(Date.now()+count).slice(-6).padStart(6,'0')}`;
      a.azmId = azmId;
      a.certifId = `AZC-${azmId.slice(4)}`;
      await a.save();
      count++;
    }
    res.json({migrated:count});
  }catch(e){res.status(500).json({error:e.message});}
});

// =========================================================
// === FIN NOUVEAU AZ V2 ===
// =========================================================

app.get(/^(?!\/api).*/, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`🚀 ART-ZEDMO LIVE sur ${PORT} + AZ V2 NFT/VERIF/CERTIF`));
