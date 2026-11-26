import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();
const GROQ_KEY = process.env.GROQ_API_KEY;

// ✅ NOUVEAU MODELE GROQ 2026 - L'ancien llama est mort
const MODEL = 'openai/gpt-oss-120b';
const MODEL_FALLBACK = 'openai/gpt-oss-20b';

async function callGroq(messages, modelToTry = MODEL) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelToTry,
      messages,
      temperature: 0.7,
      max_tokens: 1200
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (modelToTry === MODEL) {
      console.log('⚠️ gpt-oss-120b échoué, essai gpt-oss-20b:', data?.error?.message);
      return callGroq(messages, MODEL_FALLBACK);
    }
    throw new Error(data?.error?.message || `Groq erreur ${res.status}`);
  }
  let text = data?.choices?.[0]?.message?.content || '';
  text = text.replace(/
