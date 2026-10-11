import express from 'express';
import Artwork from '../models/Artwork.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
const router = express.Router();

// Counter pour AZM-2026-000001
async function getNextAZM(){
  const Counter = mongoose.models.Counter || mongoose.model('Counter', new mongoose.Schema({ _id:String, seq:Number }));
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate(
    { _id: `AZM-${year}` },
    { $inc:{seq:1} },
    { upsert:true, returnDocument:'after' }
  );
  return `AZM-${year}-${String(c.seq).padStart(6,'0')}`;
}

router.get('/', async(req,res)=>{
  try{
    const {tri, search, categorie, statut} = req.query;
    let filter = {};
    if(req.query.all==='true' || statut==='all'){ filter = {}; }
    else { filter.statut = statut || {$in:['validee','en_expo','en_enchere','vendue']}; }
    if(search) filter.titre = {$regex:search, $options:'i'};
    if(categorie && categorie!=='Tous') filter.categorie = categorie;
    let sort = {createdAt:-1};
    if(tri==='populaire') sort = {votesCount:-1};
    if(tri==='prix') sort = {prix:1};
    const arts = await Artwork.find(filter).populate('artiste','nom nom_artiste ville whatsapp').sort(sort).limit(200);
    res.json(arts);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/:id', async(req,res)=>{
  try{
    const art = await Artwork.findById(req.params.id).populate('artiste','nom nom_artiste ville bio whatsapp').populate('exposition','titre');
    if(!art) return res.status(404).json({error:"Oeuvre non trouvée"});
    art.vues+=1; await art.save();
    res.json(art);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/', async(req,res)=>{
  try{
    let {artiste, artiste_nom, whatsapp, titre, description, prix, images, image, categorie, ville} = req.body;
    if(!titre ||!prix) return res.status(400).json({error:"Titre et prix requis"});
    if(!artiste && whatsapp){
      let u = await User.findOne({whatsapp});
      if(!u) u = await User.create({nom:artiste_nom||"Artiste Zedmo", whatsapp, password:"123456", ville:ville||"Abomey-Calavi", role:"artiste"});
      artiste = u._id;
    }
    if(!artiste) return res.status(400).json({error:"artiste ou whatsapp requis"});
    // === FIX 2 : AZM propre ===
    const azmId = await getNextAZM();
    const certifId = 'AZC-'+azmId.slice(4);
    const hash = 'SHA256-'+Buffer.from(azmId).toString('base64').slice(0,16);
    const artwork = await Artwork.create({
      titre, description, prix:Number(prix),
      images: images || (image? [image] : []),
      categorie:categorie||"Peinture", ville:ville||"Abomey-Calavi",
      artiste, statut:'en_attente',
      azmId, certifId, hash
    });
    if(artiste) await User.findByIdAndUpdate(artiste, {$inc:{totalOeuvres:1}});
    res.json({success:true, artwork, azmId, certifId, lien_viral:artwork.lien_vote_unique});
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/:id/valider', async(req,res)=>{
  try{
    const art = await Artwork.findByIdAndUpdate(req.params.id, {statut:req.body.statut||'validee'}, {new:true});
    res.json(art);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/:id', async(req,res)=>{
  try{
    const art = await Artwork.findByIdAndDelete(req.params.id);
    if(art && art.artiste) await User.findByIdAndUpdate(art.artiste, {$inc:{totalOeuvres:-1}});
    res.json({success:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/:id/vote', async(req,res)=>{
  try{
    const art = await Artwork.findByIdAndUpdate(req.params.id, { $inc:{votesCount:1, votes:1, vues:1} }, {new:true}).populate('artiste','nom nom_artiste');
    if(!art) return res.status(404).json({error:"Oeuvre non trouvée"});
    res.json({success:true, votesCount:art.votesCount, artwork:art});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// === FIX 4 : Achat FCFA (classique) ===
router.post('/:id/buy-fcfa', async(req,res)=>{
  try{
    const art = await Artwork.findById(req.params.id);
    if(!art) return res.status(404).json({error:'Non trouvé'});
    art.statut='vendue'; art.prixVendu=art.prix; await art.save();
    res.json({success:true, type:'FCFA', verifyUrl:`/verify/${art.azmId}`, message:`Vendu FCFA - Contact artiste WhatsApp`});
  }catch(e){res.status(500).json({error:e.message})}
});

export default router;
