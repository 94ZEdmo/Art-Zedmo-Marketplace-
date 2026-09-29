import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  message: {type:String, required:true},
  type: {type:String, enum:['info','expo','enchere','urgent'], default:'info'},
  active: {type:Boolean, default:true}
},{timestamps:true});
export default mongoose.model('Annonce', schema);
