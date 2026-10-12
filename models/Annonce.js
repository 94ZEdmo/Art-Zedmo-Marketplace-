import mongoose from 'mongoose';

const annonceSchema = new mongoose.Schema(
  {
    titre: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
      default: 'EXPO OCT 2026 - Royauté Africaine - LIVE'
    },

    message: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: ''
    },

    type: {
      type: String,
      enum: ['info', 'expo', 'enchere', 'urgent'],
      default: 'expo',
      index: true
    },

    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Accélère la recherche des annonces actives, des plus récentes aux plus anciennes.
annonceSchema.index({ active: 1, createdAt: -1 });

// Évite les erreurs de redéclaration du modèle.
const Annonce =
  mongoose.models.Annonce ||
  mongoose.model('Annonce', annonceSchema);

export default Annonce;
