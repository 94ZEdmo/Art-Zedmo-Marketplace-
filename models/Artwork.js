import mongoose from 'mongoose';
import crypto from 'crypto';

const preuvePaiementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  preuve: { type: String, required: true },
  method: { type: String, enum: ['mtn','moov','usdt_trc20','pi','fedapay','manual'], default: 'manual' },
  transactionId: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  statut: { type: String, enum: ['en_attente','validee','refusee'], default: 'en_attente' }
}, { _id: true });

const artworkSchema = new mongoose.Schema(
  {
    titre: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 10000, default: '' },
    prix: { type: Number, required: true, min: 0.01 },
    prixReserve: { type: Number, min: 0 },
    prixUSDX: { type: Number, min: 0 },
    prixFCFA: { type: Number, min: 0 },

    images: { type: [String], default: [] },
    image: { type: String, default: '' },

    categorie: {
      type: String,
      enum: ['Peinture','Sculpture','Dessin','Photographie','Art numérique','Artisanat','Textile','Digital','NFT','Autre'],
      default: 'Autre'
    },
    ville: { type: String, trim: true, maxlength: 100, default: 'Abomey-Calavi' },

    artiste: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'L’artiste est obligatoire']
    },

    // =================================================
    // GALERIE PERMANENTE + EXPOS - FONCTIONNEMENT DÉFINITIF
    // =================================================
    // Ancien champ pour compatibilité
    exposition: { type: mongoose.Schema.Types.ObjectId, ref: 'Exposition', default: null },
    // NOUVEAU : plusieurs expos, reste en galerie
    expositions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exposition' }],
    isEnExpoActuelle: { type: Boolean, default: false },

    // =================================================
    // STATUT - CORRIGÉ
    // validee = reste en galerie permanente même en expo
    // en_enchere = seulement là quitte galerie
    // =================================================
    statut: {
      type: String,
      enum: ['en_attente','validee','en_expo','en_enchere','vendue','rejetee'],
      default: 'en_attente',
      required: true
    },

    votesCount: { type: Number, default: 0, min: 0 },
    vues: { type: Number, default: 0, min: 0 },

    // IDs
    azmId: { type: String, unique: true, sparse: true, trim: true, immutable: true },
    certifId: { type: String, trim: true, default: '' },
    hash: { type: String, default: '' },
    lien_vote_unique: { type: String, unique: true, sparse: true },

    // =================================================
    // NFT - PI BLOCKCHAIN RÉEL
    // Important : NFT authentique seulement si blockchainMinted=true
    // =================================================
    isNFT: { type: Boolean, default: false },
    blockchain: { type: String, enum: ['pi','Pi','Ethereum','Core','Sidra','polygon','Autre'], default: 'pi' },
    blockchainMinted: { type: Boolean, default: false }, // VRAI MINT
    tokenId: { type: String, default: '' },
    contractAddress: { type: String, default: '' },
    royalties: { type: Number, default: 5, min: 0, max: 20 },
    edition: { type: String, trim: true, default: '1/1' },
    proprietaireWallet: { type: String, trim: true, default: '' },
    txHash: { type: String, trim: true, default: '' },

    // =================================================
    // PAIEMENTS RÉELS - TES ADRESSES
    // =================================================
    dateVente: { type: Date, default: null },
    prixVendu: { type: Number, min: 0 },
    acheteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    statutPaiement: {
      type: String,
      enum: ['aucun','preuve_envoyee','verifie','paye_fedapay','paye_crypto','paye_mobile','annule'],
      default: 'aucun'
    },
    preuvesPaiement: [preuvePaiementSchema],

    // Adresses fixées (pour référence)
    adressesPaiement: {
      usdt_trc20: { type: String, default: 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2' },
      pi: { type: String, default: 'GAF62KXAV7IUM3HSHQ3TI6EFMIDSGII2EVEZXFTXGMH5D2EDPA6RVAM' },
      mtn: { type: String, default: '0196587303' },
      moov: { type: String, default: '0194655238' }
    }
  },
  { timestamps: true, strict: true }
);

// INDEX
artworkSchema.index({ votesCount: -1 });
artworkSchema.index({ exposition: 1, statut: 1 });
artworkSchema.index({ statut: 1, createdAt: -1 });
artworkSchema.index({ artiste: 1, createdAt: -1 });
artworkSchema.index({ expositions: 1 });
artworkSchema.index({ isEnExpoActuelle: 1 });
artworkSchema.index({ isNFT: 1, blockchainMinted: 1 });
artworkSchema.index({ statutPaiement: 1 });

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
    const ref = JSON.stringify({
      titre: this.titre.trim(),
      artiste: this.artiste? this.artiste.toString() : '',
      createdAt: this.createdAt || new Date().toISOString()
    });
    this.hash = crypto.createHash('sha256').update(ref).digest('hex');
  }
  // Si NFT Pi, force blockchain = pi
  if (this.isNFT &&!this.blockchain) this.blockchain = 'pi';
});

const Artwork = mongoose.models.Artwork || mongoose.model('Artwork', artworkSchema);
export default Artwork;
