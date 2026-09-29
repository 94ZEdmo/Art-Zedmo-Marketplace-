import express from 'express'; import Exposition from '../models/Exposition.js';
const router = express.Router();
router.get('/', async(req,res)=>{ res.json(await Exposition.find().populate('oeuvres')); });
router.get('/active', async(req,res)=>{ res.json(await Exposition.findOne({statut:'active'}).populate({path:'oeuvres', match:{statut:'validee'}})); });
router.post('/', async(req,res)=>{ res.json(await Exposition.create(req.body)); });
router.post('/:id/add-artwork', async(req,res)=>{ const expo=await Exposition.findById(req.params.id); expo.oeuvres.push(req.body.artworkId); await expo.save(); res.json(expo); });
export default router;