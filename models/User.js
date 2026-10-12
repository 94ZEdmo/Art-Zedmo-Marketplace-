import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    // Informations personnelles
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
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Adresse e-mail invalide'
      ]
    },

    // Mot de passe : toujours enregistré sous forme de hash
    password: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: 10,
      select: false
    },

    // Le rôle admin ne doit jamais être accordé par une inscription publique.
    role: {
      type: String,
      enum: ['artiste', 'acheteur', 'admin'],
      default: 'artiste',
      required: true
    },

    // Profil
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

    // Validation du compte
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

    // Statistiques du compte
    totalOeuvres: {
      type: Number,
      default: 0,
      min: 0
    },

    totalVentes: {
      type: Number,
      default: 0,
      min: 0
    },

    totalVotesRecus: {
      type: Number,
      default: 0,
      min: 0
    },

    solde: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// Évite de sélectionner le mot de passe lors des lectures ordinaires.
userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

// Chiffrement du mot de passe avant l'enregistrement.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// Vérification du mot de passe lors de la connexion.
userSchema.methods.comparePassword = async function (pwd) {
  if (typeof pwd !== 'string' || !this.password) {
    return false;
  }

  return bcrypt.compare(pwd, this.password);
};

const User =
  mongoose.models.User || mongoose.model('User', userSchema);

export default User;
