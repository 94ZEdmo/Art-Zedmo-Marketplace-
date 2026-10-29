import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, {strict:false}), 'users');

function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth requise' });
  const token = auth.slice(7);
  try { const decoded = jwt.verify(token, JWT_SECRET); req.userId = String(decoded.id || decoded._id); req.user = decoded; next(); } catch { return res.status(401).json({ error: 'Jeton expiré' }); }
}

router.post('/login', async (req,res)=>{
  try{
    // On récupère le vrai modèle à chaque requête
    const RealUser = mongoose.model('User');
    const { identifiant, email, whatsapp, password } = req.body;
    const loginId = String(identifiant || email || whatsapp || '').trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Identifiant + mdp requis' });

    const user = await RealUser.findOne({
      $or: [
        { email: loginId.toLowerCase() },
        { whatsapp: loginId },
        { email: loginId },
        { whatsapp: loginId.toLowerCase() }
      ]
    }).select('+password');

    if (!user) return res.status(404).json({ error: 'Compte introuvable' });

    // utilise bcrypt direct, pas comparePassword pour éviter le bug
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    const safeUser = user.toObject(); delete safeUser.password;
    res.json({ success:true, token, user: safeUser });
  }catch(e){ console.error('LOGIN ERROR', e); res.status(500).json({ error: 'Erreur serveur: ' + e.message }); }
});

router.post('/register', async (req,res)=>{
  try{
    const RealUser = mongoose.model('User');
    const { nom, whatsapp, email, password } = req.body;
    const idCheck = String(whatsapp || email || '').trim();
    if (!password) return res.status(400).json({ error: 'Mdp requis' });
    const exists = await RealUser.findOne({ $or: [{whatsapp:idCheck}, {email:idCheck.toLowerCase()}] });
    if (exists) return res.status(400).json({ error: 'Compte existe déjà' });
    const hash = await bcrypt.hash(password, 10);
    const user = await RealUser.create({ nom: nom || idCheck, whatsapp: whatsapp || idCheck, email: email?.toLowerCase(), password: hash, role: 'artiste', statut: 'valide', estVerifie: true, forfait: 'gratuit', limiteOeuvres:5, limiteNFT:3 });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success:true, token, user });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/forgot-password', async (req,res)=>{
  try{
    const RealUser = mongoose.model('User');
    const { email, whatsapp, identifiant } = req.body;
    const id = String(email || whatsapp || identifiant || '').trim().toLowerCase();
    const user = await RealUser.findOne({ $or: [{email:id}, {whatsapp:id}] });
    if(!user) return res.status(404).json({error:'Compte introuvable'});
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = new Date(Date.now()+3600000);
    await user.save();
    console.log('RESET', user.email, resetToken);
    res.json({ success:true, message:'Email envoyé', resetToken });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/reset-password', async (req,res)=>{
  try{
    const RealUser = mongoose.model('User');
    const { token, password } = req.body;
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await RealUser.findOne({ resetPasswordToken: hashed, resetPasswordExpire: { $gt: new Date() } }).select('+password');
    if(!user) return res.status(400).json({error:'Token expiré'});
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null; user.resetPasswordExpire = null;
    await user.save();
    res.json({ success:true, message:'Mot de passe changé' });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/', authenticateToken, async (req,res)=>{
  try{
    const RealUser = mongoose.model('User');
    const me = await RealUser.findById(req.userId);
    if(me.role!=='admin') return res.status(403).json({error:'Admin only'});
    const users = await RealUser.find().sort({createdAt:-1}).lean();
    res.json({ success:true, comptes: users, users, total: users.length });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.get('/all', authenticateToken, async (req,res)=>{
  try{
    const RealUser = mongoose.model('User');
    const me = await RealUser.findById(req.userId);
    if(me.role!=='admin') return res.status(403).json({error:'Admin only'});
    const users = await RealUser.find().sort({createdAt:-1}).lean();
    res.json({ success:true, comptes: users, users, total: users.length });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.get('/me', authenticateToken, async (req,res)=>{
  try{ const RealUser = mongoose.model('User'); const user = await RealUser.findById(req.userId).lean(); res.json({success:true, user}); }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
