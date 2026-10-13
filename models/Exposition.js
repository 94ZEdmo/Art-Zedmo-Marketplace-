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
    theme: { type: String, trim: true, maxlength: 200, default: 'Royauté Africaine' },
    description: { type: String, trim: true, maxlength: 10000, default: '' },
    lieu: { type: String, trim: true, maxlength: 200, default: '' },
    image: { type: String, trim: true, maxlength: 2048, default: '' },

    // =================================================
    // DATES - CORRIGÉ POUR TON FONCTIONNEMENT DÉFINITIF
    // =================================================
    dateDebut: { type: Date, required: true, default: Date.now },
    dateFin: { type: Date, required: true, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    
    // NOUVEAU : On sépare soumission et vote comme tu l'as demandé
    dateDebutSoumission: { type: Date, default: Date.now },
    dateFinSoumission: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    dateDebutVote: { type: Date, default: () => new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) },
    dateFinVote: { type: Date, required: true, default: () => new Date(Date.now() + 27 * 24 * 60 * 60 * 1000) },

    // =================================================
    // STATUT - CORRIGÉ ALIGNÉ AVEC TON DOC
    // =================================================
    statut: {
      type: String,
      enum: [
        'a_venir',
        'soumission', // NOUVEAU : ouvert aux soumissions
        'vote',       // NOUVEAU : en cours de vote
        'active',     // ancien, on le garde pour compat
        'vote_clos',
        'enchere',
        'terminee'
      ],
      default: 'soumission',
      index: true
    },

    // =================================================
    // RÈGLES D'EXPOSITION - NOUVEAU
    // =================================================
    regles: {
      maxOeuvresParArtiste: { type: Number, default: 3, min: 1 },
      topPourEnchere: { type: Number, default: 10, min: 1 },
      voteUniqueParVisiteur: { type: Boolean, default: true }
    },

    // ANCIEN : On garde oeuvres pour compatibilité
    oeuvres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artwork' }],
    
    // NOUVEAU : Candidatures avec accept/refus comme dans ton doc
    candidatures: [
      {
        artwork: { type: mongoose.Schema.Types.ObjectId, ref: 'Artwork', required: true },
        artiste: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        dateSoumission: { type: Date, default: Date.now },
        statut: { type: String, enum: ['en_attente', 'acceptee', 'refusee'], default: 'en_attente' }
      }
    ],

    oeuvres_top: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artwork' }],
    totalVotes: { type: Number, default: 0, min: 0 },
    totalArtistes: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

// Validation des dates mise à jour
expositionSchema.pre('validate', function () {
  if (this.dateDebut && this.dateFin && this.dateFin <= this.dateDebut) {
    this.invalidate('dateFin', 'La fin doit être après le début.');
  }
  if (this.dateDebutSoumission && this.dateFinSoumission && this.dateFinSoumission <= this.dateDebutSoumission) {
    this.invalidate('dateFinSoumission', 'Fin soumission après début soumission.');
  }
  if (this.dateDebutVote && this.dateFinVote && this.dateFinVote <= this.dateDebutVote) {
    this.invalidate('dateFinVote', 'Fin vote après début vote.');
  }
});

expositionSchema.index({ statut: 1, dateDebut: -1 });

const Exposition = mongoose.models.Exposition || mongoose.model('Exposition', expositionSchema);
export default Exposition;
