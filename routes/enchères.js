import express from 'express'; import Enchere from '../models/Enchere.js';
const router = express.Router();
router.get('/', async(req,res)=>{ res.json(await Enchere.find().populate('artwork').populate('gagnant')); });
router.post('/', async(req,res)=>{ res.json(await Enchere.create(req.body)); });
router.post('/:id/encherir', async(req,res)=>{
  const {userId,montant}=req.body; const e=await Enchere.findById(req.params.id);
  if(!e) return res.status(404).json({msg:'Enchere non trouvée'});
  if(montant<=e.enchereActuelle) return res.status(400).json({msg:'Montant trop bas'});
  e.enchereActuelle=montant; e.gagnant=userId; e.historique.push({user:userId,montant});
  if(new Date(e.dateFin)-new Date()<2*60*1000){ e.dateFin=new Date(new Date(e.dateFin).getTime()+2*60*1000); }
  await e.save(); res.json(e);
});
export default router;