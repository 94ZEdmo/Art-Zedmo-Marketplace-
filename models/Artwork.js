import mongoose from 'mongoose';

const artworkSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  description: String,
  prix: { type: Number, required: true },
  prixReserve: Number,
  images: [String],
  image: String, // compatibilité avec ton ancien front
  categorie: { type: String, enum:['Peinture','Sculpture','Photographie','Textile','Digital','Autre'], default:'Peinture' },
  ville: String,
  artiste: { type: mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  exposition: { type: mongoose.Schema.Types.ObjectId, ref:'Exposition' },
  statut: { type: String, enum:['en_attente','validee','en_expo','en_enchere','vendue','rejetee'], default:'validee' },
  votesCount: { type: Number, default:0 },
  vues: { type: Number, default:0 },
  lien_vote_unique: String
},{timestamps:true});

artworkSchema.pre('save', function(next){
  if(!this.lien_vote_unique){
    const shortId = this._id? this._id.toString().slice(-6) : Math.random().toString(36).slice(2,8);
    this.lien_vote_unique = `art-zedmo.com/expo/vote/${shortId}-${Math.random().toString(36).slice(2,5)}`;
  }
  if(this.images && this.images[0]) this.image = this.images[0];
  next();
});

artworkSchema.index({ votesCount:-1 });
artworkSchema.index({ exposition:1, statut:1 });

export default mongoose.model('Artwork', artworkSchema);
