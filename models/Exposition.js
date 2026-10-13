// Validation des dates mise à jour - version finale
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
  // Auto-calcul si tu oublies une date
  if (!this.dateFinSoumission && this.dateDebutSoumission) {
    this.dateFinSoumission = new Date(this.dateDebutSoumission.getTime() + 7*86400000);
  }
  if (!this.dateDebutVote && this.dateFinSoumission) {
    this.dateDebutVote = new Date(this.dateFinSoumission.getTime() + 86400000);
  }
});

expositionSchema.index({ statut: 1, dateDebut: -1 });
expositionSchema.index({ 'candidatures.statut': 1 });

const Exposition = mongoose.models.Exposition || mongoose.model('Exposition', expositionSchema);
export default Exposition;
