import mongoose from 'mongoose';

const expositionSchema = new mongoose.Schema({
  titre: { type: String, required:true, default:"Expo OCT 2026 - Royauté Africaine" },
  theme: { type: String, default:"Royauté Africaine" },
  description: String,
  dateDebut: { type: Date, default: Date.now },
  dateFin: { type: Date, default: ()=> new Date(Date.now()+30*24*60*60*1000) },
  dateFinVote: { type: Date, default: ()=> new Date(Date.now()+27*24*60*60*1000) },
  statut: { type: String, enum:['a_venir','active','vote_clos','enchere','terminee'], default:'active' },
  oeuvres: [{ type: mongoose.Schema.Types.ObjectId, ref:'Artwork' }],
  oeuvres_top: [{ type: mongoose.Schema.Types.ObjectId, ref:'Artwork' }],
  totalVotes: { type: Number, default:0 },
  totalArtistes: { type: Number, default:0 }
},{timestamps:true});

export default mongoose.model('Exposition', expositionSchema);
