import assert from "node:assert/strict";
import test from "node:test";
import { ReceiverSessionController } from "./receiver-session-controller";
import { TransportId } from "./transport";

const qr = { transport: TransportId.QR, vlcModulation: "ook" as const, ofdmModulation: "bpsk" as const, ofdmGridSize: 8 as const };
const ofdm = { ...qr, transport: TransportId.VisualOFDM, ofdmModulation: "qpsk" as const, ofdmGridSize: 16 as const };

test("receiver configuration is locked during receive and finalization", () => {
  let resets = 0;
  const controller = new ReceiverSessionController(qr, () => { resets++; });
  controller.setReceiving(true);
  assert.equal(controller.changeConfiguration(ofdm), false);
  controller.setReceiving(false);
  controller.setFinalizing(true);
  assert.equal(controller.changeConfiguration(ofdm), false);
  assert.deepEqual(controller.getConfiguration(), qr);
  assert.equal(resets, 0);
});

test("unlocked receiver configuration change resets state atomically", () => {
  let resets = 0;
  const controller = new ReceiverSessionController(qr, () => { resets++; });
  assert.equal(controller.changeConfiguration(ofdm), true);
  assert.deepEqual(controller.getConfiguration(), ofdm);
  assert.equal(resets, 1);
  assert.equal(Object.isFrozen(controller.getConfiguration()), true);
});
