import express from 'express';
import Exposition from '../models/Exposition.js';
import Artwork from '../models/Artwork.js';
import Enchere from '../models/Enchere.js';
const router = express.Router();

router.get('/', async(req,res)=>{ res.json(await Exposition.find().populate('oeuvres').sort({dateDebut:-1})); });

router.get('/active', async(req,res)=>{
  const expo = await Exposition.findOne({statut:{$in:['active','vote_clos','enchere']}}).populate({
    path:'oeuvres', match:{statut:{$in:['validee','en_expo','en_enchere']}}, 
    populate:{path:'artiste', select:'nom ville'}, options:{sort:{votesCount:-1}}
  }).sort({dateDebut:-1});
  if(!expo) return res.json({message:"Pas d'expo active", oeuvres:[]});
  res.json(expo);
});

router.post('/', async(req,res)=>{
  const expo = await Exposition.create({...req.body, statut:'active'});
  res.json(expo);
});

router.post('/:id/add-artwork', async(req,res)=>{
  try{
    const expo = await Exposition.findById(req.params.id);
    const art = await Artwork.findById(req.body.artworkId);
    art.statut='en_expo'; art.exposition=expo._id; await art.save();
    if(!expo.oeuvres.includes(art._id)){ expo.oeuvres.push(art._id); await expo.save(); }
    res.json({success:true, art, lien_viral:art.lien_vote_unique, whatsapp:`https://wa.me/?text=Vote pour "${art.titre}": https://art-zedmo.com/expo/vote/${art._id}`});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Calcul Top10 + passage en enchère avec prix x2
router.post('/:id/calculer-top-et-encherir', async(req,res)=>{
  try{
    const expo = await Exposition.findById(req.params.id);
    const top10 = await Artwork.find({exposition:expo._id, statut:'en_expo'}).sort({votesCount:-1}).limit(10);
    for(const art of top10){
      const existe = await Enchere.findOne({artwork:art._id, statut:'en_cours'});
      if(!existe){
        await Enchere.create({
          artwork:art._id, exposition:expo._id, 
          prixDepart:art.prix, enchereActuelle:art.prix,
          dateFin: new Date(Date.now()+3*24*60*60*1000)
        });
        art.statut='en_enchere'; await art.save();
      }
    }
    expo.oeuvres_top = top10.map(a=>a._id); expo.statut='enchere'; await expo.save();
    res.json({success:true, message:"Top10 en enchère LIVE - prix va x2", top:top10});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
