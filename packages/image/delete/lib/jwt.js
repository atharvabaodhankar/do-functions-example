const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "atharva-cloud-image-service-secret-key-123!";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function getAuthUser(args) {
  const headers = args.__ow_headers || {};
  const authHeader = headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  return verifyToken(token);
}

module.exports = { signToken, verifyToken, getAuthUser };
