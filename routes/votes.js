import express from 'express'; import Vote from '../models/Vote.js'; import Artwork from '../models/Artwork.js';
const router = express.Router();
router.post('/', async(req,res)=>{
  try{
    const {userId, artworkId, expositionId}=req.body;
    const exist=await Vote.findOne({user:userId, artwork:artworkId});
    if(exist) return res.status(400).json({msg:'1 compte = 1 vote par oeuvre'});
    const v=await Vote.create({user:userId, artwork:artworkId, exposition:expositionId});
    await Artwork.findByIdAndUpdate(artworkId,{$inc:{votesCount:1}});
    res.json(v);
  }catch(e){res.status(400).json({msg:e.message})}
});
router.get('/top/:expoId', async(req,res)=>{ res.json(await Artwork.find({exposition:req.params.expoId, statut:'validee'}).sort({votesCount:-1}).limit(10).populate('artiste')); });
export default router;