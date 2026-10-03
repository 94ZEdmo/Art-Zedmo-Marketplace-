import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  nom: { type: String, required: true }, // Nom complet
  nom_artiste: { type: String, required: true }, // Nouveau
  whatsapp: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true }, // Maintenant requis pour admin
  password: { type: String, required: true },
  role: { type: String, enum: ['artiste','acheteur','admin'], default: 'artiste' },
  ville: { type: String, default: 'Abomey-Calavi' },
  bio: String,
  avatar: String,
  
  // Double boucle validation
  statut: { type: String, enum: ['en_attente','valide','refuse'], default: 'en_attente' },
  estVerifie: { type: Boolean, default: false },
  
  totalOeuvres: { type: Number, default: 0 },
  totalVentes: { type: Number, default: 0 },
  totalVotesRecus: { type: Number, default: 0 },
  solde: { type: Number, default: 0 }
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
