import mongoose from 'mongoose';

const annonceSchema = new mongoose.Schema({
  titre: { type: String, required:true, default:"EXPO OCT 2026 - Royauté Africaine - LIVE" },
  message: String,
  type: { type: String, enum:['info','expo','enchere','urgent'], default:'expo' },
  active: { type: Boolean, default:true }
},{timestamps:true});

export default mongoose.model('Annonce', annonceSchema);
