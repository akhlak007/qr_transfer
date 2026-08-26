/**
 * End-to-End Optical Benchmark Engine (Milestone 8B)
 *
 * Implements:
 * - Deterministic end-to-end benchmarking across all 14 optical transport configurations:
 *   1. QR Streaming (Fountain LT code)
 *   2. VLC OOK
 *   3. VLC 4-PAM
 *   4. VLC CSK-8
 *   5. VLC CSK-16
 *   6-14. Visual OFDM (BPSK, QPSK, 16-QAM across 8x8, 16x16, 32x32 grids)
 * - Fine-grained performance profiling:
 *   - Throughput (bps, KB/s)
 *   - Latency / Total duration (ms)
 *   - Encode time (ms)
 *   - Decode time (ms)
 *   - CPU cost (ms)
 *   - Memory usage estimation (bytes, KB)
 *   - CRC validation pass rate (0.0 to 1.0)
 *   - SHA-256 bit-perfect integrity match rate (0.0 to 1.0)
 *   - Fountain overhead ratio (%)
 *   - Recovery performance
 *
 * NOTE: Operates on genuine software transmission & modulation pipelines.
 */

import { TransportId } from "../core/transport";
import { sha256Hex } from "../core/integrity";
import { FountainEncoder, FountainDecoder } from "../modules/fountain";
import {
  encodeVlcFrame,
  type VlcModulationScheme,
} from "../transports/vlc/vlc-framing";
import {
  modulateVlcFrame,
  CSK8_CONSTELLATION,
  CSK16_CONSTELLATION,
} from "../transports/vlc/vlc-modulator";
import { VlcDemodulator } from "../transports/vlc/vlc-demodulator";
import type { CalibrationResult } from "../transports/vlc/vlc-calibration";
import {
  encodeOfdmFrame,
  decodeOfdmFrame,
  createSubcarrierMap,
  type OfdmModulationScheme,
} from "../transports/ofdm/ofdm-framing";
import {
  modulateOfdmBytes,
  demodulateBpskSymbol,
  demodulate16QamSymbol,
  type ComplexSymbol,
} from "../transports/ofdm/ofdm-modulator";
import { idct2D, dct2D } from "../transports/ofdm/ofdm-fft";
import { estimateAndEqualizeChannel } from "../transports/ofdm/ofdm-sync";

export interface BenchmarkTargetConfig {
  configId: string;
  transport: TransportId;
  transportLabel: string;
  modulation: string;
  gridSize?: number;
  description: string;
}

export const BENCHMARK_CONFIGS: BenchmarkTargetConfig[] = [
  // 1. QR Streaming Reference Baseline
  {
    configId: "qr-baseline",
    transport: TransportId.QR,
    transportLabel: "QR Streaming",
    modulation: "Fountain 2D Matrix",
    description: "Luby Transform Rateless Fountain Coding over 2D Matrix Codes",
  },
  // 2-5. Visible Light Communication (VLC)
  {
    configId: "vlc-ook",
    transport: TransportId.VLC,
    transportLabel: "VLC",
    modulation: "OOK",
    description: "On-Off Keying Intensity Modulation (1 bit/symbol)",
  },
  {
    configId: "vlc-pam4",
    transport: TransportId.VLC,
    transportLabel: "VLC",
    modulation: "4-PAM",
    description: "4-Level Pulse Amplitude Modulation (2 bits/symbol)",
  },
  {
    configId: "vlc-csk8",
    transport: TransportId.VLC,
    transportLabel: "VLC",
    modulation: "CSK-8",
    description: "8-Color Shift Keying Chromaticity Modulation (3 bits/symbol)",
  },
  {
    configId: "vlc-csk16",
    transport: TransportId.VLC,
    transportLabel: "VLC",
    modulation: "CSK-16",
    description: "16-Color Shift Keying Chromaticity Modulation (4 bits/symbol)",
  },
  // 6-14. Visual OFDM (Spatial Frequency Grids)
  {
    configId: "ofdm-bpsk-8",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "BPSK",
    gridSize: 8,
    description: "8×8 2D-DCT Subcarrier Grid (BPSK, 1 bit/subcarrier)",
  },
  {
    configId: "ofdm-bpsk-16",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "BPSK",
    gridSize: 16,
    description: "16×16 2D-DCT Subcarrier Grid (BPSK, 1 bit/subcarrier)",
  },
  {
    configId: "ofdm-bpsk-32",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "BPSK",
    gridSize: 32,
    description: "32×32 2D-DCT Subcarrier Grid (BPSK, 1 bit/subcarrier)",
  },
  {
    configId: "ofdm-qpsk-8",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "QPSK",
    gridSize: 8,
    description: "8×8 2D-DCT Subcarrier Grid (QPSK, 2 bits/subcarrier)",
  },
  {
    configId: "ofdm-qpsk-16",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "QPSK",
    gridSize: 16,
    description: "16×16 2D-DCT Subcarrier Grid (QPSK, 2 bits/subcarrier)",
  },
  {
    configId: "ofdm-qpsk-32",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "QPSK",
    gridSize: 32,
    description: "32×32 2D-DCT Subcarrier Grid (QPSK, 2 bits/subcarrier)",
  },
  {
    configId: "ofdm-16qam-8",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "16-QAM",
    gridSize: 8,
    description: "8×8 2D-DCT Subcarrier Grid (16-QAM, 4 bits/subcarrier)",
  },
  {
    configId: "ofdm-16qam-16",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "16-QAM",
    gridSize: 16,
    description: "16×16 2D-DCT Subcarrier Grid (16-QAM, 4 bits/subcarrier)",
  },
  {
    configId: "ofdm-16qam-32",
    transport: TransportId.VisualOFDM,
    transportLabel: "Visual OFDM",
    modulation: "16-QAM",
    gridSize: 32,
    description: "32×32 2D-DCT Subcarrier Grid (16-QAM, 4 bits/subcarrier)",
  },
];

