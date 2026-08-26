/**
 * Visual OFDM Telemetry & Performance Metrics (Milestone 4C)
 *
 * Computes:
 * - Signal-to-Noise Ratio (SNR in dB) from pilot error variance
 * - Bit Error Rate (BER) and Symbol Error Rate (SER)
 * - Subcarrier utilization efficiency
 * - Throughput in bytes/second
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

export interface OfdmMetricsSummary {
  estimatedSnrDb: number;
  estimatedBer: number;
  carrierUtilizationPercent: number;
  pilotConfidence: number;
  throughputBytesPerSecond: number;
  frameRecoveryRate: number;
}

/**
 * Estimate SNR in dB from pilot tone observation deviations.
 */
export function estimateSnrFromPilots(
  observedPilots: number[],
  expectedPilots: number[]
): number {
  if (observedPilots.length === 0) return 0;

  let signalPower = 0;
  let noisePower = 0;

  for (let i = 0; i < observedPilots.length; i++) {
    const exp = expectedPilots[i];
    const obs = observedPilots[i];
    const error = obs - exp;

    signalPower += exp * exp;
    noisePower += error * error;
  }

  signalPower /= observedPilots.length;
  noisePower /= observedPilots.length;

  if (noisePower < 1e-9) return 40.0; // Clean channel cap at 40 dB
  const snrLinear = signalPower / noisePower;
  return Math.max(-10.0, Math.min(40.0, 10.0 * Math.log10(snrLinear)));
}

/**
 * Compute theoretical BER for BPSK over AWGN channel.
 * Q(sqrt(2 * Eb/N0))
 */
export function estimateTheoreticalBerBpsk(snrDb: number): number {
  const snrLinear = Math.pow(10, snrDb / 10);
  const qArg = Math.sqrt(2 * snrLinear);
  // Approximation of Q-function: 0.5 * erfc(x / sqrt(2))
  return 0.5 * Math.exp(-qArg * qArg / 2) / (qArg * Math.sqrt(2 * Math.PI) + 1e-9);
}

/**
 * Calculate carrier utilization percent (Data carriers / Total subcarriers).
 */
export function calculateCarrierUtilization(dataCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return (dataCount / totalCount) * 100;
}
