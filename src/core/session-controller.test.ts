import assert from "node:assert/strict";
import test from "node:test";
import { TransportId } from "./transport";
import { canRecoverReceiver, canRestartSender, validateReselectedFile } from "./resume-policy";
import { setResumeCapability, transitionSession } from "./session-controller";
import type { TransferSession } from "./transfer-session";

function session(direction: "send" | "receive" = "send"): TransferSession {
  return {
    schemaVersion: 1,
    transferId: "session-1",
    protocolVersion: 1,
    direction,
    transport: TransportId.QR,
    file: { name: "photo.png", size: 12, mimeType: "image/png", sha256Hex: "a".repeat(64), mediaKind: "image" },
    blockSize: 4,
    totalBlocks: 3,
    status: "ready",
    createdAt: 1,
    updatedAt: 1,
    completedAt: null,
    resumeCapability: "none",
    encodingMode: "fountain",
    acceptedSymbols: 0,
    resolvedBlocks: 0,
    checkpointVersion: 0,
    failureCode: null,
    transportConfig: {},
  };
}

test("allows explicit session transitions and seals completion time", () => {
  const active = transitionSession(session(), "active", 10);
  const complete = transitionSession(active, "complete", 20);
  assert.equal(complete.completedAt, 20);
  assert.throws(() => transitionSession(complete, "active"), /Invalid session transition/);
});

test("does not mark receiver replay recoverable without exact durable state", () => {
  assert.equal(canRecoverReceiver({ hasExactMetadata: true, durableAcceptedSymbols: 1, storageAvailable: true }), true);
  assert.equal(canRecoverReceiver({ hasExactMetadata: false, durableAcceptedSymbols: 10, storageAvailable: true }), false);
  assert.equal(canRecoverReceiver({ hasExactMetadata: true, durableAcceptedSymbols: 0, storageAvailable: true }), false);
  const activeReceiver = transitionSession(session("receive"), "active");
  assert.throws(() => transitionSession(activeReceiver, "recoverable"), /lacks exact durable/);
  const recoverable = transitionSession(activeReceiver, "recoverable", 20, { hasExactMetadata: true, durableAcceptedSymbols: 1, storageAvailable: true });
  assert.equal(recoverable.status, "recoverable");
  assert.throws(() => setResumeCapability(activeReceiver, "replay-receiver"), /lacks exact durable/);
});

test("sender restart requires QR identity and exact re-selection", () => {
  const sender = session("send");
  assert.equal(canRestartSender(sender), true);
  assert.deepEqual(validateReselectedFile(sender, { name: "photo.png", size: 12, sha256Hex: "a".repeat(64) }), []);
  assert.equal(validateReselectedFile(sender, { name: "other.png", size: 12, sha256Hex: "b".repeat(64) }).length, 2);
  assert.throws(() => setResumeCapability(sender, "replay-receiver"), /Only receiver/);
});
