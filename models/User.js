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
    password: { type: String, required: true, minlength: 10 },
    role: { type: String, enum: ['artiste', 'acheteur', 'admin'], default: 'artiste', required: true },
    ville: { type: String, trim: true, default: 'Abomey-Calavi', maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 1000, default: '' },
    avatar: { type: String, default: '' },
    adresseReception: { type: String, trim: true, default: '', maxlength: 200 },
    statut: { type: String, enum: ['en_attente', 'valide', 'refuse'], default: 'en_attente', required: true },
    estVerifie: { type: Boolean, default: false },
    totalOeuvres: { type: Number, default: 0 },
    totalVentes: { type: Number, default: 0 },
    totalVotesRecus: { type: Number, default: 0 },
    solde: { type: Number, default: 0 },

    // FORFAITS - 10 / 50 / 1 mois + BOOST 48h
    forfait: { type: String, enum: ['gratuit','pro','galerie_privee'], default: 'gratuit' },
    // === LES 4 CHAMPS QUI MANQUAIENT POUR ADMIN ===
    forfaitStatut: { type: String, enum: ['en_attente','valide','refuse', null], default: null },
    forfaitPreuve: { type: String, default: null }, // ID MTN/Moov/USDT/Pi
    forfaitTypeDemande: { type: String, enum: ['pro','galerie_privee', null], default: null },
    forfaitDateDemande: { type: Date, default: null },
    // ==============================================
    forfaitExpireAt: { type: Date, default: null },
    limiteOeuvres: { type: Number, default: 5 }, // 5 gratuit, 10 pro, 50 galerie_privee
    limiteNFT: { type: Number, default: 3 },
    forfaitPrixUSD: { type: Number, default: 0 },
    forfaitPrixFCFA: { type: Number, default: 0 },
    totalOeuvresPubliees: { type: Number, default: 0 },
    totalNFTPublies: { type: Number, default: 0 }
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ forfait: 1 });
userSchema.index({ forfaitStatut: 1 });
userSchema.index({ forfaitExpireAt: 1 });

userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    if (this.forfait === 'gratuit') {
      if (this.forfaitStatut !== 'en_attente') { this.limiteOeuvres = 5; this.limiteNFT = 3; }
      this.forfaitPrixUSD = 0; this.forfaitPrixFCFA = 0;
    } else if (this.forfait === 'pro') {
      // Ne change limite que si validé, pas en attente
      if (this.forfaitStatut === 'valide') { this.limiteOeuvres = 10; this.limiteNFT = 10; }
      this.forfaitPrixUSD = 7; this.forfaitPrixFCFA = 4200;
    } else if (this.forfait === 'galerie_privee') {
      if (this.forfaitStatut === 'valide') { this.limiteOeuvres = 50; this.limiteNFT = 50; }
      this.forfaitPrixUSD = 50; this.forfaitPrixFCFA = 30000;
    }
    if (this.forfaitExpireAt && this.forfaitExpireAt < new Date() && this.forfait !== 'gratuit') {
      this.forfait = 'gratuit'; this.limiteOeuvres = 5; this.limiteNFT = 3; this.forfaitStatut = null;
    }
    return;
  }
  this.password = await bcrypt.hash(this.password, 12);
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
