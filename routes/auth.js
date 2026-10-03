import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
const router = express.Router();

// REGISTER - Artiste / Acheteur
router.post('/register', async(req,res)=>{
  try{
    const {nom, whatsapp, email, password, ville, role} = req.body;
    if(!nom || !whatsapp || !password) return res.status(400).json({error:"Nom, WhatsApp, password requis"});
    const existe = await User.findOne({whatsapp});
    if(existe) return res.status(400).json({error:"WhatsApp déjà utilisé"});
    const user = await User.create({nom, whatsapp, email, password, ville: ville||"Abomey-Calavi", role: role||"artiste"});
    const token = jwt.sign({id:user._id, role:user.role}, process.env.JWT_SECRET, {expiresIn:'30d'});
    res.json({success:true, token, user:{_id:user._id, nom:user.nom, whatsapp:user.whatsapp, role:user.role}});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// LOGIN
router.post('/login', async(req,res)=>{
  try{
    const {whatsapp, password} = req.body;
    const user = await User.findOne({whatsapp});
    if(!user || !(await user.comparePassword(password))) return res.status(400).json({error:"Identifiants invalides"});
    const token = jwt.sign({id:user._id, role:user.role}, process.env.JWT_SECRET, {expiresIn:'30d'});
    res.json({token, user});
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/me/:id', async(req,res)=>{
  const user = await User.findById(req.params.id).select('-password');
  res.json(user);
});

router.get('/', async(req,res)=>{ res.json(await User.find().select('-password').sort({createdAt:-1}).limit(50)); });

export default router;
