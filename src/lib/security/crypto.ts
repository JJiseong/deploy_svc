import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "../env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function keyFromEnv(): Buffer {
  return Buffer.from(getEnv().APP_ENCRYPTION_KEY, "hex");
}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export function encryptSecret(value: string, key = keyFromEnv()): EncryptedSecret {
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    keyVersion: 1,
  };
}

export function decryptSecret(secret: Pick<EncryptedSecret, "ciphertext" | "iv" | "authTag">, key = keyFromEnv()): string {
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function generateBasicPassword(): string {
  return randomBytes(24).toString("base64url");
}
