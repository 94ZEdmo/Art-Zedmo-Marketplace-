const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'artzedmo@gmail.com',
    pass: 'llcpocenfcdogltz',
  },
});

transporter.verify((err) => {
  if (err) console.log("❌ Erreur email ART-ZEDMO:", err);
  else console.log("✅ artzedmo@gmail.com est prêt à envoyer");
});

const sendInscriptionEmail = async (to, nom) => {
  return transporter.sendMail({
    from: '"ART-ZEDMO" <artzedmo@gmail.com>',
    to,
    subject: 'Inscription reçue - ART-ZEDMO',
    html: `<div style="font-family:Arial"><h2>Salut ${nom} !</h2><p>On a bien reçu ton inscription sur <b>ART-ZEDMO</b>.</p><p>Notre équipe vérifie ton profil et te répond sous 24h.</p><br><p>L'équipe ART-ZEDMO 🇧🇯</p></div>`
  });
};

const sendVenteEmail = async (to, oeuvre, montant) => {
  return transporter.sendMail({
    from: '"ART-ZEDMO" <artzedmo@gmail.com>',
    to,
    subject: `Vente : ${oeuvre} - ART-ZEDMO`,
    html: `<div style="font-family:Arial"><h2>Bravo !</h2><p>Ton oeuvre <b>${oeuvre}</b> vient d'être vendue pour <b>${montant} FCFA</b>.</p><p>Le transfert MoMo est en cours.</p></div>`
  });
};

const sendTransfertEmail = async (to, montant) => {
  return transporter.sendMail({
    from: '"ART-ZEDMO" <artzedmo@gmail.com>',
    to,
    subject: 'Transfert MoMo effectué - ART-ZEDMO',
    html: `<div style="font-family:Arial"><h2>Transfert envoyé</h2><p>Nous venons de t'envoyer <b>${montant} FCFA</b> sur ton numéro MoMo.</p><p>Vérifie ton solde.</p></div>`
  });
};

module.exports = { sendInscriptionEmail, sendVenteEmail, sendTransfertEmail };
