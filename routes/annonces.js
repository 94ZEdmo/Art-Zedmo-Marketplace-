import express from 'express';
import Annonce from '../models/Annonce.js';
const router = express.Router();

router.get('/', async(req,res)=>{
  const annonces = await Annonce.find({active:true}).sort({createdAt:-1}).limit(5);
  res.json(annonces);
});

router.post('/', async(req,res)=>{
  await Annonce.updateMany({}, {active:false}); // désactive anciennes
  const annonce = await Annonce.create({titre:req.body.titre, message:req.body.message, type:req.body.type||'expo', active:true});
  res.json(annonce);
});

export default router;
