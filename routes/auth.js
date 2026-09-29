import express from 'express'; import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import User from '../models/User.js';
const router = express.Router();
router.post('/register', async(req,res)=>{
  try{ const {nom,email,password,role}=req.body; const hash=await bcrypt.hash(password,10); const u=await User.create({nom,email,password:hash,role}); res.json(u);
  }catch(e){res.status(400).json({error:e.message})}
});
router.post('/login', async(req,res)=>{
  const {email,password}=req.body; const u=await User.findOne({email}); if(!u) return res.status(404).json({msg:'Introuvable'});
  const ok=await bcrypt.compare(password,u.password); if(!ok) return res.status(400).json({msg:'Mdp invalide'});
  const token=jwt.sign({id:u._id, role:u.role}, process.env.JWT_SECRET||'secret', {expiresIn:'7d'});
  res.json({token, user:u});
});
export default router;