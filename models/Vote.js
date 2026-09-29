import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref:'User', required:true},
  artwork: {type: mongoose.Schema.Types.ObjectId, ref:'Artwork', required:true},
  exposition: {type: mongoose.Schema.Types.ObjectId, ref:'Exposition'}
},{timestamps:true});
schema.index({user:1, artwork:1}, {unique:true});
export default mongoose.model('Vote', schema);
