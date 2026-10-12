import mongoose from 'mongoose';

const expositionSchema = new mongoose.Schema(
  {
    titre: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
      default: 'Expo OCT 2026 - Royauté Africaine'
    },

    theme: {
      type: String,
      trim: true,
      maxlength: 200,
      default: 'Royauté Africaine'
    },

    description: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: ''
    },

    lieu: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },

    image: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: ''
    },

    dateDebut: {
      type: Date,
      required: true,
      default: Date.now
    },

    dateFin: {
      type: Date,
      required: true,
      default: () =>
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },

    dateFinVote: {
      type: Date,
      required: true,
      default: () =>
        new Date(Date.now() + 27 * 24 * 60 * 60 * 1000)
    },

    statut: {
      type: String,
      enum: [
        'a_venir',
        'active',
        'vote_clos',
        'enchere',
        'terminee'
      ],
      default: 'active',
      index: true
    },

    oeuvres: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artwork'
      }
    ],

    oeuvres_top: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artwork'
      }
    ],

    totalVotes: {
      type: Number,
      default: 0,
      min: 0
    },

    totalArtistes: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

/*
 * Vérification de cohérence des dates.
 *
 * Les règles suivantes s'appliquent lors de la validation
 * d'un document :
 * - la fin est postérieure au début ;
 * - la fin du vote ne précède pas le début ;
 * - la fin du vote ne dépasse pas la fin de l'exposition.
 */
expositionSchema.pre('validate', function () {
  if (
    this.dateDebut &&
    this.dateFin &&
    this.dateFin <= this.dateDebut
  ) {
    this.invalidate(
      'dateFin',
      'La fin de l’exposition doit être postérieure à son début.'
    );
  }

  if (
    this.dateDebut &&
    this.dateFinVote &&
    this.dateFinVote < this.dateDebut
  ) {
    this.invalidate(
      'dateFinVote',
      'La clôture des votes ne peut pas précéder le début de l’exposition.'
    );
  }

  if (
    this.dateFin &&
    this.dateFinVote &&
    this.dateFinVote > this.dateFin
  ) {
    this.invalidate(
      'dateFinVote',
      'La clôture des votes ne peut pas dépasser la fin de l’exposition.'
    );
  }
});

/*
 * Index pour retrouver rapidement les expositions récentes.
 */
expositionSchema.index({
  statut: 1,
  dateDebut: -1
});

/*
 * Évite de compiler plusieurs fois le modèle dans
 * certains environnements de développement.
 */
const Exposition =
  mongoose.models.Exposition ||
  mongoose.model('Exposition', expositionSchema);

export default Exposition;
