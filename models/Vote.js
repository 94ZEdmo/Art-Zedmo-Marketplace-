import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref:'User' },
  votant_whatsapp: String,
  votant_ip: String,
  artwork: { type: mongoose.Schema.Types.ObjectId, ref:'Artwork', required:true },
  exposition: { type: mongoose.Schema.Types.ObjectId, ref:'Exposition' },
  source_lien: String
},{timestamps:true});

// Anti-triche: 1 compte = 1 vote par oeuvre + 1 WhatsApp = 1 vote par oeuvre
voteSchema.index({ user:1, artwork:1 }, { unique:true, sparse:true });
voteSchema.index({ votant_whatsapp:1, artwork:1 }, { unique:true, sparse:true });

// Double boucle auto
voteSchema.post('save', async function(doc){
  try{
    const Artwork = mongoose.model('Artwork');
    const Exposition = mongoose.model('Exposition');
    const User = mongoose.model('User');
    const art = await Artwork.findByIdAndUpdate(doc.artwork, { $inc:{ votesCount:1 } }, { new:true });
    if(doc.exposition) await Exposition.findByIdAndUpdate(doc.exposition, { $inc:{ totalVotes:1 } });
    if(art && art.artiste) await User.findByIdAndUpdate(art.artiste, { $inc:{ totalVotesRecus:1 } });
  }catch(e){ console.log("Erreur post vote", e.message); }
});

export default mongoose.model('Vote', voteSchema);
