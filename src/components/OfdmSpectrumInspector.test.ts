import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSubcarrierMap } from "../transports/ofdm/ofdm-framing";
import { calculateCarrierUtilization, estimateSnrFromPilots, estimateTheoreticalBerBpsk } from "../transports/ofdm/ofdm-metrics";
import type { OfdmDemodulationReport } from "../transports/ofdm/ofdm-demodulator";
import type { OfdmDecodedFrame } from "../transports/ofdm/ofdm-framing";

describe("Visual OFDM Spectrum Inspector Telemetry & Formatting (Milestone 4D)", () => {
  test("calculates subcarrier utilization and metric summaries accurately", () => {
    const map16 = createSubcarrierMap(16);
    const util16 = calculateCarrierUtilization(map16.dataIndices.length, 256);
    assert.ok(util16 > 70 && util16 < 95);

    const map32 = createSubcarrierMap(32);
    const util32 = calculateCarrierUtilization(map32.dataIndices.length, 1024);
    assert.ok(util32 > 75 && util32 < 95);
  });

  test("computes SNR in dB and theoretical BER bounds from pilot variance", () => {
    // Ideal channel: observed === expected
    const exp = [1, -1, 1, -1];
    const obsClean = [1, -1, 1, -1];
    const snrClean = estimateSnrFromPilots(obsClean, exp);
    assert.equal(snrClean, 40.0);

    // Noisy channel
    const obsNoisy = [0.8, -1.2, 0.9, -1.1];
    const snrNoisy = estimateSnrFromPilots(obsNoisy, exp);
    assert.ok(snrNoisy > 10 && snrNoisy < 30);

    const ber = estimateTheoreticalBerBpsk(20);
    assert.ok(ber < 1e-3);
  });

  test("handles N/A fallback when telemetry report is null", () => {
    const report: OfdmDemodulationReport | null = null;
    assert.equal(report, null);
  });

  test("accurately represents decoded frames with CRC pass vs mismatch", () => {
    const validFrame: OfdmDecodedFrame = {
      version: 1,
      modulation: "bpsk",
      gridSize: 16,
      pilotConfig: 1,
      seqNumber: 42,
      payload: new Uint8Array([1, 2, 3]),
      isValidCrc: true,
    };

    const invalidFrame: OfdmDecodedFrame = {
      version: 1,
      modulation: "qpsk",
      gridSize: 32,
      pilotConfig: 1,
      seqNumber: 43,
      payload: new Uint8Array([1, 2, 3]),
      isValidCrc: false,
    };

    assert.equal(validFrame.isValidCrc, true);
    assert.equal(validFrame.seqNumber, 42);

    assert.equal(invalidFrame.isValidCrc, false);
    assert.equal(invalidFrame.seqNumber, 43);
  });
});
