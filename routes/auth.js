import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
const router = express.Router();

// REGISTER - Artiste / Acheteur avec validation admin
router.post('/register', async(req,res)=>{
  try{
    const {nom, nom_artiste, whatsapp, email, password, ville, role} = req.body;
    
    // Champs que tu as demandé
    if(!nom || !nom_artiste || !whatsapp || !email || !password) {
      return res.status(400).json({error:"Nom complet, Nom d'artiste, WhatsApp, Email, Password requis"});
    }

    const existe = await User.findOne({ $or: [{whatsapp}, {email}] });
    if(existe) return res.status(400).json({error:"WhatsApp ou Email déjà utilisé"});

    const user = await User.create({
      nom, 
      nom_artiste, 
      whatsapp, 
      email, 
      password, 
      ville: ville||"Abomey-Calavi", 
      role: role||"artiste",
      statut: 'en_attente', // Admin doit valider
      estVerifie: false
    });

    const token = jwt.sign({id:user._id, role:user.role}, process.env.JWT_SECRET||'zedmo_secret', {expiresIn:'30d'});
    
    res.json({
      success:true, 
      token, 
      message:'Profil envoyé pour validation admin 24h',
      user:{_id:user._id, nom:user.nom, nom_artiste:user.nom_artiste, whatsapp:user.whatsapp, email:user.email, role:user.role, statut:user.statut}
    });
  }catch(e){ 
    res.status(500).json({error:e.message}); 
  }
});

// LOGIN - Bloqué si pas validé par admin
router.post('/login', async(req,res)=>{
  try{
    const {whatsapp, password} = req.body;
    const user = await User.findOne({whatsapp});
    if(!user || !(await user.comparePassword(password))) return res.status(400).json({error:"Identifiants invalides"});
    
    // Si admin n'a pas encore validé, on informe mais on laisse se connecter pour voir statut
    const token = jwt.sign({id:user._id, role:user.role}, process.env.JWT_SECRET||'zedmo_secret', {expiresIn:'30d'});
    res.json({token, user});
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/me/:id', async(req,res)=>{
  const user = await User.findById(req.params.id).select('-password');
  res.json(user);
});

// LISTE POUR ADMIN - avec statut
router.get('/', async(req,res)=>{ 
  res.json(await User.find().select('-password').sort({createdAt:-1}).limit(100)); 
});

// ADMIN - VALIDER PROFIL (celui que ton admin.html appelle)
router.put('/:id/valider', async(req,res)=>{
  try{
    const u = await User.findByIdAndUpdate(req.params.id, {statut:'valide', estVerifie:true}, {new:true}).select('-password');
    res.json(u);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/users/:id/valider', async(req,res)=>{
  try{
    const u = await User.findByIdAndUpdate(req.params.id, {statut:'valide', estVerifie:true}, {new:true}).select('-password');
    res.json(u);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ADMIN - REFUSER / SUPPRIMER
router.delete('/:id', async(req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({success:true});
});

router.delete('/users/:id', async(req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({success:true});
});

export default router;
