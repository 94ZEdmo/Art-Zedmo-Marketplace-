import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import User from '../models/User.js';

async function createAdmin() {
  try {
    // Vérification de la configuration
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI est absent de la configuration.');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connexion à MongoDB réussie.');

    // Les informations sont fournies par les variables d'environnement.
    const nom = process.env.ADMIN_NOM?.trim();
    const nom_artiste = process.env.ADMIN_NOM_ARTISTE?.trim();
    const whatsapp = process.env.ADMIN_WHATSAPP?.trim();
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!nom || !nom_artiste || !whatsapp || !email || !password) {
      throw new Error(
        'Configure ADMIN_NOM, ADMIN_NOM_ARTISTE, ' +
        'ADMIN_WHATSAPP, ADMIN_EMAIL et ADMIN_PASSWORD.'
      );
    }

    if (password.length < 12 || password.length > 128) {
      throw new Error(
        'Le mot de passe administrateur doit contenir entre 12 et 128 caractères.'
      );
    }

    // Ne pas écraser un compte existant.
    const existing = await User.findOne({
      $or: [
        { email },
        { whatsapp }
      ]
    }).select('_id email whatsapp role statut');

    if (existing) {
      throw new Error(
        'Un compte utilise déjà cet e-mail ou ce numéro. ' +
        'Aucun compte existant n’a été modifié.'
      );
    }

    // Le modèle User hache automatiquement le mot de passe.
    // Ne pas hacher le mot de passe ici une deuxième fois.
    const admin = await User.create({
      nom,
      nom_artiste,
      whatsapp,
      email,
      password,
      role: 'admin',
      statut: 'valide',
      estVerifie: true
    });

    console.log('\nAdministrateur créé avec succès.');
    console.log('E-mail :', admin.email);
    console.log('Rôle :', admin.role);
    console.log('Statut :', admin.statut);
    console.log('\nTu peux maintenant te connecter à la page Administration.');
  } catch (error) {
    console.error('\nÉchec de création :', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

createAdmin();
