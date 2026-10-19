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
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Adresse e-mail invalide'],
      sparse: true
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: 10,
      select: false
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
    bio: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    avatar: {
      type: String,
      default: ''
    },
    // ✅ CORRIGÉ - TRC20 / PI / MTN MOOV - Obligatoire seulement pour artiste
    adresseReception: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
      validate: {
        validator: function(v) {
          if (this.role === 'artiste') {
            return v && v.length >= 8; // +2290196587303 ou TFXZ... ou GAF62...
          }
          return true;
        },
        message: 'Adresse de réception obligatoire pour artiste : USDT TRC20 / Pi Network / MTN Moov'
      }
    },
    statut: {
      type: String,
      enum: ['en_attente', 'valide', 'refuse'],
      default: 'en_attente',
      required: true
    },
    estVerifie: {
      type: Boolean,
      default: false
    },
    totalOeuvres: { type: Number, default: 0, min: 0 },
    totalVentes: { type: Number, default: 0, min: 0 },
    totalVotesRecus: { type: Number, default: 0, min: 0 },
    solde: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

// Index sparse pour email pour permettre plusieurs comptes sans email
userSchema.index({ email: 1 }, { unique: true, sparse: true, partialFilterExpression: { email: { $type: "string", $ne: "" } } });

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
