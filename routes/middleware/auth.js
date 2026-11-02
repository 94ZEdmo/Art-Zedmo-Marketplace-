import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'zedmo_secret_dev_32_chars_minimum';

export const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Auth requise' });
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.auth = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Jeton invalide' });
  }
};

export const requireAdmin = async (req, res, next) => {
  next();
};
