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
      required: [true, 'Le nom d’artiste est obligatoire'],
      trim: true,
      minlength: 2,
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
      required: [true, 'L’adresse e-mail est obligatoire'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Adresse e-mail invalide']
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
    // ✅ NOUVEAU - Adresse de réception uniquement pour artiste
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
