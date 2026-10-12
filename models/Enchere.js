import mongoose from 'mongoose';

const offreSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    montant: {
      type: Number,
      required: true,
      min: [0.01, 'Le montant de l’offre doit être positif'],
      validate: {
        validator: Number.isFinite,
        message: 'Le montant doit être un nombre valide'
      }
    },

    date: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: true
  }
);

const enchereSchema = new mongoose.Schema(
  {
    artwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Artwork',
      required: true,
      index: true
    },

    exposition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exposition',
      default: null
    },

    titre: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },

    prixDepart: {
      type: Number,
      required: true,
      min: [0.01, 'Le prix de départ doit être positif'],
      validate: {
        validator: Number.isFinite,
        message: 'Le prix de départ doit être un nombre valide'
      }
    },

    enchereActuelle: {
      type: Number,
      required: true,
      min: [0.01, 'Le prix actuel doit être positif'],
      validate: {
        validator: Number.isFinite,
        message: 'Le prix actuel doit être un nombre valide'
      }
    },

    dernierEncherisseur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    offres: {
      type: [offreSchema],
      default: []
    },

    dateFin: {
      type: Date,
      required: true,
      validate: {
        validator: date => date instanceof Date && !Number.isNaN(date.getTime()),
        message: 'La date de fin est invalide'
      }
    },

    statut: {
      type: String,
      enum: ['en_cours', 'terminee', 'annulee'],
      default: 'en_cours',
      index: true
    },

    gagnant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Vérifie la cohérence des prix avant validation.
enchereSchema.pre('validate', function () {
  if (
    Number.isFinite(this.prixDepart) &&
    Number.isFinite(this.enchereActuelle) &&
    this.enchereActuelle < this.prixDepart
  ) {
    this.invalidate(
      'enchereActuelle',
      'Le prix actuel ne peut pas être inférieur au prix de départ.'
    );
  }
});

// Prolongation automatique si une nouvelle enchère est enregistrée
// dans les deux dernières minutes, à condition que l'enchère soit encore active.
enchereSchema.pre('save', function () {
  if (
    this.isModified('enchereActuelle') &&
    this.statut === 'en_cours' &&
    this.dateFin instanceof Date
  ) {
    const maintenant = Date.now();
    const tempsRestant = this.dateFin.getTime() - maintenant;

    if (tempsRestant > 0 && tempsRestant <= 2 * 60 * 1000) {
      this.dateFin = new Date(maintenant + 2 * 60 * 1000);
    }
  }
});

// Index utile pour retrouver rapidement les enchères actives.
enchereSchema.index({ statut: 1, dateFin: 1 });

// Évite de redéclarer le modèle lors de certains rechargements.
const Enchere =
  mongoose.models.Enchere ||
  mongoose.model('Enchere', enchereSchema);

export default Enchere;
