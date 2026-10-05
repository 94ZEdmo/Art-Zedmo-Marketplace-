import express from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer'; // AJOUTÉ pour notification email
import User from '../models/User.js';
const router = express.Router();

// Config Email - AJOUTÉ
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// REGISTER - Artiste / Acheteur avec validation admin
router.post('/register', async(req,res)=>{
  try{
    const {nom, nom_artiste, whatsapp, email, password, ville, role} = req.body;
    
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
      statut: 'en_attente',
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

// LOGIN - MODIFIÉ: Email OU WhatsApp + password + blocage si non validé
router.post('/login', async(req,res)=>{
  try{
    const {whatsapp, email, identifiant, password} = req.body;
    // identifiant peut être email ou whatsapp
    const loginId = identifiant || email || whatsapp;

    const user = await User.findOne({ $or: [{whatsapp: loginId}, {email: loginId}] });
    if(!user || !(await user.comparePassword(password))) return res.status(400).json({error:"Identifiants invalides"});
    
    if(user.statut === 'en_attente'){
      return res.status(403).json({error:"Votre profil est en attente de validation admin (24h). Vous recevrez un email après validation."});
    }
    if(user.statut === 'refuse'){
      return res.status(403).json({error:"Votre profil a été refusé"});
    }

    const token = jwt.sign({id:user._id, role:user.role}, process.env.JWT_SECRET||'zedmo_secret', {expiresIn:'30d'});
    res.json({token, user: {_id:user._id, nom:user.nom, nom_artiste:user.nom_artiste, whatsapp:user.whatsapp, email:user.email, role:user.role, statut:user.statut, estVerifie:user.estVerifie}});
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

// ADMIN - VALIDER PROFIL + ENVOI EMAIL - MODIFIÉ
router.put('/:id/valider', async(req,res)=>{
  try{
    const u = await User.findByIdAndUpdate(req.params.id, {statut:'valide', estVerifie:true}, {new:true}).select('-password');
    
    // ENVOI NOTIFICATION EMAIL - AJOUTÉ
    try{
      if(u && u.email && process.env.EMAIL_USER){
        await transporter.sendMail({
          from: `"ART-ZEDMO" <${process.env.EMAIL_USER}>`,
          to: u.email,
          subject: "✅ Votre profil artiste ART-ZEDMO est validé",
          html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#111">Bravo ${u.nom_artiste} !</h2><p>Votre profil a été validé par l'admin ZEDMO.</p><p>Vous pouvez maintenant vous connecter avec votre <b>Email ou WhatsApp + mot de passe</b> et publier vos œuvres.</p><br><a href="https://art-zedmo.onrender.com" style="background:#111;color:white;padding:12px 24px;border-radius:30px;text-decoration:none">Aller sur ART-ZEDMO</a><br><br><p style="color:#666">ZEDMO Team - Galerie d'Art Bénin</p></div>`
        });
        console.log("Email envoyé à", u.email);
      }
    }catch(mailErr){
      console.log("Erreur envoi email:", mailErr.message);
    }

    res.json(u);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/users/:id/valider', async(req,res)=>{
  try{
    const u = await User.findByIdAndUpdate(req.params.id, {statut:'valide', estVerifie:true}, {new:true}).select('-password');
    
    try{
      if(u && u.email && process.env.EMAIL_USER){
        await transporter.sendMail({
          from: `"ART-ZEDMO" <${process.env.EMAIL_USER}>`,
          to: u.email,
          subject: "✅ Votre profil artiste ART-ZEDMO est validé",
          html: `<div style="font-family:sans-serif;padding:20px"><h2>Bravo ${u.nom_artiste} !</h2><p>Profil validé. Connectez-vous avec Email/WhatsApp + mot de passe.</p><a href="https://art-zedmo.onrender.com" style="background:#111;color:white;padding:12px 24px;border-radius:30px;text-decoration:none">ART-ZEDMO</a></div>`
        });
      }
    }catch(mailErr){ console.log(mailErr.message); }

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
