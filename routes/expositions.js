import express from 'express';
import Exposition from '../models/Exposition.js';
import Artwork from '../models/Artwork.js';
import Enchere from '../models/Enchere.js';
const router = express.Router();

router.get('/', async(req,res)=>{ 
  try{
    res.json(await Exposition.find().populate('oeuvres').sort({dateDebut:-1})); 
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/active', async(req,res)=>{
  try{
    const expo = await Exposition.findOne({statut:{$in:['active','vote_clos','enchere']}}).populate({
      path:'oeuvres', 
      match:{statut:{$in:['validee','en_expo','en_enchere']}}, 
      populate:{path:'artiste', select:'nom nom_artiste ville whatsapp'},
      options:{sort:{votesCount:-1}}
    }).sort({dateDebut:-1});
    if(!expo) return res.json({message:"Pas d'expo active", oeuvres:[]});
    res.json(expo);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/', async(req,res)=>{
  try{
    const expo = await Exposition.create({...req.body, statut:'active'});
    res.json(expo);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/:id/add-artwork', async(req,res)=>{
  try{
    const expo = await Exposition.findById(req.params.id);
    if(!expo) return res.status(404).json({error:"Expo non trouvée"});
    const art = await Artwork.findById(req.body.artworkId);
    if(!art) return res.status(404).json({error:"Oeuvre non trouvée"});
    
    art.statut='en_expo'; 
    art.exposition=expo._id; 
    await art.save();
    
    if(!expo.oeuvres.includes(art._id)){ 
      expo.oeuvres.push(art._id); 
      await expo.save(); 
    }
    
    res.json({
      success:true, 
      art, 
      lien_viral: art.lien_vote_unique || `${process.env.FRONT_URL||'https://art-zedmo.com'}/expo/vote/${art._id}`,
      whatsapp:`https://wa.me/?text=Vote pour "${art.titre}": https://art-zedmo.com/expo/vote/${art._id}`
    });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// === CORRECTION LIVE DECOMPTE + FIX UNDEFINED ===
router.post('/:id/calculer-top-et-encherir', async(req,res)=>{
  try{
    const expo = await Exposition.findById(req.params.id);
    if(!expo) return res.status(404).json({error:"Expo non trouvée"});
    
    // FIX 1: Prend la date LIVE envoyée par admin.html, sinon +3 jours par défaut
    const dateFin = req.body.dateFin ? new Date(req.body.dateFin) : new Date(Date.now()+3*24*60*60*1000);
    
    const top10 = await Artwork.find({exposition:expo._id, statut:'en_expo'}).sort({votesCount:-1}).limit(10);
    
    for(const art of top10){
      const existe = await Enchere.findOne({artwork:art._id, statut:'en_cours'});
      if(!existe){
        await Enchere.create({
          artwork: art._id,
          titre: art.titre, // FIX 2: Pour éviter "undefined"
          exposition: expo._id, 
          prixDepart: art.prix, 
          enchereActuelle: Math.round(art.prix * 2),
          dateFin: dateFin // FIX LIVE: Utilise la date de l'admin -> 02j 03h 50m restant
        });
        art.statut='en_enchere'; 
        await art.save();
      } else {
        // Si existe déjà, on met à jour sa dateFin avec celle de l'admin
        existe.dateFin = dateFin;
        await existe.save();
      }
    }
    
    expo.oeuvres_top = top10.map(a=>a._id); 
    expo.statut='enchere'; 
    await expo.save();
    
    res.json({success:true, message:`Top10 en enchère LIVE jusqu'à ${dateFin.toLocaleString()} - prix x2`, top:top10, dateFin});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
