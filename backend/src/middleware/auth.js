import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(payload) {
  return jwt.sign(payload, secret, { expiresIn: "30d" });
}

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Требуется токен" });
  }
  const token = h.slice(7);
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ error: "Недействительный токен" });
  }
}
