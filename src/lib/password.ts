import bcrypt from "bcryptjs"

// Passwords are now stored scrambled (hashed), never as plain text.
export function isHashed(stored: string) {
  return /^\$2[aby]\$/.test(stored)
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10)
}

// Works for new (hashed) passwords. Old plain-text accounts still work once,
// then get upgraded to hashed at their next login.
export async function verifyPassword(plain: string, stored: string) {
  if (isHashed(stored)) return bcrypt.compare(plain, stored)
  return plain === stored
}
