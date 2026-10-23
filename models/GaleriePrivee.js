import mongoose from 'mongoose';

const galeriePriveeSchema = new mongoose.Schema({
  proprietaire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // 1 galerie privée par user
  },
  nomGalerie: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    default: 'Ma Galerie Privée'
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  description: { type: String, maxlength: 2000, default: '' },
  banniere: { type: String, default: '' },
  logo: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  prixAcces: { type: Number, default: 0 }, // 0 = gratuit, sinon payant pour entrer
  vues: { type: Number, default: 0 },
  // Stats auto
  totalOeuvres: { type: Number, default: 0 }
}, { timestamps: true });

galeriePriveeSchema.pre('save', function() {
  if (!this.slug && this.nomGalerie) {
    this.slug = this.nomGalerie.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + this.proprietaire.toString().slice(-6);
  }
});

galeriePriveeSchema.index({ slug: 1 });
galeriePriveeSchema.index({ proprietaire: 1 });

const GaleriePrivee = mongoose.models.GaleriePrivee || mongoose.model('GaleriePrivee', galeriePriveeSchema);
export default GaleriePrivee;
