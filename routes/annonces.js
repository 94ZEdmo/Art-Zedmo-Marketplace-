import express from 'express'; import Annonce from '../models/Annonce.js';
const router = express.Router();
router.get('/', async(req,res)=>{ res.json(await Annonce.find({active:true}).sort({createdAt:-1})); });
router.post('/', async(req,res)=>{ res.json(await Annonce.create(req.body)); });
router.put('/:id/desactiver', async(req,res)=>{ res.json(await Annonce.findByIdAndUpdate(req.params.id,{active:false},{new:true})); });
export default router;
