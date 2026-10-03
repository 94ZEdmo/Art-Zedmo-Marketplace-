import express from 'express';
import Enchere from '../models/Enchere.js';
import Artwork from '../models/Artwork.js';
const router = express.Router();

router.get('/', async(req,res)=>{
  const encheres = await Enchere.find({statut:'en_cours'}).populate({path:'artwork', populate:{path:'artiste', select:'nom ville'}}).sort({enchereActuelle:-1});
  res.json(encheres);
});

router.get('/:id', async(req,res)=>{
  const ench = await Enchere.findById(req.params.id).populate('artwork').populate('dernierEncherisseur','nom');
  res.json(ench);
});

// ENCHÉRIR - prix x2 + auto-prolongation 2min
router.post('/:id/encherir', async(req,res)=>{
  try{
    const {userId, montant} = req.body;
    const ench = await Enchere.findById(req.params.id);
    if(!ench) return res.status(404).json({error:"Enchère non trouvée"});
    if(ench.statut!=='en_cours') return res.status(400).json({error:"Enchère terminée"});
    if(Number(montant) <= ench.enchereActuelle) return res.status(400).json({error:`Montant doit être > ${ench.enchereActuelle} FCFA`});
    ench.enchereActuelle = Number(montant);
    ench.dernierEncherisseur = userId;
    ench.offres.push({user:userId, montant:Number(montant)});
    await ench.save(); // va auto-prolonger de 2min si besoin
    res.json({success:true, nouvelle_enchere:ench.enchereActuelle, dateFin:ench.dateFin, message:"Enchère acceptée +2min si <2min restantes"});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
