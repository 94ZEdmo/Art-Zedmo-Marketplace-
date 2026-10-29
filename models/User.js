import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    nom_artiste: { type: String, trim: true, default: '', maxlength: 100 },
    whatsapp: { type: String, required: true, unique: true, trim: true, minlength: 6, maxlength: 25 },
    email: {
      type: String, trim: true, lowercase: true, maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Adresse e-mail invalide'],
      default: undefined
    },
    password: { type: String, required: true, minlength: 10, select: false },
    role: { type: String, enum: ['artiste', 'acheteur', 'admin'], default: 'artiste', required: true },
    ville: { type: String, trim: true, default: 'Abomey-Calavi', maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 1000, default: '' },
    avatar: { type: String, default: '' },
    adresseReception: { type: String, trim: true, default: '', maxlength: 200 },
    
    statut: { type: String, enum: ['en_attente', 'valide', 'refuse'], default: 'valide', required: true },
    estVerifie: { type: Boolean, default: true },
    
    totalOeuvres: { type: Number, default: 0 },
    totalVentes: { type: Number, default: 0 },
    totalVotesRecus: { type: Number, default: 0 },
    solde: { type: Number, default: 0 },

    resetPasswordToken: { type: String, default: null, select: false },
    resetPasswordExpire: { type: Date, default: null, select: false },

    forfait: { type: String, enum: ['gratuit','pro','galerie_privee'], default: 'gratuit' },
    forfaitStatut: { type: String, enum: ['en_attente','valide','refuse', null], default: null },
    forfaitPreuve: { type: String, default: null },
    forfaitTypeDemande: { type: String, enum: ['pro','galerie_privee', null], default: null },
    forfaitDateDemande: { type: Date, default: null },
    forfaitProStatut: { type: String, enum: ['gratuit','en_attente','valide','refuse'], default: 'gratuit' },
    forfaitProExpire: { type: Date, default: null },
    forfaitProPreuve: { type: String, default: null },
    forfaitPriveeStatut: { type: String, enum: ['gratuit','en_attente','valide','refuse'], default: 'gratuit' },
    forfaitPriveeExpire: { type: Date, default: null },
    forfaitPriveePreuve: { type: String, default: null },
    forfaitExpireAt: { type: Date, default: null },
    limiteOeuvres: { type: Number, default: 5 },
    limiteNFT: { type: Number, default: 3 },
    forfaitPrixUSD: { type: Number, default: 0 },
    forfaitPrixFCFA: { type: Number, default: 0 },
    totalOeuvresPubliees: { type: Number, default: 0 },
    totalNFTPublies: { type: Number, default: 0 }
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ resetPasswordToken: 1 });

userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpire;
    delete ret.__v;
    return ret;
  }
});

// FIX: évite le double hashage
userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    // Si déjà hashé (commence par $2a$ ou $2b$), on ne re-hash pas
    if (this.password && this.password.startsWith('$2')) {
      // déjà hashé dans auth.js
    } else {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  const now = new Date();
  if (this.forfaitProExpire && this.forfaitProExpire < now) {
    this.forfaitProStatut = 'gratuit';
    this.forfaitProExpire = null;
  }
  if (this.forfaitPriveeExpire && this.forfaitPriveeExpire < now) {
    this.forfaitPriveeStatut = 'gratuit';
    this.forfaitPriveeExpire = null;
  }
  if (this.forfaitExpireAt && this.forfaitExpireAt < now && this.forfait !== 'gratuit' && this.forfaitProStatut !== 'valide' && this.forfaitPriveeStatut !== 'valide') {
    this.forfait = 'gratuit'; this.limiteOeuvres = 5; this.limiteNFT = 3; this.forfaitStatut = null;
  }
  const proValide = this.forfaitProStatut === 'valide' && (!this.forfaitProExpire || this.forfaitProExpire > now);
  const priveeValide = this.forfaitPriveeStatut === 'valide' && (!this.forfaitPriveeExpire || this.forfaitPriveeExpire > now);
  if (priveeValide) {
    this.forfait = 'galerie_privee';
    this.limiteOeuvres = 50; this.limiteNFT = 50;
    this.forfaitPrixUSD = 50; this.forfaitPrixFCFA = 30000;
  } else if (proValide) {
    this.forfait = 'pro';
    this.limiteOeuvres = 10; this.limiteNFT = 10;
    this.forfaitPrixUSD = 7; this.forfaitPrixFCFA = 4200;
  }
});

userSchema.methods.comparePassword = async function (pwd) {
  if (typeof pwd !== 'string' || !this.password) return false;
  return bcrypt.compare(pwd, this.password);
};

userSchema.methods.peutPublier = function(isNFT = false) {
  if (isNFT) return this.totalNFTPublies < this.limiteNFT;
  return this.totalOeuvresPubliees < this.limiteOeuvres;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
