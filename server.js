import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.js';
import artworkRoutes from './routes/artworks.js';
import expoRoutes from './routes/expositions.js';
import voteRoutes from './routes/votes.js';
import enchereRoutes from './routes/encheres.js';
import annonceRoutes from './routes/annonces.js';

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 10000;
const MONGO_URL = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// =====================================================
// 1. CONFIGURATION ET VALIDATION
// =====================================================

if (!MONGO_URL) {
  console.error('ERREUR : MONGO_URI ou MONGODB_URI est manquant.');
  process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    'ERREUR : JWT_SECRET doit être configuré dans Render ' +
    'avec une valeur secrète suffisamment longue.'
  );
  process.exit(1);
}

app.disable('x-powered-by');

app.use(cors({
  origin: process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(v => v.trim())
    : false,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '1mb'
}));

// =====================================================
// 2. DOSSIER DES IMAGES
// =====================================================

const uploadDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// =====================================================
// 3. AUTHENTIFICATION JWT
// =====================================================

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentification requise.'
    });
  }

  const token = authorization.slice(7);

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: 'Jeton invalide ou expiré.'
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Accès réservé à l’administrateur.'
    });
  }

  next();
}

// =====================================================
// 4. TÉLÉVERSEMENT DES IMAGES
// =====================================================

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extensionMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif'
    };

    const filename =
      `${Date.now()}-${crypto.randomUUID()}` +
      extensionMap[file.mimetype];

    cb(null, filename);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },

  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Format d’image non autorisé.'));
    }

    cb(null, true);
  }
});

app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Aucune image reçue.'
    });
  }

  const imageUrl = `/uploads/${req.file.filename}`;

  res.status(201).json({
    success: true,
    url: imageUrl,
    image: imageUrl,
    imageUrl
  });
});

// =====================================================
// 5. FICHIERS PUBLICS
// =====================================================

app.use('/uploads', express.static(uploadDir, {
  index: false,
  dotfiles: 'deny',
  maxAge: '1d'
}));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  dotfiles: 'deny'
}));

// =====================================================
// 6. ROUTES PRINCIPALES
// =====================================================

app.use('/api/auth', authRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/expositions', expoRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/encheres', enchereRoutes);
app.use('/api/annonces', annonceRoutes);

// =====================================================
// 7. MODÈLE NFT
// =====================================================

const nftSchema = new mongoose.Schema({
  titre: {
    type: String,
    required: true,
    trim: true
  },

  description: String,

  edition: {
    type: String,
    default: '1/1'
  },

  prixUSDX: {
    type: Number,
    min: 0
  },

  royalties: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },

  blockchain: {
    type: String,
    default: 'Pi'
  },

  categorie: String,

  artiste: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  azmId: {
    type: String,
    unique: true,
    sparse: true
  },

  certifId: String,

  hash: String,

  imageUrl: String,

  proprietaire: String,

  proprietaireWallet: String,

  vendu: {
    type: Boolean,
    default: false
  },

  prixVenteFinal: Number,

  txHash: String,

  dateVente: Date,

  artworkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artwork'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  strict: false
});

const NFT =
  mongoose.models.NFT ||
  mongoose.model('NFT', nftSchema);

// =====================================================
// 8. COMPTEUR DES IDENTIFIANTS ART-ZEDMO
// =====================================================

const counterSchema = new mongoose.Schema({
  _id: String,
  seq: {
    type: Number,
    default: 0
  }
});

const Counter =
  mongoose.models.Counter ||
  mongoose.model('Counter', counterSchema);

async function getNextAZM() {
  const year = new Date().getFullYear();

  const counter = await Counter.findOneAndUpdate(
    { _id: `AZM-${year}` },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true
    }
  );

  const azmId =
    `AZM-${year}-${String(counter.seq).padStart(6, '0')}`;

  const certifId = `AZC-${azmId.slice(4)}`;

  // Véritable empreinte SHA-256 de l'identifiant.
  // Elle identifie ici l'ID, pas le fichier image de l'œuvre.
  const hash = crypto
    .createHash('sha256')
    .update(azmId)
    .digest('hex');

  return {
    azmId,
    certifId,
    hash
  };
}

