import mongoose from 'mongoose';
import crypto from 'crypto';

const artworkSchema = new mongoose.Schema(
  {
    // =================================================
    // 1. INFORMATIONS DE L'ŒUVRE
    // =================================================

    titre: {
      type: String,
      required: [true, 'Le titre de l’œuvre est obligatoire'],
      trim: true,
      minlength: 2,
      maxlength: 200
    },

    description: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: ''
    },

    prix: {
      type: Number,
      required: [true, 'Le prix est obligatoire'],
      min: [0.01, 'Le prix doit être supérieur à zéro'],
      validate: {
        validator: Number.isFinite,
        message: 'Le prix doit être un nombre valide'
      }
    },

    prixReserve: {
      type: Number,
      min: 0
    },

    // =================================================
    // 2. IMAGES
    // =================================================

    images: {
      type: [String],
      default: [],
      validate: {
        validator: images =>
          Array.isArray(images) &&
          images.length <= 10 &&
          images.every(
            image =>
              typeof image === 'string' &&
              image.length <= 2048
          ),
        message: 'La liste des images est invalide'
      }
    },

    image: {
      type: String,
      default: ''
    },

    // =================================================
    // 3. CLASSIFICATION
    // Compatible avec routes/artworks.js
    // =================================================

    categorie: {
      type: String,
      enum: [
        'Peinture',
        'Sculpture',
        'Dessin',
        'Photographie',
        'Art numérique',
        'Artisanat',
        'Textile',
        'Digital',
        'Autre'
      ],
      default: 'Autre'
    },

    ville: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Abomey-Calavi'
    },

    // =================================================
    // 4. PROPRIÉTAIRE ET EXPOSITION
    // =================================================

    artiste: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'L’artiste est obligatoire']
    },

    exposition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exposition',
      default: null
    },

    // =================================================
    // 5. STATUT DE L'ŒUVRE
    // =================================================

    statut: {
      type: String,
      enum: [
        'en_attente',
        'validee',
        'en_expo',
        'en_enchere',
        'vendue',
        'rejetee'
      ],
      default: 'en_attente',
      required: true
    },

    // =================================================
    // 6. STATISTIQUES
    // =================================================

    votesCount: {
      type: Number,
      default: 0,
      min: 0
    },

    vues: {
      type: Number,
      default: 0,
      min: 0
    },

    // =================================================
    // 7. IDENTIFIANTS ART-ZEDMO
    // =================================================

    azmId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      immutable: true
    },

    certifId: {
      type: String,
      trim: true,
      default: ''
    },

    // SHA-256 calculé sur une donnée précise.
    // Ce hash n'est pas une preuve de propriété blockchain.
    hash: {
      type: String,
      default: ''
    },

    lien_vote_unique: {
      type: String,
      unique: true,
      sparse: true
    },

    // =================================================
    // 8. INFORMATIONS NFT
    // =================================================

    isNFT: {
      type: Boolean,
      default: false
    },

    prixUSDX: {
      type: Number,
      min: 0
    },

    prixFCFA: {
      type: Number,
      min: 0
    },

    blockchain: {
      type: String,
      enum: ['Pi', 'Ethereum', 'Core', 'Sidra', 'Autre'],
      default: 'Pi'
    },

    royalties: {
      type: Number,
      default: 5,
      min: 0,
      max: 20
    },

    edition: {
      type: String,
      trim: true,
      default: '1/1'
    },

    proprietaireWallet: {
      type: String,
      trim: true,
      default: ''
    },

    txHash: {
      type: String,
      trim: true,
      default: ''
    },

    dateVente: {
      type: Date,
      default: null
    },

    prixVendu: {
      type: Number,
      min: 0
    }
  },
  {
    timestamps: true,
    strict: true
  }
);

// =====================================================
// 9. INDEX
// =====================================================

artworkSchema.index({ votesCount: -1 });
artworkSchema.index({ exposition: 1, statut: 1 });
artworkSchema.index({ statut: 1, createdAt: -1 });
artworkSchema.index({ artiste: 1, createdAt: -1 });

// =====================================================
// 10. PRÉPARATION DES DONNÉES
// =====================================================

artworkSchema.pre('validate', function () {
  // Synchronise l'image principale avec la première image.
  if (Array.isArray(this.images) && this.images.length > 0) {
    this.image = this.images[0];
  } else if (this.image && this.images.length === 0) {
    this.images = [this.image];
  }

  // Génère un lien de vote stable pour cette œuvre.
  if (!this.lien_vote_unique && this._id) {
    const randomPart = crypto.randomBytes(8).toString('hex');

    this.lien_vote_unique =
      `expo/vote/${this._id.toString()}-${randomPart}`;
  }

  // Le hash est calculé sur les informations de référence
  // lorsque l'œuvre est créée et qu'aucun hash n'existe.
  if (!this.hash && this.isNew && this.titre) {
    const reference = JSON.stringify({
      titre: this.titre.trim(),
      artiste: this.artiste ? this.artiste.toString() : '',
      createdAt: this.createdAt || new Date().toISOString()
    });

    this.hash = crypto
      .createHash('sha256')
      .update(reference)
      .digest('hex');
  }
});

// =====================================================
// 11. MODÈLE
// =====================================================

const Artwork =
  mongoose.models.Artwork ||
  mongoose.model('Artwork', artworkSchema);

export default Artwork;