export interface BenchmarkMetrics {
  payloadSizeBytes: number;
  totalDurationMs: number;
  encodeTimeMs: number;
  decodeTimeMs: number;
  cpuCostMs: number;
  estimatedMemoryBytes: number;
  throughputBps: number;
  throughputKbps: number;
  crcPassed: boolean;
  sha256Matched: boolean;
  expectedSha256: string;
  actualSha256: string;
  fountainOverheadPct: number | null;
  recoveryPerformance: {
    symbolsRequired?: number;
    sourceBlocks?: number;
    overheadRatio?: number;
  } | null;
}

export interface SingleBenchmarkResult {
  config: BenchmarkTargetConfig;
  success: boolean;
  metrics: BenchmarkMetrics;
  timestamp: number;
}

export interface EndToEndBenchmarkSuiteResult {
  suiteId: string;
  executedAt: number;
  payloadSize: number;
  results: SingleBenchmarkResult[];
  summary: {
    totalConfigsTested: number;
    passedConfigsCount: number;
    failedConfigsCount: number;
    averageThroughputKbps: number;
    maxThroughputKbps: number;
    bestThroughputConfigId: string;
    averageLatencyMs: number;
    overallCrcPassRate: number;
    overallSha256MatchRate: number;
  };
}

function reassembleFountainBytes(blocks: Uint8Array[], totalLength: number, blockSize: number): Uint8Array {
  const result = new Uint8Array(totalLength);
  for (let i = 0; i < blocks.length; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalLength);
    result.set(blocks[i].slice(0, end - start), start);
  }
  return result;
}

/**
 * Execute an end-to-end benchmark for QR Streaming using Luby Transform fountain coding.
 */
