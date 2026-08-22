import assert from "node:assert/strict";
import test from "node:test";
import { createIntegrityResult, equalBytes, sha256 } from "./integrity";

test("verifies exact bytes and size as bit-perfect", async () => {
  const bytes = new TextEncoder().encode("Lumen optical transfer");
  const hash = await sha256(bytes);
  const result = createIntegrityResult(hash, hash, bytes.length, bytes.length);

  assert.equal(result.status, "verified");
  assert.equal(result.bitPerfect, true);
});

test("rejects size mismatch even when supplied hashes match", async () => {
  const hash = await sha256(new Uint8Array([1, 2, 3]));
  const result = createIntegrityResult(hash, hash, 3, 4);

  assert.equal(result.status, "mismatch");
  assert.equal(result.bitPerfect, false);
});

test("compares every byte", () => {
  assert.equal(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assert.equal(equalBytes(new Uint8Array([1]), new Uint8Array([1, 0])), false);
});
