import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ConfidenceLevel,
  getConfidenceLevel,
  calculateMean,
  calculateMedian,
  calculateVariance,
  calculateStandardDeviation,
  calculateConfidenceInterval95,
  computeStatisticalSummary,
} from "./statistical-confidence";

describe("Statistical Confidence & Dispersion Module Unit Tests (Milestone 7B)", () => {
  test("classifies confidence level according to sample thresholds", () => {
    assert.equal(getConfidenceLevel(0), ConfidenceLevel.LOW);
    assert.equal(getConfidenceLevel(1), ConfidenceLevel.LOW);
    assert.equal(getConfidenceLevel(2), ConfidenceLevel.LOW);
    assert.equal(getConfidenceLevel(3), ConfidenceLevel.MODERATE);
    assert.equal(getConfidenceLevel(7), ConfidenceLevel.MODERATE);
    assert.equal(getConfidenceLevel(9), ConfidenceLevel.MODERATE);
    assert.equal(getConfidenceLevel(10), ConfidenceLevel.HIGH);
    assert.equal(getConfidenceLevel(50), ConfidenceLevel.HIGH);
  });

  test("calculates mean, median, variance, and standard deviation accurately", () => {
    const samples = [10, 20, 30, 40, 50];
    const mean = calculateMean(samples);
    assert.equal(mean, 30);

    const median = calculateMedian(samples);
    assert.equal(median, 30);

    const evenSamples = [10, 20, 30, 40];
    assert.equal(calculateMedian(evenSamples), 25);

    // Sample variance of [10, 20, 30, 40, 50]:
    // diffs^2: 400 + 100 + 0 + 100 + 400 = 1000. 1000 / (5 - 1) = 250
    const variance = calculateVariance(samples, mean);
    assert.equal(variance, 250);

    const stdDev = calculateStandardDeviation(samples, mean);
    assert.equal(Math.round(stdDev * 100) / 100, 15.81);
  });

  test("computes 95% Confidence Interval for sample size >= 2", () => {
    const samples = [100, 102, 98, 101, 99];
    const ci = calculateConfidenceInterval95(samples);
    assert.ok(ci !== null);
    assert.equal(ci.lower < 100, true);
    assert.equal(ci.upper > 100, true);
    assert.equal(typeof ci.marginOfError, "number");

    // Single sample returns null for CI
    assert.equal(calculateConfidenceInterval95([100]), null);
  });

  test("computes full statistical summary object", () => {
    const samples = [25.5, 26.0, 24.8, 25.2];
    const summary = computeStatisticalSummary(samples);

    assert.equal(summary.sampleSize, 4);
    assert.equal(summary.confidenceLevel, ConfidenceLevel.MODERATE);
    assert.ok(summary.mean > 25.0 && summary.mean < 26.0);
    assert.ok(summary.confidenceInterval95 !== null);
  });

  test("handles empty dataset safely without throwing", () => {
    assert.equal(calculateMean([]), 0);
    assert.equal(calculateMedian([]), 0);
    assert.equal(calculateVariance([]), 0);
    assert.equal(calculateStandardDeviation([]), 0);
    assert.equal(calculateConfidenceInterval95([]), null);

    const summary = computeStatisticalSummary([]);
    assert.equal(summary.sampleSize, 0);
    assert.equal(summary.confidenceLevel, ConfidenceLevel.LOW);
  });
});