export async function benchmarkQrStreaming(
  payloadBytes: Uint8Array,
  blockSize = 256
): Promise<BenchmarkMetrics> {
  const expectedSha256 = await sha256Hex(payloadBytes);
  const totalBlocks = Math.ceil(payloadBytes.length / blockSize);

  const t0 = performance.now();

  // Encode
  const tEncStart = performance.now();
  const blocks: Uint8Array[] = [];
  for (let i = 0; i < payloadBytes.length; i += blockSize) {
    const slice = payloadBytes.subarray(i, i + blockSize);
    const block = new Uint8Array(blockSize);
    block.set(slice);
    blocks.push(block);
  }
  const encoder = new FountainEncoder(blocks, blockSize);
  const symbols: any[] = [];
  const maxSymbols = Math.max(totalBlocks * 6, 250);
  for (let i = 0; i < maxSymbols; i++) {
    symbols.push(encoder.generateSymbol());
  }
  const encodeTimeMs = performance.now() - tEncStart;

  // Decode
  const tDecStart = performance.now();
  const decoder = new FountainDecoder(totalBlocks, blockSize);
  let processedCount = 0;
  for (const sym of symbols) {
    decoder.processSymbol(sym);
    processedCount++;
    if (decoder.isDone()) break;
  }
  const resolved = decoder.getResolvedBlocks();
  const reconstructed = reassembleFountainBytes(resolved, payloadBytes.length, blockSize);
  const decodeTimeMs = performance.now() - tDecStart;

  const totalDurationMs = performance.now() - t0;
  const actualSha256 = await sha256Hex(reconstructed);

  const sha256Matched = expectedSha256 === actualSha256;
  const crcPassed = sha256Matched;

  const throughputBps = totalDurationMs > 0 ? (payloadBytes.length * 8 * 1000) / totalDurationMs : 0;
  const throughputKbps = throughputBps / 1000.0;
  const overheadRatio = processedCount / totalBlocks;
  const fountainOverheadPct = Math.round((overheadRatio - 1.0) * 1000) / 10;

  return {
    payloadSizeBytes: payloadBytes.length,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    encodeTimeMs: Math.round(encodeTimeMs * 100) / 100,
    decodeTimeMs: Math.round(decodeTimeMs * 100) / 100,
    cpuCostMs: Math.round((encodeTimeMs + decodeTimeMs) * 100) / 100,
    estimatedMemoryBytes: payloadBytes.length * 3,
    throughputBps: Math.round(throughputBps),
    throughputKbps: Math.round(throughputKbps * 10) / 10,
    crcPassed,
    sha256Matched,
    expectedSha256,
    actualSha256,
    fountainOverheadPct,
    recoveryPerformance: {
      symbolsRequired: processedCount,
      sourceBlocks: totalBlocks,
      overheadRatio: Math.round(overheadRatio * 100) / 100,
    },
  };
}

/**
 * Execute an end-to-end benchmark for a VLC modulation scheme.
 */
export async function benchmarkVlcModulation(
  payloadBytes: Uint8Array,
  scheme: VlcModulationScheme
): Promise<BenchmarkMetrics> {
  const expectedSha256 = await sha256Hex(payloadBytes);

  const t0 = performance.now();

  // Encode & Modulate
  const tEncStart = performance.now();
  const frameBytes = encodeVlcFrame({
    version: 1,
    modulation: scheme,
    seqNumber: 0,
    payload: payloadBytes,
  });
  const modulated = modulateVlcFrame(frameBytes, scheme);
  const encodeTimeMs = performance.now() - tEncStart;

  // Convert modulated stream to optical samples
  const samples = modulated.colors.map((c, idx) => ({
    rgb: c,
    luminance: modulated.levels[idx],
  }));

  // Decode & Demodulate
  const tDecStart = performance.now();
  const calibration: CalibrationResult = {
    isCalibrated: true,
    ambientLuminance: 10,
    whiteLevel: 255,
    blackLevel: 0,
    dynamicRange: 255,
    isExposureStable: true,
    adaptiveThreshold: 128,
    pam4Thresholds: [42, 128, 212],
    calibratedPalette8: CSK8_CONSTELLATION,
    calibratedPalette16: CSK16_CONSTELLATION,
    confidenceScore: 1.0,
  };

  const demodulator = new VlcDemodulator(calibration);
  const report = demodulator.demodulateWithReport(samples, scheme);
  const decodeTimeMs = performance.now() - tDecStart;
  const totalDurationMs = performance.now() - t0;

  const actualSha256 = report.frame?.isValidCrc && report.frame.payload ? await sha256Hex(report.frame.payload) : "0".repeat(64);
  const sha256Matched = expectedSha256 === actualSha256;
  const crcPassed = report.status === "success" && !!report.frame?.isValidCrc;

  const throughputBps = totalDurationMs > 0 ? (payloadBytes.length * 8 * 1000) / totalDurationMs : 0;
  const throughputKbps = throughputBps / 1000.0;

  return {
    payloadSizeBytes: payloadBytes.length,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    encodeTimeMs: Math.round(encodeTimeMs * 100) / 100,
    decodeTimeMs: Math.round(decodeTimeMs * 100) / 100,
    cpuCostMs: Math.round((encodeTimeMs + decodeTimeMs) * 100) / 100,
    estimatedMemoryBytes: modulated.levels.length * 8,
    throughputBps: Math.round(throughputBps),
    throughputKbps: Math.round(throughputKbps * 10) / 10,
    crcPassed,
    sha256Matched,
    expectedSha256,
    actualSha256,
    fountainOverheadPct: null,
    recoveryPerformance: null,
  };
}

