/**
 * Statistical Confidence & Dispersion Module (Milestone 7B)
 *
 * Implements:
 * - Deterministic sample statistics: Mean, Median, Variance, Standard Deviation
 * - 95% Confidence Interval computation (Student's t / normal distribution approximation)
 * - Sample count validation and ConfidenceLevel classification
 * - Anti-fabrication guarantees: Mathematical determinism only
 *
 * NOTE: For physical optical research analytics.
 */

export const ConfidenceLevel = {
  LOW: "LOW",           // < 3 runs
  MODERATE: "MODERATE", // 3 - 9 runs
  HIGH: "HIGH",         // >= 10 runs
} as const;

export type ConfidenceLevel = (typeof ConfidenceLevel)[keyof typeof ConfidenceLevel];

export interface StatisticalMetricSummary {
  sampleSize: number;
  mean: number;
  median: number;
  variance: number;
  standardDeviation: number;
  confidenceInterval95: {
    lower: number;
    upper: number;
    marginOfError: number;
  } | null;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Classify sample size into statistical confidence levels.
 */
export function getConfidenceLevel(sampleSize: number): ConfidenceLevel {
  if (sampleSize < 3) return ConfidenceLevel.LOW;
  if (sampleSize < 10) return ConfidenceLevel.MODERATE;
  return ConfidenceLevel.HIGH;
}

/**
 * Calculate arithmetic mean of a dataset.
 */
export function calculateMean(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((acc, val) => acc + val, 0);
  return sum / samples.length;
}

/**
 * Calculate median of a dataset.
 */
export function calculateMedian(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate sample variance (Bessel's correction with N - 1 denominator for N > 1).
 */
export function calculateVariance(samples: number[], mean?: number): number {
  if (samples.length <= 1) return 0;
  const avg = mean ?? calculateMean(samples);
  const sumSquaredDiffs = samples.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0);
  return sumSquaredDiffs / (samples.length - 1);
}

/**
 * Calculate sample standard deviation.
 */
export function calculateStandardDeviation(samples: number[], mean?: number): number {
  return Math.sqrt(calculateVariance(samples, mean));
}

// Critical t-values for two-tailed 95% confidence intervals (df = n - 1)
const T_TABLE_95: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  15: 2.131,
  20: 2.086,
  30: 2.042,
};

function getTCritical95(df: number): number {
  if (df <= 0) return 1.96;
  if (T_TABLE_95[df]) return T_TABLE_95[df];
  if (df > 30) return 1.96;
  // Linear interpolation between known points
  const keys = Object.keys(T_TABLE_95).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const lower = T_TABLE_95[keys[i]];
      const upper = T_TABLE_95[keys[i + 1]];
      const fraction = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return lower + fraction * (upper - lower);
    }
  }
  return 1.96;
}

/**
 * Calculate 95% Confidence Interval for a sample array.
 */
export function calculateConfidenceInterval95(
  samples: number[],
  mean?: number,
  stdDev?: number
): { lower: number; upper: number; marginOfError: number } | null {
  const n = samples.length;
  if (n < 2) return null;

  const avg = mean ?? calculateMean(samples);
  const s = stdDev ?? calculateStandardDeviation(samples, avg);

  const df = n - 1;
  const t = getTCritical95(df);
  const standardError = s / Math.sqrt(n);
  const marginOfError = t * standardError;

  return {
    lower: Math.round((avg - marginOfError) * 100) / 100,
    upper: Math.round((avg + marginOfError) * 100) / 100,
    marginOfError: Math.round(marginOfError * 100) / 100,
  };
}

/**
 * Compute complete statistical summary for a metric dataset.
 */
export function computeStatisticalSummary(samples: number[]): StatisticalMetricSummary {
  const n = samples.length;
  const mean = calculateMean(samples);
  const median = calculateMedian(samples);
  const variance = calculateVariance(samples, mean);
  const standardDeviation = calculateStandardDeviation(samples, mean);
  const confidenceInterval95 = calculateConfidenceInterval95(samples, mean, standardDeviation);
  const confidenceLevel = getConfidenceLevel(n);

  return {
    sampleSize: n,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    standardDeviation: Math.round(standardDeviation * 100) / 100,
    confidenceInterval95,
    confidenceLevel,
  };
}
