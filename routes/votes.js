import express from 'express';
import Vote from '../models/Vote.js';
import Artwork from '../models/Artwork.js';
const router = express.Router();

// VOTE viral WhatsApp - 1 vote = 1 visiteur
router.post('/', async(req,res)=>{
  try{
    const {userId, artworkId, expositionId, votant_whatsapp} = req.body;
    if(!artworkId) return res.status(400).json({error:"artworkId requis"});

    // Anti-triche déjà géré par index unique dans le model
    const vote = await Vote.create({
      user: userId||null, 
      votant_whatsapp: votant_whatsapp||null,
      votant_ip: req.ip,
      artwork: artworkId,
      exposition: expositionId||null,
      source_lien: req.headers.referer||req.body.source_lien
    });

    // FIX PROBLEME 2 : incrémente vraiment le compteur pour tri populaire + affichage
    const art = await Artwork.findByIdAndUpdate(
      artworkId,
      { $inc: { votesCount: 1 } },
      { new: true }
    ).select('votesCount titre');

    res.json({success:true, total_votes_oeuvre: art.votesCount, vote});
  }catch(e){
    if(e.code===11000) return res.status(400).json({error:"Tu as déjà voté pour cette oeuvre (anti-triche)"});
    res.status(500).json({error:e.message});
  }
});

router.get('/top/:expoId', async(req,res)=>{
  try{
    const top = await Artwork.find({exposition:req.params.expoId}).sort({votesCount:-1}).limit(10).populate('artiste','nom nom_artiste ville');
    res.json(top);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/artwork/:artworkId', async(req,res)=>{
  try{
    const votes = await Vote.find({artwork:req.params.artworkId}).populate('user','nom nom_artiste').sort({createdAt:-1}).limit(100);
    res.json(votes);
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