const QPSK_THRESH_LOW = -0.8944271909999159;
const QPSK_THRESH_HIGH = 0.8944271909999159;

/**
 * Execute an end-to-end benchmark for a Visual OFDM configuration with full multi-grid support.
 */
export async function benchmarkOfdmConfiguration(
  payloadBytes: Uint8Array,
  scheme: OfdmModulationScheme,
  gridSize: number
): Promise<BenchmarkMetrics> {
  const expectedSha256 = await sha256Hex(payloadBytes);

  const t0 = performance.now();

  // 1. Encode & Frequency Modulation
  const tEncStart = performance.now();
  const frameBytes = encodeOfdmFrame({
    version: 1,
    modulation: scheme,
    gridSize,
    pilotConfig: 1,
    seqNumber: 0,
    payload: payloadBytes,
  });
  const gridMap = createSubcarrierMap(gridSize);
  const grids = modulateOfdmBytes(frameBytes, scheme, gridSize, gridMap);
  const encodeTimeMs = performance.now() - tEncStart;

  // 2. Receive & Multi-Grid Frequency Demodulation
  const tDecStart = performance.now();
  const allBits: number[] = [];

  for (let g = 0; g < grids.length; g++) {
    const freqMatrix = new Float64Array(gridSize * gridSize);
    for (let i = 0; i < freqMatrix.length; i++) {
      freqMatrix[i] = grids[g].carriers[i].real;
    }
    const spatial = idct2D(freqMatrix, gridSize);

    // Forward 2D-DCT & Equalization
    const N = gridSize;
    let sumZ = 0;
    for (let i = 0; i < N * N; i++) sumZ += spatial[i];
    const mean = sumZ / (N * N);
    const normalized = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) normalized[i] = spatial[i] - mean;
    const freqGrid = dct2D(normalized, N);

    const recSymbols: ComplexSymbol[] = new Array(N * N);
    for (let i = 0; i < N * N; i++) recSymbols[i] = { real: freqGrid[i], imag: 0.0 };
    const equalized = estimateAndEqualizeChannel(recSymbols, gridMap);

    for (const dIdx of gridMap.dataIndices) {
      const sym = equalized.carriers[dIdx];
      if (scheme === "16qam") {
        const [b0, b1, b2, b3] = demodulate16QamSymbol(sym);
        allBits.push(b0, b1, b2, b3);
      } else if (scheme === "qpsk") {
        const r = sym.real;
        if (r < QPSK_THRESH_LOW) allBits.push(0, 0);
        else if (r < 0) allBits.push(0, 1);
        else if (r < QPSK_THRESH_HIGH) allBits.push(1, 0);
        else allBits.push(1, 1);
      } else {
        allBits.push(demodulateBpskSymbol(sym));
      }
    }
  }

  // Pack reconstructed bits into frame bytes
  const numBytes = Math.floor(allBits.length / 8);
  const recoveredFrameBytes = new Uint8Array(numBytes);
  for (let b = 0; b < numBytes; b++) {
    let byteVal = 0;
    for (let bit = 0; bit < 8; bit++) {
      byteVal = (byteVal << 1) | allBits[b * 8 + bit];
    }
    recoveredFrameBytes[b] = byteVal;
  }

  const decoded = decodeOfdmFrame(recoveredFrameBytes);
  const decodeTimeMs = performance.now() - tDecStart;
  const totalDurationMs = performance.now() - t0;

  const actualSha256 = decoded && decoded.isValidCrc ? await sha256Hex(decoded.payload) : "0".repeat(64);
  const sha256Matched = expectedSha256 === actualSha256;
  const crcPassed = !!decoded && decoded.isValidCrc;

  const throughputBps = totalDurationMs > 0 ? (payloadBytes.length * 8 * 1000) / totalDurationMs : 0;
  const throughputKbps = throughputBps / 1000.0;

  return {
    payloadSizeBytes: payloadBytes.length,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    encodeTimeMs: Math.round(encodeTimeMs * 100) / 100,
    decodeTimeMs: Math.round(decodeTimeMs * 100) / 100,
    cpuCostMs: Math.round((encodeTimeMs + decodeTimeMs) * 100) / 100,
    estimatedMemoryBytes: gridSize * gridSize * 8 * grids.length,
    throughputBps: Math.round(throughputBps),
    throughputKbps: Math.round(throughputKbps * 10) / 10,
    crcPassed,
    sha256Matched,
    expectedSha256,
    actualSha256,
    fountainOverheadPct: null,
    recoveryPerformance: null,
  };
}

