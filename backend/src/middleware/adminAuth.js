import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "dev-secret-change-me";

export function signAdminToken(payload) {
  return jwt.sign({ ...payload, role: "admin" }, secret, { expiresIn: "30d" });
}

export function adminAuthMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Требуется токен админа" });
  }
  const token = h.slice(7);
  const devTok = process.env.DEV_ADMIN_TOKEN?.trim();
  if (devTok && token === devTok) {
    req.admin = { sub: "dev", role: "admin", name: "Dev" };
    return next();
  }
  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Нужны права администратора" });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Недействительный токен" });
  }
}
