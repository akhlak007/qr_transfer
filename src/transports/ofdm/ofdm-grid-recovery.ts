import { dct2D } from "./ofdm-fft";
import { createSubcarrierMap, type OfdmModulationScheme, type SubcarrierGridMap } from "./ofdm-framing";
import {
  demodulate16QamSymbol,
  demodulateBpskSymbol,
  demodulateQpskSymbol,
  type ComplexSymbol,
} from "./ofdm-modulator";
import { estimateAndEqualizeChannel, type OfdmSyncResult } from "./ofdm-sync";
import { estimateSnrFromPilots } from "./ofdm-metrics";

export interface OfdmGridRecoveryResult {
  synchronized: boolean;
  bits: number[];
  symbols: number[];
  sync: OfdmSyncResult;
  estimatedSnrDb: number;
  estimatedBer: number;
  totalCarriers: number;
  activeDataCarriers: number;
  error?: string;
}

function emptySync(totalPilots: number): OfdmSyncResult {
  return {
    synchronized: false,
    confidence: 0,
    channelGain: 0,
    detectedPilots: 0,
    totalPilots,
    pilotBer: 1,
  };
}

export function recoverOfdmGrid(
  spatialLuminance: Float64Array | number[],
  modulation: OfdmModulationScheme,
  gridSize: number,
  map?: SubcarrierGridMap,
): OfdmGridRecoveryResult {
  const gridMap = map ?? createSubcarrierMap(gridSize);
  const requiredSamples = gridSize * gridSize;
  if (spatialLuminance.length < requiredSamples) {
    return {
      synchronized: false,
      bits: [],
      symbols: [],
      sync: emptySync(gridMap.pilotIndices.length),
      estimatedSnrDb: 0,
      estimatedBer: 1,
      totalCarriers: requiredSamples,
      activeDataCarriers: gridMap.dataIndices.length,
      error: `Insufficient spatial samples: ${spatialLuminance.length} < ${requiredSamples}`,
    };
  }

  let sum = 0;
  for (let index = 0; index < requiredSamples; index++) {
    const value = spatialLuminance[index];
    if (!Number.isFinite(value)) {
      return {
        synchronized: false,
        bits: [],
        symbols: [],
        sync: emptySync(gridMap.pilotIndices.length),
        estimatedSnrDb: 0,
        estimatedBer: 1,
        totalCarriers: requiredSamples,
        activeDataCarriers: gridMap.dataIndices.length,
        error: "Spatial grid contains a non-finite sample",
      };
    }
    sum += value;
  }

  const mean = sum / requiredSamples;
  const normalizedSpatial = new Float64Array(requiredSamples);
  for (let index = 0; index < requiredSamples; index++) {
    normalizedSpatial[index] = spatialLuminance[index] - mean;
  }

  const frequencyGrid = dct2D(normalizedSpatial, gridSize);
  const receivedSymbols: ComplexSymbol[] = Array.from(
    frequencyGrid,
    (real) => ({ real, imag: 0 }),
  );
  const equalized = estimateAndEqualizeChannel(receivedSymbols, gridMap);
  const observedPilots = gridMap.pilotIndices.map((index) => equalized.carriers[index].real);
  const expectedPilots = gridMap.pilotIndices.map(
    (index) => gridMap.carriers[index].pilotSign ?? 1,
  );
  const estimatedSnrDb = estimateSnrFromPilots(observedPilots, expectedPilots);

  if (!equalized.sync.synchronized) {
    return {
      synchronized: false,
      bits: [],
      symbols: [],
      sync: equalized.sync,
      estimatedSnrDb,
      estimatedBer: equalized.sync.pilotBer,
      totalCarriers: requiredSamples,
      activeDataCarriers: gridMap.dataIndices.length,
      error: `Pilot synchronization failed at confidence ${equalized.sync.confidence.toFixed(2)}`,
    };
  }

  const bits: number[] = [];
  const symbols: number[] = [];
  for (const carrierIndex of gridMap.dataIndices) {
    const carrier = equalized.carriers[carrierIndex];
    if (modulation === "16qam") {
      const recovered = demodulate16QamSymbol(carrier);
      const symbol = (recovered[0] << 3) | (recovered[1] << 2) | (recovered[2] << 1) | recovered[3];
      symbols.push(symbol);
      bits.push(...recovered);
    } else if (modulation === "qpsk") {
      const recovered = demodulateQpskSymbol(carrier);
      symbols.push((recovered[0] << 1) | recovered[1]);
      bits.push(...recovered);
    } else {
      const bit = demodulateBpskSymbol(carrier);
      symbols.push(bit);
      bits.push(bit);
    }
  }

  return {
    synchronized: true,
    bits,
    symbols,
    sync: equalized.sync,
    estimatedSnrDb,
    estimatedBer: 0,
    totalCarriers: requiredSamples,
    activeDataCarriers: gridMap.dataIndices.length,
  };
}
