import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../core/transport";
import {
  runSoftwareOpticalIntegration,
  type SoftwareOpticalIntegrationResult,
} from "./software-optical-integration";
import { SOFTWARE_CHANNEL_LABEL, SoftwareOpticalChannel } from "./software-optical-channel";
import { TransportPipelineRegistry } from "./transport-pipeline-registry";

const payload = Uint8Array.from({ length: 48 }, (_, index) => (index * 37 + 11) & 0xff);

function assertVerified(result: SoftwareOpticalIntegrationResult): void {
  const details = JSON.stringify(result);
  assert.equal(result.verificationType, "SOFTWARE");
  assert.equal(result.channelLabel, SOFTWARE_CHANNEL_LABEL);
  assert.equal(result.txSuccess, true);
  assert.equal(result.channelSuccess, true);
  assert.equal(result.rxSuccess, true);
  assert.equal(result.crcStatus, result.protocol === TransportId.QR ? "not-applicable" : "valid");
  assert.equal(result.reconstructionSuccess, true, details);
  assert.equal(result.sha256Success, true, details);
  assert.equal(result.actualSha256, result.expectedSha256);
  assert.equal(result.status, "SOFTWARE_END_TO_END_VERIFIED");
  assert.ok(result.runId.length > 0);
  assert.ok(Number.isFinite(Date.parse(result.timestamp)));
  assert.ok(Number.isFinite(Date.parse(result.completedAt)));
  assert.ok(Date.parse(result.completedAt) >= Date.parse(result.timestamp));
  assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
  assert.ok(Number.isInteger(result.softwareChannelSeed));
  assert.equal(result.verificationSource, "PHASE_8E_SOFTWARE_HARNESS");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.protocolConfiguration), true);
  assert.equal(Object.isFrozen(result.channelDiagnostics), true);
  const originalStatus = result.status;
  assert.throws(() => { (result as { status: string }).status = "FAILED"; });
  assert.equal(result.status, originalStatus);
}

describe("Phase 8E software optical integration", () => {
  test("QR completes encoder-image-scan-reconstruction-SHA-256", async () => {
    assertVerified(await runSoftwareOpticalIntegration({
      transport: TransportId.QR,
      payload,
      transferMode: "sequential",
      blockSize: 16,
    }));
  });

  test("VLC OOK completes sequential transfer", async () => {
    const result = await runSoftwareOpticalIntegration({
      transport: TransportId.VLC, payload, transferMode: "sequential", blockSize: 16,
    });
    assertVerified(result);
    assert.ok(result.multiUnitFrames > 0);
  });

  test("VLC OOK completes fountain transfer", async () => {
    const result = await runSoftwareOpticalIntegration({
      transport: TransportId.VLC, payload, transferMode: "fountain", blockSize: 16,
    });
    assertVerified(result);
    assert.ok(result.fountainSymbolsAccepted >= 3);
  });

  for (const modulation of ["bpsk", "qpsk", "16qam"] as const) {
    for (const gridSize of [8, 16, 32] as const) {
      test(`Visual OFDM ${modulation} ${gridSize}x${gridSize} completes full path`, async () => {
        const result = await runSoftwareOpticalIntegration({
          transport: TransportId.VisualOFDM,
          payload,
          modulation,
          gridSize,
          blockSize: 16,
        });
        assertVerified(result);
        if (modulation === "bpsk" && gridSize === 8) assert.ok(result.multiUnitFrames > 0);
      });
    }
  }

  test("VLC controlled corruption is not promoted", async () => {
    const result = await runSoftwareOpticalIntegration({
      transport: TransportId.VLC,
      payload,
      channel: { corruptionRate: 1 },
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.crcStatus, "invalid");
    assert.equal(result.sha256Success, false);
    assert.ok(result.channelDiagnostics.unitsCorrupted > 0);
  });

  test("VLC dropped symbols are not promoted", async () => {
    const result = await runSoftwareOpticalIntegration({
      transport: TransportId.VLC,
      payload,
      channel: { dropRate: 1 },
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.crcStatus, "invalid");
    assert.equal(result.reconstructionSuccess, false);
    assert.ok(result.channelDiagnostics.unitsDropped > 0);
  });

  test("OFDM corrupted grids are not promoted", async () => {
    const result = await runSoftwareOpticalIntegration({
      transport: TransportId.VisualOFDM,
      payload,
      modulation: "qpsk",
      gridSize: 16,
      channel: { corruptionRate: 1 },
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.crcStatus, "invalid");
    assert.equal(result.sha256Success, false);
  });

  test("OFDM dropped grids are not promoted", async () => {
    const result = await runSoftwareOpticalIntegration({
      transport: TransportId.VisualOFDM,
      payload,
      modulation: "bpsk",
      gridSize: 8,
      channel: { dropRate: 1 },
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.crcStatus, "invalid");
    assert.equal(result.reconstructionSuccess, false);
  });

  test("software channel is deterministically reproducible", () => {
    const first = new SoftwareOpticalChannel({ seed: 123, luminanceNoise: 4, rgbNoise: 3, brightnessDrift: 0.1 });
    const second = new SoftwareOpticalChannel({ seed: 123, luminanceNoise: 4, rgbNoise: 3, brightnessDrift: 0.1 });
    const input: [number, number, number] = [100, 120, 140];
    const outputsA = Array.from({ length: 8 }, (_, index) => first.transmitVlcSymbol(120, input, index));
    const outputsB = Array.from({ length: 8 }, (_, index) => second.transmitVlcSymbol(120, input, index));
    assert.deepEqual(outputsA, outputsB);
  });

  test("pipeline registry never falls back to QR", async () => {
    const registry = new TransportPipelineRegistry();
    assert.throws(
      () => registry.run(TransportId.VLC, {}),
      /No transmitter\/receiver pipeline registered for vlc/,
    );
    assert.throws(
      () => registry.run(TransportId.VisualOFDM, {}),
      /No transmitter\/receiver pipeline registered for visual-ofdm/,
    );
  });
});
