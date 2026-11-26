import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

function getKey() { return process.env.GROQ_API_KEY || ''; }

async function callGroq(system, userText) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText }
      ]
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || 'Erreur Groq');
  return d.choices?.[0]?.message?.content || '';
}

// --- 1. DESCRIPTION + HASHTAGS ---
// POST /api/ai/description { titre, categorie, technique, taille }
router.post('/description', async (req, res) => {
  try {
    if (!getKey()) return res.status(500).json({ error: 'GROQ_API_KEY manquant sur Render' });
    const { titre = '', categorie = '', technique = '', taille = '' } = req.body || {};
    if (!titre) return res.status(400).json({ error: 'Titre manquant' });
    const out = await callGroq(
      'Tu es un expert en art africain, tu écris des descriptions qui vendent, en français simple. Réponds en JSON uniquement: {"description": "...", "hashtags": ["#...", "#..."], "titreAmeliore": "..."}',
      `Oeuvre: titre="${titre}", categorie="${categorie}", technique="${technique}", taille="${taille}". Écris une description de 80-120 mots, chaleureuse, qui donne envie d acheter, + 8 hashtags + un titre amélioré.`
    );
    const clean = out.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// --- 2. CONSEIL PRIX ---
// POST /api/ai/prix { titre, categorie, technique, taille }
router.post('/prix', async (req, res) => {
  try {
    if (!getKey()) return res.status(500).json({ error: 'GROQ_API_KEY manquant sur Render' });
    const { titre = '', categorie = '', technique = '', taille = '' } = req.body || {};
    const out = await callGroq(
      'Tu es un expert du marché de l art au Bénin et en Afrique de l Ouest. Réponds en JSON uniquement: {"prixFCFA": 25000, "prixPi": 2.5, "explication": "..."}',
      `Conseille un prix juste pour: titre="${titre}", categorie="${categorie}", technique="${technique}", taille="${taille}". Prix en FCFA réaliste pour un artiste débutant/intermédiaire au Bénin. 1 Pi = environ 10000 FCFA. Donne une explication en 2 phrases.`
    );
    const clean = out.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// --- 3. CHATBOT CLIENT ---
// POST /api/ai/chat { message, history: [{role, content}] }
router.post('/chat', async (req, res) => {
  try {
    if (!getKey()) return res.status(500).json({ error: 'GROQ_API_KEY manquant sur Render' });
    const { message = '', history = [] } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message manquant' });
    const out = await callGroq(
      'Tu es l assistant de ART-ZEDMO Marketplace, galerie d art du Bénin. Tu es accueillant, tu parles français simple. Tu aides les clients à choisir une oeuvre pour leur salon, chambre, bureau, cadeau. Tu ne parles jamais de politique. Si tu ne sais pas, dis de contacter WhatsApp 0194655238. Réponds en 2-3 phrases courtes.',
      `Historique: ${JSON.stringify(history).slice(0, 2000)}\nClient: ${message}`
    );
    return res.json({ reponse: out });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// --- 4. TRADUCTION AUTO ---
// POST /api/ai/traduire { texte, langue: "en" | "fr" | "fon" | "yoruba" ... }
router.post('/traduire', async (req, res) => {
  try {
    if (!getKey()) return res.status(500).json({ error: 'GROQ_API_KEY manquant sur Render' });
    const { texte = '', langue = 'en' } = req.body || {};
    if (!texte) return res.status(400).json({ error: 'Texte manquant' });
    const out = await callGroq(
      'Tu es un traducteur professionnel. Tu traduis fidèlement, sans ajouter ni enlever. Tu réponds UNIQUEMENT avec la traduction, sans guillemets.',
      `Traduis ce texte en langue: ${langue}\nTexte: ${texte}`
    );
    return res.json({ traduction: out, langue });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

export default router;
