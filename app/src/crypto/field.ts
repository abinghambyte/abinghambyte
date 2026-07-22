import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field-level encryption for PII at rest (testing IDs, name letters, phone
 * numbers). AES-256-GCM (authenticated) via Node's built-in crypto — zero deps.
 * A tampered or wrong-key token fails to decrypt rather than returning garbage.
 *
 * In production the key comes from a KMS / secret manager, not from a string.
 */
export interface Encryptor {
  encrypt(plaintext: string): string;
  decrypt(token: string): string;
}

export function aesGcmEncryptor(key: Buffer): Encryptor {
  if (key.length !== 32) throw new Error("aesGcmEncryptor: key must be 32 bytes (256-bit)");
  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
    },
    decrypt(token: string): string {
      const [ivB, tagB, encB] = token.split(".");
      if (!ivB || !tagB || encB === undefined) throw new Error("malformed ciphertext");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
      decipher.setAuthTag(Buffer.from(tagB, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
    },
  };
}

/**
 * Derive a 32-byte key from a passphrase for LOCAL DEV / demos only. Production
 * must use a real random key from a KMS, not a hashed string.
 */
export function devKeyFromPassphrase(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase).digest();
}
