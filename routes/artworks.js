import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import Artwork from '../models/Artwork.js';
import User from '../models/User.js';

const router = express.Router();

// =====================================================
// 1. CONFIGURATION
// =====================================================

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET doit être configuré avec au moins 32 caractères.'
  );
}

// =====================================================
// 2. AUTHENTIFICATION
// =====================================================

async function authenticateToken(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization ||!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentification requise.'
      });
    }

    const token = authorization.slice(7);

    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256']
      });
    } catch {
      return res.status(401).json({
        error: 'Jeton invalide ou expiré.'
      });
    }

    if (!decoded.id ||!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({
        error: 'Identifiant utilisateur invalide.'
      });
    }

    const user = await User.findById(decoded.id)
     .select('_id nom nom_artiste role statut');

    if (!user) {
      return res.status(401).json({
        error: 'Utilisateur introuvable.'
      });
    }

    if (user.statut!== 'valide') {
      return res.status(403).json({
        error: 'Votre compte n’est pas autorisé.'
      });
    }

    req.user = user;
    req.auth = decoded;

    next();
  } catch (error) {
    next(error);
  }
}

// =====================================================
// 3. AUTORISATION ADMINISTRATEUR
// =====================================================

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role!== 'admin') {
    return res.status(403).json({
      error: 'Cette opération est réservée à un administrateur.'
    });
  }

  next();
}

// =====================================================
// 4. VALIDATION DES IDENTIFIANTS
// =====================================================

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// =====================================================
// 5. GÉNÉRATION DES IDENTIFIANTS AZM
// =====================================================

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
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

  if (!counter) {
    throw new Error('Impossible de générer un identifiant AZM.');
  }

  return `AZM-${year}-${String(counter.seq).padStart(6, '0')}`;
}

// =====================================================
// 6. UTILITAIRES
// =====================================================

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getArtworkImage(artwork) {
  if (Array.isArray(artwork.images) && artwork.images.length > 0) {
    return artwork.images[0];
  }

  return artwork.image || artwork.imageUrl || '';
}

// CORRIGÉ : Ne cache plus les œuvres en exposition
function publicArtworkQuery() {
  return Artwork.find({
    statut: {
      $nin: ['en_attente', 'rejetee']
    }
  });
}

// =====================================================
// 7. LISTE DES ŒUVRES
// GET /api/artworks
// =====================================================

