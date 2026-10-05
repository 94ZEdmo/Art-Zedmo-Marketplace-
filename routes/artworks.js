import express from 'express';
import Artwork from '../models/Artwork.js';
import User from '../models/User.js';
const router = express.Router();

// GET Galerie - Support ?all=true pour admin
router.get('/', async(req,res)=>{
  try{
    const {tri, search, categorie, statut} = req.query;
    let filter = {};

    if(req.query.all==='true' || statut==='all'){
      filter = {};
    } else {
      filter.statut = statut || {$in:['validee','en_expo','en_enchere']};
    }

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
    if(!titre || !prix) return res.status(400).json({error:"Titre et prix requis"});
    if(!artiste && whatsapp){
      let u = await User.findOne({whatsapp});
      if(!u) u = await User.create({nom:artiste_nom||"Artiste Zedmo", whatsapp, password:"123456", ville:ville||"Abomey-Calavi", role:"artiste"});
      artiste = u._id;
    }
    if(!artiste) return res.status(400).json({error:"artiste ou whatsapp requis"});
    const artwork = await Artwork.create({
      titre, 
      description, 
      prix:Number(prix), 
      images: images || (image ? [image] : []),
      categorie:categorie||"Peinture", 
      ville:ville||"Abomey-Calavi",
      artiste, 
      statut:'validee'
    });
    if(artiste) await User.findByIdAndUpdate(artiste, {$inc:{totalOeuvres:1}});
    res.json({success:true, artwork, lien_viral:artwork.lien_vote_unique});
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/:id/valider', async(req,res)=>{
  try{
    const newStatut = req.body.statut || 'validee';
    const art = await Artwork.findByIdAndUpdate(req.params.id, {statut:newStatut}, {new:true});
    res.json(art);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/:id', async(req,res)=>{
  try{
    const art = await Artwork.findByIdAndDelete(req.params.id);
    if(art && art.artiste){
      await User.findByIdAndUpdate(art.artiste, {$inc:{totalOeuvres:-1}});
    }
    res.json({success:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
