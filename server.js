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
mongoose.connect(MONGO_URL).then(()=>console.log("✅ MongoDB CONNECTÉ")).catch(e=>console.log("❌ MONGO:", e.message));

app.use('/api/auth', authRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/expositions', expoRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/encheres', enchereRoutes);
app.use('/api/annonces', annonceRoutes);

app.get('/api/health', (req,res)=>res.json({status:'LIVE', pi_wallet: process.env.PI_WALLET? 'OK' : 'MANQUE', pi_key: process.env.PI_API_KEY? 'OK' : 'MANQUE'}));

// --- COUNTER AZM ---
const counterSchema = new mongoose.Schema({ _id:String, seq:{type:Number, default:0} });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
async function getNextAZM(){
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate({ _id:`AZM-${year}` }, { $inc:{seq:1} }, { upsert:true, returnDocument:'after' });
  const azmId = `AZM-${year}-${String(c.seq).padStart(6,'0')}`;
  return { azmId, certifId: `AZC-${azmId.slice(4)}`, hash: `SHA256-${Buffer.from(azmId).toString('base64').slice(0,16)}` };
}
const nftSchema = new mongoose.Schema({
  titre:String, description:String, edition:{type:String, default:'1/1'},
  prixUSDX:Number, royalties:{type:Number, default:5}, blockchain:{type:String, default:'Pi'},
  categorie:String, artiste:{type:mongoose.Schema.Types.ObjectId, ref:'User'},
  azmId:{type:String, unique:true}, certifId:String, hash:String, imageUrl:String,
  proprietaire:String, proprietaireWallet:String, vendu:{type:Boolean, default:false},
  prixVenteFinal:Number, txHash:String, dateVente:Date, createdAt:{type:Date, default:Date.now}
},{strict:false});
const NFT = mongoose.models.NFT || mongoose.model('NFT', nftSchema);

// --- FIX SCREENSHOT: ROUTE MANQUANTE /api/nft/:id/buy ---
app.post('/api/nft/:id/buy', async (req,res)=>{
  try{
    const {buyer, wallet} = req.body;
    if(!wallet || wallet.length<3) return res.status(400).json({error:'Wallet invalide - entre G... ou 0x'});
    const raw = req.params.id;
    let nft = null;
    if(mongoose.Types.ObjectId.isValid(raw)) nft = await NFT.findById(raw);
    if(!nft) nft = await NFT.findOne({azmId: raw.toUpperCase()});
    if(!nft && mongoose.models.Artwork){
      const art = mongoose.Types.ObjectId.isValid(raw)? await mongoose.models.Artwork.findById(raw) : await mongoose.models.Artwork.findOne({azmId: raw.toUpperCase()});
      if(art){
        const {azmId, certifId, hash} = art.azmId? {azmId: art.azmId, certifId: art.certifId, hash: art.hash} : await getNextAZM();
        nft = await NFT.create({ titre: art.titre, description: art.description, imageUrl: art.images?.[0]||art.image, prixUSDX:100, royalties:5, azmId, certifId, hash, artiste: art.artiste, blockchain:'Pi' });
      }
    }
    if(!nft) return res.status(404).json({error:'NFT / Oeuvre non trouvée'});
    const txHash = '0x'+Date.now().toString(16)+Math.random().toString(16).slice(2,10)+Math.random().toString(16).slice(2,6);
    nft.vendu=true; nft.txHash=txHash; nft.proprietaire=buyer||'Zedmo'; nft.proprietaireWallet=wallet; nft.prixVenteFinal=100; nft.dateVente=new Date(); await nft.save();
    res.json({
      success:true, txHash, azmId:nft.azmId,
      verifyUrl:`${req.protocol}://${req.get('host')}/verify/${nft.azmId}`,
      downloadUrl:`${req.protocol}://${req.get('host')}/api/nft/${nft.azmId}/download?key=${txHash}`,
      recu:{titre:nft.titre}
    });
  }catch(e){ console.log(e); res.status(500).json({error:e.message}); }
});

// --- PI PAYMENT REEL ---
app.post('/api/pay/pi/approve', async (req,res)=>{
  try{
    const { paymentId } = req.body;
    const r = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`,{ method:'POST', headers:{'Authorization': `Key ${process.env.PI_API_KEY}`} });
    const j = await r.json(); if(!r.ok) return res.status(r.status).json(j);
    res.json({approved:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/pay/pi/complete', async (req,res)=>{
  try{
    const { paymentId, txid, artworkId, buyer, wallet } = req.body;
    const r = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`,{
      method:'POST', headers:{'Authorization': `Key ${process.env.PI_API_KEY}`, 'Content-Type':'application/json'},
      body: JSON.stringify({txid})
    });
    const j = await r.json(); if(!r.ok) return res.status(r.status).json(j);
    let nft = mongoose.Types.ObjectId.isValid(artworkId)? await NFT.findById(artworkId) : null;
    if(!nft) nft = await NFT.findOne({azmId: artworkId?.toUpperCase()});
    if(!nft && mongoose.models.Artwork){
      const art = mongoose.Types.ObjectId.isValid(artworkId)? await mongoose.models.Artwork.findById(artworkId) : null;
      if(art) nft = await NFT.findOne({azmId: art.azmId}) || await NFT.create({ titre: art.titre, imageUrl: art.images?.[0]||art.image, prixUSDX:100, azmId: art.azmId, certifId: art.certifId, hash: art.hash, artiste: art.artiste, blockchain:'Pi', isNFT:true });
    }
    if(nft){ nft.vendu=true; nft.txHash=txid; nft.blockchain='Pi'; nft.proprietaire=buyer; nft.proprietaireWallet=wallet; nft.prixVenteFinal=100; nft.dateVente=new Date(); await nft.save(); }
    res.json({success:true, txHash:txid, azmId:nft?.azmId, verifyUrl:`${req.protocol}://${req.get('host')}/verify/${nft?.azmId}`, downloadUrl:`${req.protocol}://${req.get('host')}/api/nft/${nft?.azmId}/download?key=${txid}`});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// --- AUTRES ROUTES (verify, certificat, nft, download) ---
app.get('/api/artworks/verify/:azmId', async (req,res)=>{ try{ const azmId=req.params.azmId.toUpperCase(); let a= mongoose.models.Artwork? await mongoose.models.Artwork.findOne({azmId}).populate('artiste'):null; if(!a){ const nft=await NFT.findOne({azmId}).populate('artiste'); if(nft) return res.json({...nft.toObject(), verified:true}); } if(!a) return res.status(404).json({error:'AZM non trouvé'}); res.json({...a.toObject(), verified:true}); }catch(e){res.status(500).json({error:e.message})} });
app.get('/api/nft', async (req,res)=>{ res.json(await NFT.find().sort({createdAt:-1}).limit(100)); });
app.get('/api/nft/:azmId/download', async (req,res)=>{ const nft=await NFT.findOne({azmId:req.params.azmId.toUpperCase()}); if(!nft) return res.status(404).send('Non trouvé'); if(req.query.key!==nft.txHash) return res.status(403).send('Clé invalide'); if(nft.imageUrl) return res.redirect(nft.imageUrl); res.json(nft); });
app.get(/^(?!\/api).*/, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`🚀 LIVE + PI BRANCHE sur ${PORT} Wallet ${process.env.PI_WALLET}`));
