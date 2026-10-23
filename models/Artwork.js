import mongoose from 'mongoose';
import crypto from 'crypto';

const preuvePaiementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  preuve: { type: String, required: true },
  // AJOUT polygon + corrigé
  method: { type: String, enum: ['mtn','moov','usdt_trc20','pi','polygon','fedapay','manual'], default: 'manual' },
  transactionId: { type: String, default: '' },
  nomAcheteur: { type: String, default: '' }, // pour enchère x2
  montant: { type: Number, min: 0 },
  prixDouble: { type: Number, min: 0 },
  date: { type: Date, default: Date.now },
  statut: { type: String, enum: ['en_attente','validee','refusee'], default: 'en_attente' },
  adressesUtilisees: { type: Object, default: {} }
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
      enum: ['Peinture','Sculpture','Dessin','Photographie','Art numérique','Artisanat','Textile','Digital','NFT','Autre','peinture','sculpture','dessin','photographie','artisanat','nft','autre'],
      default: 'Autre'
    },
    ville: { type: String, trim: true, maxlength: 100, default: 'Abomey-Calavi' },

    artiste: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'L’artiste est obligatoire']
    },

    exposition: { type: mongoose.Schema.Types.ObjectId, ref: 'Exposition', default: null },
    expositions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exposition' }],
    isEnExpoActuelle: { type: Boolean, default: false },

    statut: {
      type: String,
      enum: ['en_attente','validee','en_expo','en_enchere','vendue','rejetee'],
      default: 'en_attente',
      required: true
    },

    votesCount: { type: Number, default: 0, min: 0 },
    vues: { type: Number, default: 0, min: 0 },

    // IDs - EXACT COMME TA PHOTO
    azmId: { type: String, unique: true, sparse: true, trim: true, immutable: true },
    certifId: { type: String, trim: true, default: '' },
    hash: { type: String, default: '' },
    lien_vote_unique: { type: String, unique: true, sparse: true },
    dimensions: { type: String, default: '80 x 120 cm' },
    technique: { type: String, default: 'Acrylique' },
    proprietaireActuel: { type: String, default: 'XXXXXXXX' },

    // =================================================
    // IPFS PINATA (PROBLÈME 4)
    // =================================================
    ipfsHash: { type: String, default: '' },
    imageIPFS: { type: String, default: '' }, // ipfs://...
    gatewayUrl: { type: String, default: '' }, // https://gateway.pinata...

    // =================================================
    // NFT - POLYGON + MODEL B POURCENTAGES SANS PRIX FIXE
    // =================================================
    isNFT: { type: Boolean, default: false },
    blockchain: { type: String, enum: ['pi','Pi','Ethereum','Core','Sidra','polygon','Polygon','Autre'], default: 'polygon' },
    blockchainMinted: { type: Boolean, default: false },
    tokenId: { type: String, default: '' },
    contractAddress: { type: String, default: '' },
    
    // CORRIGÉ: ROYALTIES AVEC % SANS PRIX FIXE
    royalties: { 
      type: Object, 
      default: {
        primaire: { artiste: 85, plateforme: 15 },
        secondaire: { vendeur: 85, artiste: 10, plateforme: 5 }
      }
    },
    royaltiesPercent: { type: Number, default: 10, min: 0, max: 20 }, // fallback ancien
    
    edition: { type: String, trim: true, default: '1/1' },
    proprietaireWallet: { type: String, trim: true, default: '' },
    txHash: { type: String, trim: true, default: '' },

    dateVente: { type: Date, default: null },
    prixVendu: { type: Number, min: 0 },
    acheteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // =================================================
    // COMMISSION ART-ZEDMO - 15% GALERIE / 20% ENCHERE
    // =================================================
    typeVente: { type: String, enum: ['galerie','enchere'], default: 'galerie' },
    commissionRate: { type: Number, default: 15 },
    montantCommission: { type: Number, min: 0, default: 0 },
    montantArtiste: { type: Number, min: 0, default: 0 },

    // =================================================
    // BOOST 48H - 2 USD = 1200 FCFA
    // =================================================
    isBoosted: { type: Boolean, default: false },
    boostExpireAt: { type: Date, default: null },
    boostPrixUSD: { type: Number, default: 2 },
    boostPrixFCFA: { type: Number, default: 1200 },

    statutPaiement: {
      type: String,
      enum: ['aucun','preuve_envoyee','verifie','paye_fedapay','paye_crypto','paye_mobile','annule'],
      default: 'aucun'
    },
    preuvesPaiement: [preuvePaiementSchema],

    // ADRESSES CORRIGÉES 0194655238 (PROBLÈME 2)
    adressesPaiement: {
      usdt_trc20: { type: String, default: 'TFXZSyJaC6mdCva8kAJBMMvKYhyhpzpHn2' },
      pi: { type: String, default: 'GAF62KXAV7IUM3HSHQ3TI6EFMIDSGII2EVEZXFTXGMH5D2EDPA6RVAM' },
      polygon: { type: String, default: '0xZEDMO' },
      mtn: { type: String, default: '0194655238' },
      moov: { type: String, default: '0194655238' },
      whatsapp: { type: String, default: '2290194655238' }
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
artworkSchema.index({ ipfsHash: 1 });
artworkSchema.index({ isBoosted: -1, boostExpireAt: 1 });
artworkSchema.index({ typeVente: 1 });

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
  // CORRIGÉ: NFT Polygon par défaut (plus Pi)
  if (this.isNFT && !this.blockchain) this.blockchain = 'polygon';
  
  // Certificat ID auto
  if(!this.certifId && this.azmId){
    this.certifId = this.azmId.replace('AZM','AZC');
  }

  // AUTO-CALCUL COMMISSION
  if (this.prixVendu) {
    if (this.typeVente === 'enchere') {
      this.commissionRate = 20;
    } else {
      this.commissionRate = 15;
    }
    this.montantCommission = (this.prixVendu * this.commissionRate) / 100;
    this.montantArtiste = this.prixVendu - this.montantCommission;
  }

  // AUTO-EXPIRE BOOST
  if (this.isBoosted && this.boostExpireAt && this.boostExpireAt < new Date()) {
    this.isBoosted = false;
  }
});

const Artwork = mongoose.models.Artwork || mongoose.model('Artwork', artworkSchema);
export default Artwork;
