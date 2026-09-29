import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  titre: {type:String, required:true},
  description: String,
  type: {type:String, enum:['collective','individuelle'], default:'collective'},
  theme: String,
  dateDebut: Date, dateFin: Date,
  oeuvres: [{type: mongoose.Schema.Types.ObjectId, ref:'Artwork'}],
  statut: {type:String, enum:['preparation','active','vote','enchere','terminee'], default:'active'}
},{timestamps:true});
export default mongoose.model('Exposition', schema);
