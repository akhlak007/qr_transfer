/**
 * Visual OFDM Optical Calibration Engine (Milestone 4B & 4C)
 *
 * Estimates:
 * - Baseline luminance (ambient DC level)
 * - Channel gain & optical dynamic range
 * - Spatial quality and uniformity
 * - Pilot tone RMS error
 * - Usable carrier count and confidence score
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

export interface OfdmCalibrationResult {
  confidence: number; // 0.0 to 1.0
  baselineLuminance: number;
  channelGain: number;
  spatialQuality: number; // 0.0 to 1.0
  pilotError: number; // RMS pilot error
  usableCarriers: number;
  totalCarriers: number;
}

export class OfdmCalibrationEngine {
  /**
   * Calibrate and assess the spatial optical pattern before or during demodulation.
   */
  calibrateSpatialGrid(
    spatialLuminance: Float64Array | number[],
    gridSize: number,
    expectedPilots?: { index: number; expectedValue: number }[]
  ): OfdmCalibrationResult {
    const totalCarriers = gridSize * gridSize;
    if (spatialLuminance.length < totalCarriers) {
      return {
        confidence: 0,
        baselineLuminance: 0,
        channelGain: 0,
        spatialQuality: 0,
        pilotError: 1.0,
        usableCarriers: 0,
        totalCarriers,
      };
    }

    // 1. Compute Mean Baseline Luminance
    let sum = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < totalCarriers; i++) {
      const val = spatialLuminance[i];
      sum += val;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
    const baselineLuminance = sum / totalCarriers;

    // 2. Dynamic Range & Spatial Contrast Quality
    const dynamicRange = Math.max(0, maxVal - minVal);
    const spatialQuality = Math.min(1.0, dynamicRange / 128.0);

    // 3. Pilot Tone Quality / RMS Error
    let pilotRmsError = 0;
    let pilotConfidence = 1.0;

    if (expectedPilots && expectedPilots.length > 0) {
      let sumSqErr = 0;
      for (const p of expectedPilots) {
        const obs = spatialLuminance[p.index];
        const err = obs - p.expectedValue;
        sumSqErr += err * err;
      }
      pilotRmsError = Math.sqrt(sumSqErr / expectedPilots.length);
      pilotConfidence = Math.max(0, 1.0 - pilotRmsError / 100.0);
    }

    // 4. Composite Confidence Score
    const confidence = Math.max(0, Math.min(1.0, spatialQuality * 0.5 + pilotConfidence * 0.5));
    const usableCarriers = spatialQuality > 0.1 ? totalCarriers : 0;

    return {
      confidence,
      baselineLuminance,
      channelGain: Math.max(0.01, dynamicRange / 200.0),
      spatialQuality,
      pilotError: pilotRmsError,
      usableCarriers,
      totalCarriers,
    };
  }
}
