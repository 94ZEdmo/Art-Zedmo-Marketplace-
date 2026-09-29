import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  nom: String,
  email: {type:String, unique:true, required:true},
  password: String,
  role: {type:String, enum:['visiteur','artiste','acheteur','admin'], default:'visiteur'},
  bio: String, pays: String, avatar: String,
  solde: {type:Number, default:0}
},{timestamps:true});
export default mongoose.model('User', schema);
