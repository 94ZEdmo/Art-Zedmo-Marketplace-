import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  titre: {type:String, required:true},
  description: String,
  categorie: {type:String, enum:['Peinture','Sculpture','Photographie','Art numérique','Dessin'], required:true},
  technique: String, dimensions: String, annee: Number,
  prix: {type:Number, required:true},
  typeVente: {type:String, enum:['directe','enchere'], default:'directe'},
  statut: {type:String, enum:['en_attente','validee','vendue'], default:'en_attente'},
  image: String,
  artiste: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  votesCount: {type:Number, default:0},
  exposition: {type: mongoose.Schema.Types.ObjectId, ref:'Exposition'}
},{timestamps:true});
export default mongoose.model('Artwork', schema);
