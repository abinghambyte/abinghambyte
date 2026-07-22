import test from "node:test";
import assert from "node:assert/strict";
import { aesGcmEncryptor, devKeyFromPassphrase } from "./field.ts";

const enc = aesGcmEncryptor(devKeyFromPassphrase("unit-test-key"));

test("round-trips plaintext", () => {
  for (const s of ["1001", "AB#", "+19705551234", "José", ""]) {
    assert.equal(enc.decrypt(enc.encrypt(s)), s);
  }
});

test("ciphertext is non-deterministic (random IV)", () => {
  assert.notEqual(enc.encrypt("1001"), enc.encrypt("1001"));
});

test("wrong key fails to decrypt (authenticated)", () => {
  const other = aesGcmEncryptor(devKeyFromPassphrase("different-key"));
  assert.throws(() => other.decrypt(enc.encrypt("secret")));
});

test("tampered ciphertext fails to decrypt", () => {
  const token = enc.encrypt("secret");
  const [iv, tag, ct] = token.split(".");
  const flipped = ct[0] === "A" ? "B" : "A";
  assert.throws(() => enc.decrypt([iv, tag, flipped + ct.slice(1)].join(".")));
});

test("rejects a wrong-length key", () => {
  assert.throws(() => aesGcmEncryptor(Buffer.alloc(16)));
});
