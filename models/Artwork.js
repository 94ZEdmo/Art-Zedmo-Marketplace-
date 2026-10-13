import mongoose from 'mongoose';
import crypto from 'crypto';

const artworkSchema = new mongoose.Schema(
  {
    //... TON CODE EXISTANT JUSQU'À...
    artiste: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'L’artiste est obligatoire']
    },

    // =================================================
    // 4. PROPRIÉTAIRE ET EXPOSITION - CORRIGÉ
    // On garde 'exposition' pour compatibilité
    // On AJOUTE 'expositions' pour ton fonctionnement définitif
    // =================================================
    exposition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exposition',
      default: null
    },
    // NOUVEAU : Permet d'être en galerie ET dans plusieurs expos
    expositions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exposition'
    }],
    // NOUVEAU : Pour savoir rapidement si en expo sans changer le statut
    isEnExpoActuelle: {
      type: Boolean,
      default: false
    },

    // =================================================
    // 5. STATUT DE L'ŒUVRE - CORRIGÉ
    // IMPORTANT : On ne met plus 'en_expo' pour cacher de la galerie
    // =================================================
    statut: {
      type: String,
      enum: [
        'en_attente',
        'validee',
        'en_expo', // On le garde pour compatibilité mais on ne l'utilise plus pour cacher
        'en_enchere',
        'vendue',
        'rejetee'
      ],
      default: 'en_attente',
      required: true
    },

    // --- LE RESTE DE TON CODE RESTE IDENTIQUE ---
    votesCount: { type: Number, default: 0, min: 0 },
    vues: { type: Number, default: 0, min: 0 },
    azmId: { type: String, unique: true, sparse: true, trim: true, immutable: true },
    certifId: { type: String, trim: true, default: '' },
    hash: { type: String, default: '' },
    lien_vote_unique: { type: String, unique: true, sparse: true },
    isNFT: { type: Boolean, default: false },
    prixUSDX: { type: Number, min: 0 },
    prixFCFA: { type: Number, min: 0 },
    blockchain: { type: String, enum: ['Pi', 'Ethereum', 'Core', 'Sidra', 'Autre'], default: 'Pi' },
    royalties: { type: Number, default: 5, min: 0, max: 20 },
    edition: { type: String, trim: true, default: '1/1' },
    proprietaireWallet: { type: String, trim: true, default: '' },
    txHash: { type: String, trim: true, default: '' },
    dateVente: { type: Date, default: null },
    prixVendu: { type: Number, min: 0 },
    titre: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 10000, default: '' },
    prix: { type: Number, required: true, min: 0.01 },
    prixReserve: { type: Number, min: 0 },
    images: { type: [String], default: [] },
    image: { type: String, default: '' },
    categorie: { type: String, enum: ['Peinture','Sculpture','Dessin','Photographie','Art numérique','Artisanat','Textile','Digital','Autre'], default: 'Autre' },
    ville: { type: String, trim: true, maxlength: 100, default: 'Abomey-Calavi' },
  },
  { timestamps: true, strict: true }
);

// INDEX - J'AJOUTE UN INDEX POUR TA NOUVELLE LOGIQUE
artworkSchema.index({ votesCount: -1 });
artworkSchema.index({ exposition: 1, statut: 1 });
artworkSchema.index({ statut: 1, createdAt: -1 });
artworkSchema.index({ artiste: 1, createdAt: -1 });
artworkSchema.index({ expositions: 1 }); // NOUVEAU
artworkSchema.index({ isEnExpoActuelle: 1 });

//... TON PRE VALIDATE RESTE IDENTIQUE...
artworkSchema.pre('validate', function () {
  if (Array.isArray(this.images) && this.images.length > 0) {
    this.image = this.images[0];
  } else if (this.image && this.images.length === 0) {
    this.images = [this.image];
  }
  if (!this.lien_vote_unique && this._id) {
    const randomPart = crypto.randomBytes(8).toString('hex');
    this.lien_vote_unique = `expo/vote/${this._id.toString()}-${randomPart}`;
  }
  if (!this.hash && this.isNew && this.titre) {
    const reference = JSON.stringify({
      titre: this.titre.trim(),
      artiste: this.artiste? this.artiste.toString() : '',
      createdAt: this.createdAt || new Date().toISOString()
    });
    this.hash = crypto.createHash('sha256').update(reference).digest('hex');
  }
});

const Artwork = mongoose.models.Artwork || mongoose.model('Artwork', artworkSchema);
export default Artwork;
