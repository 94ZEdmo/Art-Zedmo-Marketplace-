// =========================================================
// === AZ V2 FIX - COUNTER + NFT BUY + LIVRAISON ===
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
  return { azmId:`AZM-${year}-${String(c.seq).padStart(6,'0')}`, seq:c.seq };
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

app.post('/api/nft/create', upload.single('image'), async (req,res)=>{
  try{
    const {titre, description, edition, prixUSDX, royalties, blockchain, categorie, artiste} = req.body;
    if(!titre) return res.status(400).json({error:'Titre requis'});
    const {azmId} = await getNextAZM();
    const certifId = `AZC-${azmId.slice(4)}`;
    const hash = `SHA256-${Buffer.from(azmId).toString('base64').slice(0,16)}`;
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

// === FIX 4 : ACHAT NFT + LIVRAISON ===
app.post('/api/nft/:id/buy', async (req,res)=>{
  try{
    const id = req.params.id;
    let nft = await NFT.findById(id).populate('artiste');
    if(!nft){
      // peut être un Artwork converti en NFT
      const Artwork = mongoose.models.Artwork;
      const art = await Artwork.findById(id).populate('artiste');
      if(!art) return res.status(404).json({error:'NFT/Artwork non trouvé'});
      // converti en NFT à la volée
      nft = await NFT.create({
        titre:art.titre, imageUrl:art.images?.[0]||art.image,
        prixUSDX:req.body.prixUSDX||100, royalties:5, blockchain:'Pi',
        azmId:art.azmId, certifId:art.certifId, hash:art.hash, artiste:art.artiste, isNFT:true
      });
    }
    const txHash = '0x'+Date.now().toString(16)+Math.random().toString(16).slice(2,10);
    nft.proprietaire = req.body.buyer||'Acheteur AZ';
    nft.proprietaireWallet = req.body.wallet||'PiWallet...';
    nft.vendu=true; nft.prixVenteFinal=nft.prixUSDX; nft.txHash=txHash; nft.dateVente=new Date();
    await nft.save();
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify/${nft.azmId}`;
    const downloadUrl = `${req.protocol}://${req.get('host')}/api/nft/${nft.azmId}/download?key=${txHash}`;
    res.json({
      success:true, txHash, azmId:nft.azmId, certifId:nft.certifId,
      verifyUrl, downloadUrl,
      recu:{ titre:nft.titre, image:nft.imageUrl, wallet:nft.proprietaireWallet, blockchain:nft.blockchain, royalties:`${nft.royalties}% → ${nft.artiste?.nom_artiste||'Artiste'}` },
      certificatPDF:`${verifyUrl}/pdf`
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
