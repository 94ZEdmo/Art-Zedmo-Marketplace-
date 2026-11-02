import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'zedmo_secret_dev_32_chars_minimum';

export const authMiddleware = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth requise' });
  try {
    const token = h.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    req.auth = req.user;
    next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide' });
  }
};
