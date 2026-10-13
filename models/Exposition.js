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

    dateDebut: { type: Date, required: true, default: Date.now },
    dateFin: { type: Date, required: true, default: () => new Date(Date.now() + 30 * 86400000) },
    dateDebutSoumission: { type: Date, default: Date.now },
    dateFinSoumission: { type: Date, default: () => new Date(Date.now() + 7 * 86400000) },
    dateDebutVote: { type: Date, default: () => new Date(Date.now() + 8 * 86400000) },
    dateFinVote: { type: Date, required: true, default: () => new Date(Date.now() + 27 * 86400000) },

    statut: {
      type: String,
      enum: ['a_venir','soumission','vote','active','vote_clos','enchere','terminee'],
      default: 'soumission',
      index: true
    },

    regles: {
      maxOeuvresParArtiste: { type: Number, default: 3, min: 1 },
      topPourEnchere: { type: Number, default: 10, min: 1 },
      voteUniqueParVisiteur: { type: Boolean, default: true }
    },

    oeuvres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artwork' }],
    
    candidatures: [
      {
        artwork: { type: mongoose.Schema.Types.ObjectId, ref: 'Artwork', required: true },
        artiste: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        dateSoumission: { type: Date, default: Date.now },
        statut: { type: String, enum: ['en_attente', 'acceptee', 'refusee'], default: 'en_attente' }
      }
    ],

    oeuvres_top: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artwork' }],
    totalVotes: { type: Number, default: 0 },
    totalArtistes: { type: Number, default: 0 }
  },
  { timestamps: true }
);

expositionSchema.pre('validate', function () {
  if (this.dateDebut && this.dateFin && this.dateFin <= this.dateDebut) {
    this.invalidate('dateFin', 'Fin après début');
  }
  if (this.dateDebutSoumission && this.dateFinSoumission && this.dateFinSoumission <= this.dateDebutSoumission) {
    this.invalidate('dateFinSoumission', 'Fin soumission après début');
  }
  if (this.dateDebutVote && this.dateFinVote && this.dateFinVote <= this.dateDebutVote) {
    this.invalidate('dateFinVote', 'Fin vote après début vote');
  }
});

expositionSchema.index({ statut: 1, dateDebut: -1 });
expositionSchema.index({ 'candidatures.statut': 1 });

const Exposition = mongoose.models.Exposition || mongoose.model('Exposition', expositionSchema);
export default Exposition;
