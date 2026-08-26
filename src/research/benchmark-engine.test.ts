import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../core/transport";
import {
  benchmarkQrStreaming,
  benchmarkVlcModulation,
  benchmarkOfdmConfiguration,
  runFullBenchmarkSuite,
  BENCHMARK_CONFIGS,
} from "./benchmark-engine";
import {
  generateBenchmarkRankings,
  generateBenchmarkJsonArtifact,
  generateBenchmarkCsv,
  generateBenchmarkMarkdownReport,
} from "./benchmark-report-generator";

describe("End-to-End Optical Benchmark Engine Unit Tests (Milestone 8B)", () => {
  const samplePayload = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    samplePayload[i] = (i * 17 + 5) % 256;
  }

  test("defines exactly 14 optical benchmark target configurations", () => {
    assert.equal(BENCHMARK_CONFIGS.length, 14);
    assert.equal(BENCHMARK_CONFIGS[0].transport, TransportId.QR);
    assert.equal(BENCHMARK_CONFIGS.filter((c) => c.transport === TransportId.VLC).length, 4);
    assert.equal(BENCHMARK_CONFIGS.filter((c) => c.transport === TransportId.VisualOFDM).length, 9);
  });

  test("executes QR Streaming benchmark with bit-perfect SHA-256 and fountain overhead calculation", async () => {
    const metrics = await benchmarkQrStreaming(samplePayload, 64);
    assert.equal(metrics.crcPassed, true);
    assert.equal(metrics.sha256Matched, true);
    assert.equal(metrics.expectedSha256, metrics.actualSha256);
    assert.ok(metrics.throughputKbps > 0);
    assert.ok(metrics.fountainOverheadPct !== null);
    assert.ok(metrics.recoveryPerformance !== null);
  });

  test("executes VLC OOK and 4-PAM modulation benchmarks with CRC pass", async () => {
    const ookMetrics = await benchmarkVlcModulation(samplePayload.slice(0, 128), "ook");
    assert.equal(ookMetrics.crcPassed, true);
    assert.equal(ookMetrics.sha256Matched, true);
    assert.ok(ookMetrics.throughputKbps > 0);

    const pamMetrics = await benchmarkVlcModulation(samplePayload.slice(0, 128), "pam4");
    assert.equal(pamMetrics.crcPassed, true);
    assert.equal(pamMetrics.sha256Matched, true);
  });

  test("executes VLC CSK-8 and CSK-16 color shift keying modulation benchmarks", async () => {
    const csk8Metrics = await benchmarkVlcModulation(samplePayload.slice(0, 64), "csk8");
    assert.equal(csk8Metrics.crcPassed, true);
    assert.equal(csk8Metrics.sha256Matched, true);

    const csk16Metrics = await benchmarkVlcModulation(samplePayload.slice(0, 64), "csk16");
    assert.equal(csk16Metrics.crcPassed, true);
    assert.equal(csk16Metrics.sha256Matched, true);
  });

  test("executes Visual OFDM BPSK, QPSK, and 16-QAM benchmarks across frequency grids", async () => {
    const bpskMetrics = await benchmarkOfdmConfiguration(samplePayload.slice(0, 16), "bpsk", 16);
    assert.equal(bpskMetrics.crcPassed, true);
    assert.equal(bpskMetrics.sha256Matched, true);

    const qpskMetrics = await benchmarkOfdmConfiguration(samplePayload.slice(0, 32), "qpsk", 16);
    assert.equal(qpskMetrics.crcPassed, true);
    assert.equal(qpskMetrics.sha256Matched, true);

    const qamMetrics = await benchmarkOfdmConfiguration(samplePayload.slice(0, 64), "16qam", 16);
    assert.equal(qamMetrics.crcPassed, true);
    assert.equal(qamMetrics.sha256Matched, true);
  });

  test("executes runFullBenchmarkSuite across all 14 configurations and generates artifacts", async () => {
    const suite = await runFullBenchmarkSuite(256);
    assert.equal(suite.results.length, 14);
    assert.equal(suite.summary.totalConfigsTested, 14);
    assert.equal(suite.summary.passedConfigsCount, 14);
    assert.equal(suite.summary.overallSha256MatchRate, 1.0);

    const rankings = generateBenchmarkRankings(suite);
    assert.equal(rankings.highestThroughput.length, 14);
    assert.equal(rankings.lowestLatency.length, 14);
    assert.equal(rankings.lowestCpuCost.length, 14);

    const json = generateBenchmarkJsonArtifact(suite);
    assert.ok(json.includes("benchmarkSuiteId"));
    assert.ok(json.includes("summary"));

    const csv = generateBenchmarkCsv(suite);
    assert.ok(csv.includes("ConfigId,Transport,Modulation"));
    assert.ok(csv.includes("qr-baseline"));

    const md = generateBenchmarkMarkdownReport(suite);
    assert.ok(md.includes("Complete Optical Transport Performance Matrix"));
    assert.ok(md.includes("Comparative Rankings"));
  });
});