// =====================================================
// 9. CONFIGURATION DES PAIEMENTS
// =====================================================

const settingsSchema = new mongoose.Schema({
  _id: String,

  momo: {
    type: String,
    default: ''
  },

  moov: {
    type: String,
    default: ''
  },

  usdt: {
    type: String,
    default: ''
  },

  pi: {
    type: String,
    default: ''
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const Settings =
  mongoose.models.Settings ||
  mongoose.model('Settings', settingsSchema);

app.get('/api/settings/paiements', async (req, res, next) => {
  try {
    const settings = await Settings.findById('paiements').lean();

    if (!settings) {
      return res.json({
        momo: '',
        moov: '',
        usdt: '',
        pi: ''
      });
    }

    res.json({
      momo: settings.momo || '',
      moov: settings.moov || '',
      usdt: settings.usdt || '',
      pi: settings.pi || ''
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/settings/paiements',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { momo, moov, usdt, pi } = req.body;

      const settings = await Settings.findOneAndUpdate(
        { _id: 'paiements' },
        {
          $set: {
            momo: momo || '',
            moov: moov || '',
            usdt: usdt || '',
            pi: pi || '',
            updatedAt: new Date()
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      res.json({
        success: true,
        settings
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// 10. ÉTAT DU SERVEUR
// =====================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: mongoose.connection.readyState === 1
      ? 'LIVE'
      : 'DATABASE_DISCONNECTED',

    database: mongoose.connection.readyState === 1
      ? 'CONNECTED'
      : 'DISCONNECTED',

    pi_api_configured: Boolean(process.env.PI_API_KEY),
    pi_wallet_configured: Boolean(process.env.PI_WALLET)
  });
});

// =====================================================
// 11. VÉRIFICATION D'UNE ŒUVRE
// =====================================================

app.get('/api/artworks/verify/:azmId', async (req, res, next) => {
  try {
    const azmId = String(req.params.azmId).toUpperCase();

    let artwork = null;

    if (mongoose.models.Artwork) {
      artwork = await mongoose.models.Artwork
        .findOne({ azmId })
        .populate('artiste', 'nom nom_artiste ville');
    }

    if (artwork) {
      return res.json({
        ...artwork.toObject(),
        verified: true,
        verificationType: 'database_record'
      });
    }

    const nft = await NFT.findOne({ azmId })
      .populate('artiste', 'nom nom_artiste ville');

    if (nft) {
      return res.json({
        ...nft.toObject(),
        verified: true,
        verificationType: 'database_record'
      });
    }

    res.status(404).json({
      error: 'Œuvre ou certificat introuvable.'
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 12. CONSULTATION DES FICHES NFT
// =====================================================

app.get('/api/nft', async (req, res, next) => {
  try {
    const nfts = await NFT.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(nfts);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 13. CRÉATION D'UNE FICHE NFT
// =====================================================

app.post(
  '/api/nft/create',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const {
        titre,
        description,
        prixUSDX,
        royalties,
        blockchain,
        artiste,
        artworkId
      } = req.body;

      if (!titre || !titre.trim()) {
        return res.status(400).json({
          error: 'Le titre est obligatoire.'
        });
      }

      if (
        prixUSDX !== undefined &&
        (!Number.isFinite(Number(prixUSDX)) || Number(prixUSDX) < 0)
      ) {
        return res.status(400).json({
          error: 'Prix invalide.'
        });
      }

      const { azmId, certifId, hash } = await getNextAZM();

      let imageUrl = '';

      if (
        artworkId &&
        mongoose.Types.ObjectId.isValid(artworkId) &&
        mongoose.models.Artwork
      ) {
        const artwork = await mongoose.models.Artwork.findById(artworkId);

        if (!artwork) {
          return res.status(404).json({
            error: 'Œuvre introuvable.'
          });
        }

        imageUrl =
          artwork.images?.[0] ||
          artwork.image ||
          artwork.imageUrl ||
          '';
      }

      const nft = await NFT.create({
        titre: titre.trim(),
        description,
        prixUSDX: Number(prixUSDX ?? 0),
        royalties: Number(royalties ?? 5),
        blockchain: blockchain || 'Pi',
        artiste,
        artworkId: artworkId || undefined,
        azmId,
        certifId,
        hash,
        imageUrl,

        // Une fiche en base ne constitue pas un mint blockchain.
        txHash: undefined,
        vendu: false
      });

      res.status(201).json({
        success: true,
        message: 'Fiche créée dans la base de données.',
        blockchainMinted: false,
        nft
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// 14. SUPPRESSION ADMINISTRATIVE D'UNE FICHE NFT
// =====================================================

app.delete(
  '/api/nft/:id',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const rawId = req.params.id;

      const nft = mongoose.Types.ObjectId.isValid(rawId)
        ? await NFT.findById(rawId)
        : await NFT.findOne({ azmId: rawId.toUpperCase() });

      if (!nft) {
        return res.status(404).json({
          error: 'Fiche NFT introuvable.'
        });
      }

      if (nft.vendu) {
        return res.status(409).json({
          error:
            'Cette fiche correspond à une vente enregistrée. ' +
            'Elle ne peut pas être supprimée par cette route.'
        });
      }

      await NFT.deleteOne({ _id: nft._id });

      res.json({
        success: true,
        message: 'Fiche supprimée.'
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// 15. ANCIEN ACHAT DIRECT DÉSACTIVÉ
// =====================================================

// L'ancienne route /api/nft/:id/buy fabriquait un txHash
// et marquait la fiche comme vendue sans vérifier le paiement.
//
// Elle est volontairement désactivée jusqu'à ce que le système
// de commandes et de confirmation de paiement soit sécurisé.

app.post('/api/nft/:id/buy', (req, res) => {
  res.status(410).json({
    error: 'Achat direct temporairement désactivé.',
    message:
      'Le paiement doit être vérifié avant de confirmer la vente.'
  });
});

// =====================================================
// 16. ANCIENNES ROUTES DE SOLDE : DÉSACTIVÉES
// =====================================================

// L'ancien calcul total NFT vendu × 85 ne constitue pas
// un solde réel. Nous le désactivons en attendant un registre
// de transactions et une attribution fiable des recettes.

app.get('/api/compte/solde', authenticateToken, (req, res) => {
  res.status(501).json({
    error: 'Le calcul du solde doit être relié aux transactions vérifiées.'
  });
});

app.get('/api/compte/mes-achats', authenticateToken, (req, res) => {
  res.status(501).json({
    error: 'L’historique personnel nécessite un lien fiable avec les commandes.'
  });
});

app.get('/api/compte/nft-vendus', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const sold = await NFT.find({ vendu: true })
      .sort({ dateVente: -1 })
      .limit(100)
      .lean();

    res.json(sold);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 17. ERREURS MULTER ET ERREURS GÉNÉRALES
// =====================================================

app.use((err, req, res, next) => {
  console.error('Erreur API :', err.message);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? 'Image trop volumineuse : maximum 5 Mo.'
        : 'Erreur lors du téléversement.'
    });
  }

  if (err.message === 'Format d’image non autorisé.') {
    return res.status(400).json({
      error: err.message
    });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Une erreur serveur est survenue.'
      : err.message
  });
});

// =====================================================
// 18. PAGE PRINCIPALE
// =====================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// 19. ROUTES INCONNUES
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Route introuvable.'
  });
});

// =====================================================
// 20. CONNEXION MONGODB ET DÉMARRAGE
// =====================================================

async function startServer() {
  try {
    await mongoose.connect(MONGO_URL, {
      serverSelectionTimeoutMS: 15000
    });

    console.log('MongoDB Atlas connecté.');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ART-ZEDMO MARKETPLACE démarré sur le port ${PORT}.`);
    });
  } catch (error) {
    console.error('Impossible de démarrer le serveur :', error.message);
    process.exit(1);
  }
}

startServer();
