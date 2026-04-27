import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, KEY_LENGTH).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password, storedHash = "") {
  const [, salt, key] = storedHash.split("$");
  if (!salt || !key) {
    return false;
  }

  const expected = Buffer.from(key, "base64url");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("base64url");
}

export function safeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    status: user.status,
    bio: user.bio || "",
    website: user.website || "",
    theme: user.theme || "",
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
