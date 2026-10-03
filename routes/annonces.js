import express from 'express';
import Annonce from '../models/Annonce.js';
const router = express.Router();

// GET toutes actives pour bannière site
router.get('/', async(req,res)=>{
  try{
    const annonces = await Annonce.find({active:true}).sort({createdAt:-1}).limit(10);
    res.json(annonces);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST nouvelle annonce LIVE - désactive les anciennes auto
router.post('/', async(req,res)=>{
  try{
    await Annonce.updateMany({}, {active:false});
    const annonce = await Annonce.create({
      titre:req.body.titre || req.body.message,
      message:req.body.message || req.body.titre,
      type:req.body.type||'expo',
      active:true
    });
    res.json(annonce);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// DELETE
router.delete('/:id', async(req,res)=>{
  try{
    await Annonce.findByIdAndDelete(req.params.id);
    res.json({success:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// PUT désactiver (compat avec ton ancien admin.html)
router.put('/:id/desactiver', async(req,res)=>{
  try{
    const annonce = await Annonce.findByIdAndUpdate(req.params.id, {active:false}, {new:true});
    res.json(annonce);
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
