import mongoose from 'mongoose';

const enchereSchema = new mongoose.Schema({
  artwork: { type: mongoose.Schema.Types.ObjectId, ref:'Artwork', required:true },
  exposition: { type: mongoose.Schema.Types.ObjectId, ref:'Exposition' },
  prixDepart: { type: Number, required:true },
  enchereActuelle: { type: Number, required:true },
  dernierEncherisseur: { type: mongoose.Schema.Types.ObjectId, ref:'User' },
  offres: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref:'User' },
    montant: Number,
    date: { type: Date, default: Date.now }
  }],
  dateFin: { type: Date, required:true },
  statut: { type: String, enum:['en_cours','terminee','annulee'], default:'en_cours' },
  gagnant: { type: mongoose.Schema.Types.ObjectId, ref:'User' }
},{timestamps:true});

enchereSchema.pre('save', function(next){
  // Auto-prolongation 2min si enchère dans les 2 dernières minutes
  if(this.isModified('enchereActuelle')){
    const maintenant = new Date();
    const diff = this.dateFin - maintenant;
    if(diff < 2*60*1000 && diff > 0){
      this.dateFin = new Date(this.dateFin.getTime() + 2*60*1000);
    }
  }
  next();
});

export default mongoose.model('Enchere', enchereSchema);
