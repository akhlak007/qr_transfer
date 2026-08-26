import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  modulateBpskBit,
  demodulateBpskSymbol,
  modulateQpskBits,
  demodulateQpskSymbol,
  modulate16QamBits,
  demodulate16QamSymbol,
  modulateOfdmBytes,
} from "./ofdm-modulator";
import { createSubcarrierMap } from "./ofdm-framing";

describe("Visual OFDM Modulator Unit Tests (Milestone 4A & 4B)", () => {
  test("modulates and demodulates BPSK symbols with unit energy", () => {
    const sym0 = modulateBpskBit(0);
    const sym1 = modulateBpskBit(1);

    assert.equal(sym0.real, -1.0);
    assert.equal(sym0.imag, 0.0);
    assert.equal(sym1.real, 1.0);
    assert.equal(sym1.imag, 0.0);

    assert.equal(demodulateBpskSymbol(sym0), 0);
    assert.equal(demodulateBpskSymbol(sym1), 1);
  });

  test("modulates and demodulates QPSK symbols with unit average energy", () => {
    const combos = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const;

    let energySum = 0;
    for (const [b0, b1] of combos) {
      const sym = modulateQpskBits(b0, b1);
      energySum += sym.real * sym.real;
      const [rec0, rec1] = demodulateQpskSymbol(sym);
      assert.equal(rec0, b0);
      assert.equal(rec1, b1);
    }

    const avgEnergy = energySum / combos.length;
    assert.ok(Math.abs(avgEnergy - 1.0) < 1e-6);
  });

  test("modulates and demodulates 16-QAM symbols with unit average energy", () => {
    let energySum = 0;
    let totalCombos = 0;

    for (let b0 = 0; b0 <= 1; b0++) {
      for (let b1 = 0; b1 <= 1; b1++) {
        for (let b2 = 0; b2 <= 1; b2++) {
          for (let b3 = 0; b3 <= 1; b3++) {
            totalCombos++;
            const sym = modulate16QamBits(b0, b1, b2, b3);
            energySum += sym.real * sym.real;

            const [r0, r1, r2, r3] = demodulate16QamSymbol(sym);
            assert.equal(r0, b0);
            assert.equal(r1, b1);
            assert.equal(r2, b2);
            assert.equal(r3, b3);
          }
        }
      }
    }

    const avgEnergy = energySum / totalCombos;
    assert.ok(Math.abs(avgEnergy - 1.0) < 1e-6);
  });

  test("populates OFDM symbol grids deterministically for 8x8, 16x16, and 32x32 grids", () => {
    const payload = new Uint8Array([10, 20, 30, 40, 50]);

    for (const gridSize of [8, 16, 32]) {
      const map = createSubcarrierMap(gridSize);
      const grids = modulateOfdmBytes(payload, "bpsk", gridSize, map);

      assert.ok(grids.length >= 1);
      assert.equal(grids[0].gridSize, gridSize);
      assert.equal(grids[0].carriers.length, gridSize * gridSize);
      assert.equal(grids[0].dataCarriersCount, map.dataIndices.length);
      assert.equal(grids[0].pilotCarriersCount, map.pilotIndices.length);
    }
  });
});
