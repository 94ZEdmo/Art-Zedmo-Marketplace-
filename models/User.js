import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  whatsapp: { type: String, required: true, unique: true },
  email: { type: String, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['artiste','acheteur','admin'], default: 'artiste' },
  ville: { type: String, default: 'Abomey-Calavi' },
  bio: String,
  avatar: String,
  totalOeuvres: { type: Number, default: 0 },
  totalVentes: { type: Number, default: 0 },
  totalVotesRecus: { type: Number, default: 0 },
  estVerifie: { type: Boolean, default: false }
},{timestamps:true});

userSchema.pre('save', async function(next){
  if(!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.comparePassword = function(pwd){
  return bcrypt.compare(pwd, this.password);
};

export default mongoose.model('User', userSchema);
