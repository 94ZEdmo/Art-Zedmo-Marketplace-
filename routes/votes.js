import express from 'express';
import Vote from '../models/Vote.js';
import Artwork from '../models/Artwork.js';
const router = express.Router();

// VOTE viral WhatsApp - 1 vote = 1 visiteur
router.post('/', async(req,res)=>{
  try{
    const {userId, artworkId, expositionId, votant_whatsapp} = req.body;
    if(!artworkId) return res.status(400).json({error:"artworkId requis"});
    const vote = await Vote.create({
      user: userId||null, 
      votant_whatsapp: votant_whatsapp||null,
      votant_ip: req.ip,
      artwork: artworkId,
      exposition: expositionId||null,
      source_lien: req.headers.referer||req.body.source_lien
    });
    const art = await Artwork.findById(artworkId).select('votesCount titre');
    res.json({success:true, total_votes_oeuvre:art.votesCount, vote});
  }catch(e){
    if(e.code===11000) return res.status(400).json({error:"Tu as déjà voté pour cette oeuvre (anti-triche)"});
    res.status(500).json({error:e.message});
  }
});

router.get('/top/:expoId', async(req,res)=>{
  const top = await Artwork.find({exposition:req.params.expoId}).sort({votesCount:-1}).limit(10).populate('artiste','nom ville');
  res.json(top);
});

router.get('/artwork/:artworkId', async(req,res)=>{
  const votes = await Vote.find({artwork:req.params.artworkId}).populate('user','nom').sort({createdAt:-1}).limit(100);
  res.json(votes);
});

export default router;
