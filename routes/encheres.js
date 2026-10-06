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

// === FIX 1: SUPPRIMER - pour ton bouton rouge 🗑 Supprimer ===
router.delete('/:id', async(req,res)=>{
  try{
    const ench = await Enchere.findById(req.params.id);
    if(!ench) return res.status(404).json({error:"Non trouvée"});
    if(ench.artwork){
      await Artwork.findByIdAndUpdate(ench.artwork, {statut:'validee'});
    }
    await Enchere.findByIdAndDelete(req.params.id);
    res.json({success:true, message:"Enchère supprimée - oeuvre remise en galerie"});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// === FIX 2: MODIFIER UNE DATE LIVE ===
router.put('/:id', async(req,res)=>{
  try{
    const ench = await Enchere.findByIdAndUpdate(req.params.id, 
      {dateFin: new Date(req.body.dateFin)}, 
      {new:true}
    );
    res.json(ench);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// === FIX 3: MODIFIER TOUTES LES DATES LIVE D'UN COUP - pour que 02j 03h 13m change ===
router.put('/bulk/update-date', async(req,res)=>{
  try{
    const dateFin = new Date(req.body.dateFin);
    const result = await Enchere.updateMany({statut:'en_cours'}, {dateFin});
    res.json({success:true, modified:result.modifiedCount, dateFin});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
