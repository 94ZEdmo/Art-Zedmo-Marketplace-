import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    votant_whatsapp: {
      type: String,
      trim: true,
      default: null,
      maxlength: 30
    },

    votant_ip: {
      type: String,
      default: null,
      maxlength: 100
    },

    artwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Artwork',
      required: true,
      index: true
    },

    exposition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exposition',
      default: null
    },

    source_lien: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/*
 * ANTI-DOUBLON
 *
 * Un compte ne peut voter qu'une fois pour une même œuvre.
 * Un numéro WhatsApp ne peut voter qu'une fois pour une même œuvre.
 *
 * Attention :
 * Les index uniques empêchent les doublons lorsque la même valeur
 * est fournie. Ils ne garantissent pas l'identité réelle du votant.
 */

// Un compte utilisateur = un vote par œuvre.
voteSchema.index(
  { user: 1, artwork: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $type: 'objectId' }
    }
  }
);

// Un numéro WhatsApp = un vote par œuvre.
voteSchema.index(
  { votant_whatsapp: 1, artwork: 1 },
  {
    unique: true,
    partialFilterExpression: {
      votant_whatsapp: { $type: 'string' }
    }
  }
);

// Accélère les recherches de votes par exposition.
voteSchema.index({
  exposition: 1,
  createdAt: -1
});

/*
 * IMPORTANT :
 *
 * Aucun hook post('save') ici.
 *
 * Les compteurs votesCount, totalVotes et totalVotesRecus
 * doivent être mis à jour par la logique de vote du serveur.
 *
 * Cela évite de compter deux fois le même vote.
 */

const Vote =
  mongoose.models.Vote ||
  mongoose.model('Vote', voteSchema);

export default Vote;
