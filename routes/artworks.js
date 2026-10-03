import express from 'express';
import Artwork from '../models/Artwork.js';
import User from '../models/User.js';
const router = express.Router();

// GET Galerie avec tri populaire / recent + search
router.get('/', async(req,res)=>{
  try{
    const {tri, search, categorie, statut} = req.query;
    let filter = {statut: statut || {$in:['validee','en_expo','en_enchere']}};
    if(search) filter.titre = {$regex:search, $options:'i'};
    if(categorie) filter.categorie = categorie;
    let sort = {createdAt:-1};
    if(tri==='populaire') sort = {votesCount:-1};
    if(tri==='prix') sort = {prix:1};
    const arts = await Artwork.find(filter).populate('artiste','nom ville whatsapp').sort(sort).limit(100);
    res.json(arts);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/:id', async(req,res)=>{
  const art = await Artwork.findById(req.params.id).populate('artiste','nom ville bio').populate('exposition','titre');
  if(art){ art.vues+=1; await art.save(); }
  res.json(art);
});

// POST Publier - Double boucle
router.post('/', async(req,res)=>{
  try{
    let {artiste, artiste_nom, whatsapp, titre, description, prix, images, categorie, ville} = req.body;
    // Si pas d'artiste ID, on crée ou retrouve par whatsapp
    if(!artiste && whatsapp){
      let u = await User.findOne({whatsapp});
      if(!u) u = await User.create({nom:artiste_nom||"Artiste Zedmo", whatsapp, password:"123456", ville:ville||"Abomey-Calavi"});
      artiste = u._id;
    }
    const artwork = await Artwork.create({
      titre, description, prix:Number(prix), images:images||[req.body.image], 
      categorie:categorie||"Peinture", ville:ville||"Abomey-Calavi",
      artiste, statut:'validee'
    });
    if(artiste) await User.findByIdAndUpdate(artiste, {$inc:{totalOeuvres:1}});
    res.json({success:true, artwork, lien_viral:artwork.lien_vote_unique});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// PUT validation admin <24h
router.put('/:id/valider', async(req,res)=>{
  const art = await Artwork.findByIdAndUpdate(req.params.id, {statut:req.body.statut||'validee'}, {new:true});
  res.json(art);
});

export default router;
