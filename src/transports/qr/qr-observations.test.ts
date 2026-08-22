import assert from "node:assert/strict";
import test from "node:test";
import { addDecodeObservation, EMPTY_QR_OBSERVATIONS } from "./qr-observations";

test("keeps no-signal misses distinct from invalid decode errors", () => {
  const decoded = addDecodeObservation(EMPTY_QR_OBSERVATIONS, "decoded", 5);
  const missed = addDecodeObservation(decoded, "no-signal", 7);
  const invalid = addDecodeObservation(missed, "invalid", 9);

  assert.equal(invalid.decodeAttempts, 3);
  assert.equal(invalid.decodedFrames, 1);
  assert.equal(invalid.noSignalFrames, 1);
  assert.equal(invalid.invalidFrames, 1);
  assert.equal(invalid.totalDecodeTimeMs, 21);
});