/**
 * Execute full benchmark suite across all 14 optical configurations.
 */
export async function runFullBenchmarkSuite(
  payloadSize = 1024
): Promise<EndToEndBenchmarkSuiteResult> {
  const testPayload = new Uint8Array(payloadSize);
  for (let i = 0; i < payloadSize; i++) {
    testPayload[i] = (i * 37 + 13) % 256;
  }

  const results: SingleBenchmarkResult[] = [];

  for (const cfg of BENCHMARK_CONFIGS) {
    let metrics: BenchmarkMetrics;

    try {
      if (cfg.transport === TransportId.QR) {
        metrics = await benchmarkQrStreaming(testPayload, 128);
      } else if (cfg.transport === TransportId.VLC) {
        let scheme = cfg.modulation.toLowerCase().replace(/[^a-z0-9]/g, "") as VlcModulationScheme;
        if ((scheme as string) === "4pam") scheme = "pam4";
        metrics = await benchmarkVlcModulation(testPayload.slice(0, 128), scheme);
      } else {
        const scheme = cfg.modulation.toLowerCase().replace(/[^a-z0-9]/g, "") as OfdmModulationScheme;
        const gridSize = cfg.gridSize || 16;
        metrics = await benchmarkOfdmConfiguration(testPayload.slice(0, 64), scheme, gridSize);
      }

      results.push({
        config: cfg,
        success: metrics.crcPassed && metrics.sha256Matched,
        metrics,
        timestamp: Date.now(),
      });
    } catch (_err) {
      results.push({
        config: cfg,
        success: false,
        metrics: {
          payloadSizeBytes: payloadSize,
          totalDurationMs: 0,
          encodeTimeMs: 0,
          decodeTimeMs: 0,
          cpuCostMs: 0,
          estimatedMemoryBytes: 0,
          throughputBps: 0,
          throughputKbps: 0,
          crcPassed: false,
          sha256Matched: false,
          expectedSha256: "0".repeat(64),
          actualSha256: "0".repeat(64),
          fountainOverheadPct: null,
          recoveryPerformance: null,
        },
        timestamp: Date.now(),
      });
    }
  }

  const passed = results.filter((r) => r.success);
  const throughputs = passed.map((r) => r.metrics.throughputKbps);
  const latencies = passed.map((r) => r.metrics.totalDurationMs);

  const avgThroughput = throughputs.length > 0 ? throughputs.reduce((a, b) => a + b, 0) / throughputs.length : 0;
  const maxThroughput = throughputs.length > 0 ? Math.max(...throughputs) : 0;
  const bestConfig = passed.find((r) => r.metrics.throughputKbps === maxThroughput)?.config.configId || "qr-baseline";
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  const suiteId = `suite-bench-${Date.now()}`;

  return {
    suiteId,
    executedAt: Date.now(),
    payloadSize,
    results,
    summary: {
      totalConfigsTested: BENCHMARK_CONFIGS.length,
      passedConfigsCount: passed.length,
      failedConfigsCount: results.length - passed.length,
      averageThroughputKbps: Math.round(avgThroughput * 10) / 10,
      maxThroughputKbps: Math.round(maxThroughput * 10) / 10,
      bestThroughputConfigId: bestConfig,
      averageLatencyMs: Math.round(avgLatency * 10) / 10,
      overallCrcPassRate: passed.length / results.length,
      overallSha256MatchRate: passed.length / results.length,
    },
  };
}