router.get('/', async (req, res, next) => {
  try {
    const {
      tri,
      search,
      categorie,
      statut,
      page = '1',
      limit = '50'
    } = req.query;

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNumber = Math.min(
      100,
      Math.max(1, Number.parseInt(limit, 10) || 50)
    );

    const filter = {};

    if (statut === 'all' || req.query.all === 'true') {
      if (!req.headers.authorization) {
        return res.status(401).json({
          error: 'Authentification requise pour consulter toutes les œuvres.'
        });
      }
      return next();
    }

    // CORRIGÉ : La galerie montre tout sauf en_attente et rejetee
    // Donc une œuvre validee qui est aussi en expo reste visible
    filter.statut = {
      $nin: ['en_attente', 'rejetee']
    };

    if (search!== undefined) {
      const terme = String(search).trim().slice(0, 100);

      if (terme) {
        filter.titre = {
          $regex: escapeRegex(terme),
          $options: 'i'
        };
      }
    }

    if (categorie && categorie!== 'Tous') {
      filter.categorie = String(categorie).slice(0, 100);
    }

    let sort = { createdAt: -1 };

    if (tri === 'populaire') {
      sort = { votesCount: -1, createdAt: -1 };
    } else if (tri === 'prix') {
      sort = { prix: 1, createdAt: -1 };
    } else if (tri === 'prix_desc') {
      sort = { prix: -1, createdAt: -1 };
    }

    const [arts, total] = await Promise.all([
      Artwork.find(filter)
       .populate('artiste', 'nom nom_artiste ville')
       .sort(sort)
       .skip((pageNumber - 1) * limitNumber)
       .limit(limitNumber),

      Artwork.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      total,
      page: pageNumber,
      limit: limitNumber,
      pages: Math.ceil(total / limitNumber),
      artworks: arts
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 8. LISTE COMPLÈTE POUR L'ADMINISTRATEUR
// GET /api/artworks/admin/all
// =====================================================

router.get(
  '/admin/all',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const arts = await Artwork.find()
       .populate('artiste', 'nom nom_artiste ville')
       .sort({ createdAt: -1 })
       .limit(500);

      return res.json({
        success: true,
        artworks: arts
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// 9. DÉTAIL D'UNE ŒUVRE
// GET /api/artworks/:id
// =====================================================

router.get('/:id', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant d’œuvre invalide.'
      });
    }

    const artwork = await Artwork.findById(req.params.id)
     .populate('artiste', 'nom nom_artiste ville bio avatar')
     .populate('exposition', 'titre')
     .populate('expositions', 'titre statut');

    if (!artwork) {
      return res.status(404).json({
        error: 'Œuvre non trouvée.'
      });
    }

    const isPublic =!['en_attente', 'rejetee'].includes(artwork.statut);

    if (!isPublic) {
      const authorization = req.headers.authorization;

      if (!authorization?.startsWith('Bearer ')) {
        return res.status(404).json({
          error: 'Œuvre non trouvée.'
        });
      }

      let decoded;

      try {
        decoded = jwt.verify(
          authorization.slice(7),
          JWT_SECRET,
          { algorithms: ['HS256'] }
        );
      } catch {
        return res.status(401).json({
          error: 'Jeton invalide ou expiré.'
        });
      }

      const requester = await User.findById(decoded.id)
       .select('_id role statut');

      const ownerId =
        artwork.artiste?._id?.toString() ||
        artwork.artiste?.toString();

      const isOwner = ownerId === requester?._id.toString();
      const isAdmin =
        requester?.role === 'admin' &&
        requester?.statut === 'valide';

      if (
       !requester ||
        requester.statut!== 'valide' ||
        (!isOwner &&!isAdmin)
      ) {
        return res.status(404).json({
          error: 'Œuvre non trouvée.'
        });
      }
    }

    await Artwork.updateOne(
      { _id: artwork._id },
      { $inc: { vues: 1 } }
    );

    artwork.vues = (artwork.vues || 0) + 1;

    return res.json(artwork);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 10. CRÉER UNE ŒUVRE
// POST /api/artworks
// =====================================================

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const {
      titre,
      description,
      prix,
      images,
      image,
      categorie,
      ville
    } = req.body;

    if (typeof titre!== 'string' ||!titre.trim()) {
      return res.status(400).json({
        error: 'Le titre est obligatoire.'
      });
    }

    const prixNumber = Number(prix);

    if (!Number.isFinite(prixNumber) || prixNumber <= 0) {
      return res.status(400).json({
        error: 'Le prix doit être un nombre positif.'
      });
    }

    if (titre.trim().length > 200) {
      return res.status(400).json({
        error: 'Le titre ne doit pas dépasser 200 caractères.'
      });
    }

    if (
      description!== undefined &&
      typeof description!== 'string'
    ) {
      return res.status(400).json({
        error: 'La description est invalide.'
      });
    }

    const categoriesAutorisees = [
      'Peinture',
      'Sculpture',
      'Dessin',
      'Photographie',
      'Art numérique',
      'Artisanat',
      'Autre'
    ];

    const categorieFinale = categoriesAutorisees.includes(categorie)
     ? categorie
      : 'Autre';

    let listeImages = [];

    if (Array.isArray(images)) {
      listeImages = images;
    } else if (typeof image === 'string' && image.trim()) {
      listeImages = [image.trim()];
    }

    if (
      listeImages.length > 10 ||
      listeImages.some(
        item => typeof item!== 'string' || item.length > 2048
      )
    ) {
      return res.status(400).json({
        error: 'Les images fournies sont invalides.'
      });
    }

    const artiste = req.user._id;

    const azmId = await getNextAZM();

    const artwork = await Artwork.create({
      titre: titre.trim(),
      description:
        typeof description === 'string'
         ? description.trim().slice(0, 10000)
          : '',
      prix: prixNumber,
      images: listeImages,
      categorie: categorieFinale,
      ville:
        typeof ville === 'string' && ville.trim()
         ? ville.trim().slice(0, 100)
          : req.user.ville || 'Abomey-Calavi',
      artiste,
      statut: 'en_attente',
      azmId
    });

    await User.findByIdAndUpdate(
      artiste,
      { $inc: { totalOeuvres: 1 } }
    );

    return res.status(201).json({
      success: true,
      message: 'Œuvre enregistrée et envoyée pour validation.',
      artwork,
      azmId
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 11. VALIDER OU REFUSER UNE ŒUVRE
// PUT /api/artworks/:id/valider
// ADMIN UNIQUEMENT
// =====================================================

router.put(
  '/:id/valider',
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!validObjectId(req.params.id)) {
        return res.status(400).json({
          error: 'Identifiant d’œuvre invalide.'
        });
      }

      const statut = req.body.statut || 'validee';

      const statutsAutorises = [
        'validee',
        'rejetee'
      ];

      if (!statutsAutorises.includes(statut)) {
        return res.status(400).json({
          error: 'Statut de validation invalide.'
        });
      }

      const artwork = await Artwork.findById(req.params.id);

      if (!artwork) {
        return res.status(404).json({
          error: 'Œuvre non trouvée.'
        });
      }

      if (artwork.statut!== 'en_attente') {
        return res.status(409).json({
          error: 'Cette œuvre a déjà été traitée ou son statut a changé.'
        });
      }

      artwork.statut = statut;

      await artwork.save();

      return res.json({
        success: true,
        artwork
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// 12. MODIFIER UNE ŒUVRE
// PUT /api/artworks/:id
// =====================================================

router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant d’œuvre invalide.'
      });
    }

    const artwork = await Artwork.findById(req.params.id);

    if (!artwork) {
      return res.status(404).json({
        error: 'Œuvre non trouvée.'
      });
    }

    const isOwner =
      artwork.artiste.toString() === req.user._id.toString();

    const isAdmin = req.user.role === 'admin';

    if (!isOwner &&!isAdmin) {
      return res.status(403).json({
        error: 'Vous ne pouvez pas modifier cette œuvre.'
      });
    }

    const champsModifiables = [
      'titre',
      'description',
      'prix',
      'images',
      'categorie',
      'ville'
    ];

    for (const champ of champsModifiables) {
      if (req.body[champ]!== undefined) {
        artwork[champ] = req.body[champ];
      }
    }

    if (!isAdmin) {
      if (
        ['validee'].includes(artwork.statut)
      ) {
        artwork.statut = 'en_attente';
      }
    }

    await artwork.save();

    return res.json({
      success: true,
      artwork
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 13. SUPPRIMER UNE ŒUVRE
// DELETE /api/artworks/:id
// =====================================================

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Identifiant d’œuvre invalide.'
      });
    }

    const artwork = await Artwork.findById(req.params.id);

    if (!artwork) {
      return res.status(404).json({
        error: 'Œuvre non trouvée.'
      });
    }

    const isOwner =
      artwork.artiste.toString() === req.user._id.toString();

    const isAdmin = req.user.role === 'admin';

    if (!isOwner &&!isAdmin) {
      return res.status(403).json({
        error: 'Vous ne pouvez pas supprimer cette œuvre.'
      });
    }

    if (artwork.statut === 'vendue') {
      return res.status(409).json({
        error: 'Une œuvre vendue ne peut pas être supprimée.'
      });
    }

    await Artwork.deleteOne({ _id: artwork._id });

    await User.findByIdAndUpdate(
      artwork.artiste,
      { $inc: { totalOeuvres: -1 } }
    );

    return res.json({
      success: true,
      message: 'Œuvre supprimée.'
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 14. ANCIENNE ROUTE DE VOTE DÉSACTIVÉE
// =====================================================

router.post('/:id/vote', (req, res) => {
  return res.status(410).json({
    error: 'Cette route de vote est désactivée.',
    message: 'Utilisez le système centralisé /api/votes.'
  });
});

// =====================================================
// 15. ACHAT FCFA
// =====================================================

router.post('/:id/buy-fcfa', (req, res) => {
  return res.status(501).json({
    error: 'Confirmation automatique des paiements FCFA non configurée.',
    message:
      'L’œuvre ne sera marquée comme vendue qu’après vérification du paiement.'
  });
});

export default router;
