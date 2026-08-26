import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSoftwareConfidence,
  SoftwareConfidenceLevel,
} from "./software-confidence";

describe("Software Verification Confidence Engine Unit Tests (Milestone 8A)", () => {
  test("evaluates empty sample as LOW confidence", () => {
    const profile = evaluateSoftwareConfidence(0, 0, []);
    assert.equal(profile.level, SoftwareConfidenceLevel.LOW);
    assert.equal(profile.confidenceScore, 0);
    assert.equal(profile.sampleSize, 0);
  });

  test("evaluates N=5 with 100% success rate as MODERATE confidence", () => {
    const throughputs = [100, 102, 98, 101, 100];
    const profile = evaluateSoftwareConfidence(5, 5, throughputs, 100);
    assert.equal(profile.level, SoftwareConfidenceLevel.MODERATE);
    assert.ok(profile.confidenceScore >= 60);
  });

  test("evaluates N=15 with 100% success rate as HIGH confidence", () => {
    const throughputs = Array(15).fill(100);
    const profile = evaluateSoftwareConfidence(15, 15, throughputs, 95);
    assert.equal(profile.level, SoftwareConfidenceLevel.HIGH);
    assert.ok(profile.confidenceScore >= 80);
  });

  test("evaluates N=35 with 100% success rate as VERY_HIGH confidence", () => {
    const throughputs = Array(35).fill(100);
    const profile = evaluateSoftwareConfidence(35, 35, throughputs, 100);
    assert.equal(profile.level, SoftwareConfidenceLevel.VERY_HIGH);
    assert.ok(profile.confidenceScore >= 95);
  });
});
