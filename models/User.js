import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom complet est obligatoire'],
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    nom_artiste: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100
    },
    whatsapp: {
      type: String,
      required: [true, 'Le numéro WhatsApp est obligatoire'],
      unique: true,
      trim: true,
      minlength: 6,
      maxlength: 25
    },
    // ✅ FIX 1 - Pas de default '', pas de sparse dans le field
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Adresse e-mail invalide'],
      default: undefined
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: 10
      // ✅ FIX 2 - On enlève select:false pour éviter le bug de login
    },
    role: {
      type: String,
      enum: ['artiste', 'acheteur', 'admin'],
      default: 'artiste',
      required: true
    },
    ville: {
      type: String,
      trim: true,
      default: 'Abomey-Calavi',
      maxlength: 100
    },
    bio: { type: String, trim: true, maxlength: 1000, default: '' },
    avatar: { type: String, default: '' },
    
    // ✅ FIX 3 - On enlève le validator du schéma, on le fait dans auth.js
    // TRC20 / PI / MTN Moov - +2290196587303 / TFXZ... / GAF62...
    adresseReception: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200
    },
    statut: {
      type: String,
      enum: ['en_attente', 'valide', 'refuse'],
      default: 'en_attente',
      required: true
    },
    estVerifie: { type: Boolean, default: false },
    totalOeuvres: { type: Number, default: 0, min: 0 },
    totalVentes: { type: Number, default: 0, min: 0 },
    totalVotesRecus: { type: Number, default: 0, min: 0 },
    solde: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

// ✅ Un seul index, pas de doublon
userSchema.index({ email: 1 }, { unique: true, sparse: true });

userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (pwd) {
  if (typeof pwd !== 'string' || !this.password) return false;
  return bcrypt.compare(pwd, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
