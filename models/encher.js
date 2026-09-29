import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  artwork: {type: mongoose.Schema.Types.ObjectId, ref:'Artwork', required:true},
  prixDepart: Number,
  enchereActuelle: {type:Number, default:0},
  gagnant: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  dateDebut: {type:Date, default:Date.now},
  dateFin: {type:Date, required:true},
  historique: [{user:{type: mongoose.Schema.Types.ObjectId, ref:'User'}, montant:Number, date:{type:Date, default:Date.now}}],
  statut: {type:String, enum:['a_venir','en_cours','terminee'], default:'en_cours'}
},{timestamps:true});
export default mongoose.model('Enchere', schema);