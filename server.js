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

const uploadDir = path.join(__dirname, 'public/uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, {recursive:true});

const storage = multer.diskStorage({
  destination: (req,file,cb)=>cb(null, uploadDir),
  filename: (req,file,cb)=>cb(null, Date.now()+'-'+file.originalname.replace(/\s/g,'_'))
});
const upload = multer({storage, limits:{fileSize:5*1024*1024}});

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
// === AZ V2 FIX - COUNTER SEQUENTIEL + NFT + LIVRAISON ===
// =========================================================
const counterSchema = new mongoose.Schema({ _id:String, seq:{type:Number, default:0} });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function getNextAZM(){
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate(
    { _id:`AZM-${year}` },
    { $inc:{seq:1} },
    { upsert:true, returnDocument:'after' }
  );
  const azmId = `AZM-${year}-${String(c.seq).padStart(6,'0')}`;
  const certifId = `AZC-${azmId.slice(4)}`;
  const hash = `SHA256-${Buffer.from(azmId).toString('base64').slice(0,16)}`;
  return { azmId, certifId, hash };
}

const nftSchema = new mongoose.Schema({
  titre:String, description:String, edition:{type:String, default:'1/1'},
  prixUSDX:Number, prixFCFA:Number, royalties:{type:Number, default:5},
  blockchain:{type:String, default:'Pi'}, categorie:String,
  artiste:{type:mongoose.Schema.Types.ObjectId, ref:'User'},
  azmId:{type:String, unique:true}, certifId:String, hash:String, imageUrl:String,
  deviseNFT:{type:String, default:'USDX'}, deviseClassique:{type:String, default:'FCFA'},
  isNFT:{type:Boolean, default:true}, proprietaire:String, proprietaireWallet:String,
  vendu:{type:Boolean, default:false}, prixVenteFinal:Number, txHash:String, dateVente:Date,
  createdAt:{type:Date, default:Date.now}
},{strict:false});
const NFT = mongoose.models.NFT || mongoose.model('NFT', nftSchema);

app.get('/api/artworks/verify/:azmId', async (req,res)=>{
  try{
    const azmId = req.params.azmId.toUpperCase().trim();
    let artwork = null;
    if(mongoose.models.Artwork){
      artwork = await mongoose.models.Artwork.findOne({azmId}).populate('artiste');
    }
    if(!artwork){
      const nft = await NFT.findOne({azmId}).populate('artiste');
      if(nft) return res.json({...nft.toObject(), verified:true, message:'✅ NFT Authentifié - '+nft.blockchain});
    }
    if(!artwork) return res.status(404).json({error:'AZM-ID non trouvé', azmId});
    res.json({...artwork.toObject(), verified:true, message:'✅ Œuvre Authentifiée'});
  }catch(err){ res.status(500).json({error:err.message}); }
});

app.get('/api/certificat/:azmId', async (req,res)=>{
  try{
    const azmId = req.params.azmId.toUpperCase();
    const nft = await NFT.findOne({azmId});
    const artwork = mongoose.models.Artwork? await mongoose.models.Artwork.findOne({azmId}).populate('artiste') : null;
    const data = artwork || nft;
    if(!data) return res.status(404).json({error:'Non trouvé'});
    res.json({
      titreCertificat:'ART-ZEDMO - CERTIFICAT D\'AUTHENTICITÉ',
      oeuvre:data.titre, artiste:data.artiste?.nom_artiste||'Artiste AZ',
      id:azmId, certificat:data.certifId, hash:data.hash,
      prixNFT:`${data.prixUSDX||100} USDX`, prixClassique:`${data.prix||0} FCFA`,
      verifyUrl:`${req.protocol}://${req.get('host')}/verify/${azmId}`
    });
  }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/nft/create', upload.single('image'), async (req,res)=>{
  try{
    const {titre, description, edition, prixUSDX, royalties, blockchain, categorie, artiste} = req.body;
    if(!titre) return res.status(400).json({error:'Titre requis'});
    const {azmId, certifId, hash} = await getNextAZM();
    let imageUrl = req.body.imageUrl;
    if(req.file) imageUrl = `/uploads/${req.file.filename}`;
    const nft = await NFT.create({
      titre, description, edition:edition||'1/1',
      prixUSDX:Number(prixUSDX)||100, royalties:Number(royalties)||5,
      blockchain:blockchain||'Pi', categorie:categorie||'Peinture',
      artiste:artiste||null, azmId, certifId, hash, imageUrl,
      deviseNFT:'USDX', deviseClassique:'FCFA', isNFT:true
    });
    res.json({success:true, nft, azmId, certifId, verifyUrl:`${req.protocol}://${req.get('host')}/verify/${azmId}`});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/nft', async (req,res)=>{
  const nfts = await NFT.find().sort({createdAt:-1}).populate('artiste').limit(100);
  res.json(nfts);
});

app.post('/api/nft/:id/buy', async (req,res)=>{
  try{
    const id = req.params.id;
    let nft = await NFT.findById(id).populate('artiste');
    if(!nft){
      const Artwork = mongoose.models.Artwork;
      const art = await Artwork.findById(id).populate('artiste');
      if(!art) return res.status(404).json({error:'Non trouvé'});
      const {azmId, certifId, hash} = art.azmId? {azmId:art.azmId, certifId:art.certifId, hash:art.hash} : await getNextAZM();
      nft = await NFT.create({
        titre:art.titre, imageUrl:art.images?.[0]||art.image,
        prixUSDX:req.body.prixUSDX||100, royalties:5, blockchain:'Pi',
        azmId, certifId, hash, artiste:art.artiste, isNFT:true
      });
    }
    const txHash = '0x'+Date.now().toString(16)+Math.random().toString(16).slice(2,10);
    nft.proprietaire = req.body.buyer||'Collectionneur AZ';
    nft.proprietaireWallet = req.body.wallet||'PiWallet...';
    nft.vendu=true; nft.prixVenteFinal=nft.prixUSDX; nft.txHash=txHash; nft.dateVente=new Date();
    await nft.save();
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify/${nft.azmId}`;
    const downloadUrl = `${req.protocol}://${req.get('host')}/api/nft/${nft.azmId}/download?key=${txHash}`;
    res.json({
      success:true, txHash, azmId:nft.azmId, certifId:nft.certifId,
      verifyUrl, downloadUrl,
      recu:{ titre:nft.titre, image:nft.imageUrl, wallet:nft.proprietaireWallet, blockchain:nft.blockchain, royalties:`${nft.royalties}% → ${nft.artiste?.nom_artiste||'Artiste'}` }
    });
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/nft/:azmId/download', async (req,res)=>{
  try{
    const nft = await NFT.findOne({azmId:req.params.azmId.toUpperCase()});
    if(!nft) return res.status(404).send('Non trouvé');
    if(req.query.key && req.query.key!==nft.txHash) return res.status(403).send('Clé invalide - achat requis');
    if(nft.imageUrl) return res.redirect(nft.imageUrl);
    res.json({download:nft.imageUrl});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/migrate/azm-ids', async (req,res)=>{
  try{
    if(!mongoose.models.Artwork) return res.json({msg:'No Artwork model'});
    const arts = await mongoose.models.Artwork.find({$or:[{azmId:{$exists:false}},{azmId:/^AZM-17/}]});
    let count=0;
    for(const a of arts){
      const {azmId, certifId, hash} = await getNextAZM();
      a.azmId = azmId; a.certifId = certifId; a.hash = hash;
      await a.save(); count++;
    }
    res.json({migrated:count});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get(/^(?!\/api).*/, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`🚀 ART-ZEDMO LIVE sur ${PORT} + AZ V2 FIX`));
