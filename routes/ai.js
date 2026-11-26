import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();
const GROQ_KEY = process.env.GROQ_API_KEY;

const MODEL = 'openai/gpt-oss-120b';
const MODEL_FALLBACK = 'openai/gpt-oss-20b';

function nettoyerTexte(text) {
  let t = String(text || '');
  if (t.includes('')) {
    const fin = t.lastIndexOf('</think>');
    t = t.slice(fin + 8).trim();
  }
  return t;
}

async function callGroq(messages, modelToTry = MODEL) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GROQ_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelToTry,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1200
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (modelToTry === MODEL) {
      console.log('Essai fallback 20b:', data?.error?.message);
      return callGroq(messages, MODEL_FALLBACK);
    }
    throw new Error(data?.error?.message || 'Groq erreur ' + res.status);
  }
  let text = data?.choices?.[0]?.message?.content || '';
  return nettoyerTexte(text);
}

function parseJSONSafe(text) {
  try {
    let clean = String(text || '');
    clean = clean.split('```json').join('').split('```').join('').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(clean.slice(start, end + 1));
    return JSON.parse(clean);
  } catch { return null; }
}

router.post('/description', async (req, res) => {
  try {
    const { titre, categorie } = req.body;
    if (!titre) return res.status(400).json({ error: 'Titre requis' });
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY manquante sur Render' });
    const prompt = 'Tu es un expert en art africain pour ART-ZEDMO Marketplace. Oeuvre: "' + titre + '" - Categorie: ' + (categorie || 'art') + '. Ecris en francais, ton chaleureux vendeur : 1. Une description de 3-4 phrases qui donne envie d acheter, qui valorise l art africain 2. Un titre ameliore si besoin 3. 5 hashtags. Reponds UNIQUEMENT en JSON comme ca : {"description":"...","titreAmeliore":"...","hashtags":["#ArtAfricain","..."]}';
    const text = await callGroq([{ role: 'user', content: prompt }]);
    const parsed = parseJSONSafe(text);
    if (!parsed) return res.json({ description: text, hashtags: ['#ArtAfricain', '#ArtZedmo'] });
    res.json(parsed);
  } catch (e) { console.error('IA description:', e.message); res.status(500).json({ error: e.message }); }
});

router.post('/prix', async (req, res) => {
  try {
    const { titre, categorie } = req.body;
    if (!titre) return res.status(400).json({ error: 'Titre requis' });
    const prompt = 'Tu es un expert du marche de l art africain au Benin. Oeuvre: "' + titre + '" - Categorie: ' + (categorie || 'art') + '. Suggere un prix realiste en FCFA pour vendre vite sur ART-ZEDMO. 1 Pi vaut 600 FCFA environ, donc prixPi = prixFCFA / 600 arrondi a 1 decimale. Reponds UNIQUEMENT en JSON : {"prixFCFA": 25000, "prixPi": 41.7, "explication":"..."}';
    const text = await callGroq([{ role: 'user', content: prompt }]);
    const parsed = parseJSONSafe(text);
    if (!parsed) return res.status(500).json({ error: 'IA n a pas renvoye un prix' });
    res.json(parsed);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/traduire', async (req, res) => {
  try {
    const { texte, langue } = req.body;
    if (!texte) return res.status(400).json({ error: 'Texte requis' });
    const target = langue === 'en' ? 'anglais' : langue || 'anglais';
    const text = await callGroq([{ role: 'user', content: 'Traduis ce texte en ' + target + ', garde le style vendeur, sans ajouter d explication. Texte: "' + texte + '"' }]);
    res.json({ traduction: text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message requis' });
    let contexteOeuvres = '';
    try {
      const Artwork = mongoose.model('Artwork');
      const oeuvres = await Artwork.find({ statut: { $nin: ['rejetee', 'supprime'] } }).sort({ createdAt: -1 }).limit(30).lean();
      if (oeuvres.length) {
        contexteOeuvres = '\n\nOEUVRES REELLES DISPONIBLES SUR ART-ZEDMO (utilise SEULEMENT celles-ci, ne pas inventer) :\n' + oeuvres.map(o => '- "' + o.titre + '" | ' + o.categorie + ' | ' + (o.prix || 0) + ' FCFA | Artiste: ' + (o.artisteNom || 'Artiste') + ' | ' + String(o.description || '').slice(0, 80)).join('\n');
      }
    } catch {}
    const system = 'Tu es l assistant ART-ZEDMO Marketplace, art africain, Benin. Tu parles francais simple, amical, comme sur WhatsApp. Tu aides a choisir une oeuvre, expliquer comment acheter (Pi, USDT, MTN, Moov), voter, publier. Paiements: MTN +2290196587303, Moov +2290194655238, USDT TRC20, Pi Network. Si on te demande la liste des oeuvres, cite les vraies oeuvres ci-dessous avec leur prix. Ne jamais inventer une oeuvre qui n est pas dans la liste. ' + contexteOeuvres;
    const messages = [
      { role: 'system', content: system },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: 'user', content: message }
    ];
    const reponse = await callGroq(messages);
    res.json({ reponse });
  } catch (e) { console.error('IA chat:', e.message); res.status(500).json({ error: e.message }); }
});

export default router;
