/**
 * Research Dataset Packaging Engine (Milestone 7C)
 *
 * Implements:
 * - Publication-ready dataset bundling with complete provenance metadata
 * - Cryptographic bundle checksum calculation (SHA-256)
 * - Bundling of manifests, physical evidence, benchmark comparisons, and analytics summaries
 * - Strict exclusion of synthetic channel simulations
 *
 * NOTE: For physical optical research datasets only.
 */

import { sha256Hex } from "../core/integrity";
import type { TestRun } from "./test-run";
import {
  deriveManifestFromTestRun,
  type ExperimentManifest,
} from "./experiment-manifest";
import {
  analyzePhysicalEvidence,
  type PhysicalAnalyticsReport,
} from "./physical-analytics";
import {
  comparePhysicalTransportBenchmarks,
  type ComparativeBenchmarkReport,
} from "./benchmark-comparison";

export interface ResearchDatasetBundle {
  schemaVersion: number;
  bundleId: string;
  exportedAt: string;
  softwareVersion: string;
  bundleIntegrityChecksum: string;
  totalPhysicalRuns: number;
  totalVerifiedRuns: number;
  manifests: ExperimentManifest[];
  physicalEvidence: TestRun[];
  benchmarkComparison: ComparativeBenchmarkReport;
  analyticsSummary: PhysicalAnalyticsReport;
}

/**
 * Package all physical experimental records, manifests, benchmarks, and analytics into an immutable bundle.
 */
export async function packageResearchDataset(
  runs: TestRun[],
  explicitManifests?: ExperimentManifest[],
  softwareVersion = "1.0.0"
): Promise<ResearchDatasetBundle> {
  // 1. Strict filter: Physical runs only
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  // 2. Derive manifests if not explicitly provided
  let manifests: ExperimentManifest[];
  if (explicitManifests && explicitManifests.length > 0) {
    manifests = explicitManifests;
  } else {
    manifests = await Promise.all(
      physicalRuns.map((r) => deriveManifestFromTestRun(r, softwareVersion))
    );
  }

  // 3. Generate analytics and comparative benchmarks
  const analyticsSummary = analyzePhysicalEvidence(physicalRuns);
  const benchmarkComparison = comparePhysicalTransportBenchmarks(physicalRuns);

  const bundleId = `dataset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const exportedAt = new Date().toISOString();

  // 4. Compute deterministic bundle checksum over constituent data
  const rawPayloadToHash = JSON.stringify({
    bundleId,
    exportedAt,
    softwareVersion,
    manifests,
    physicalEvidence: physicalRuns,
    benchmarkComparison,
    analyticsSummary,
  });

  const bundleIntegrityChecksum = await sha256Hex(new TextEncoder().encode(rawPayloadToHash));

  return {
    schemaVersion: 1,
    bundleId,
    exportedAt,
    softwareVersion,
    bundleIntegrityChecksum,
    totalPhysicalRuns: physicalRuns.length,
    totalVerifiedRuns: physicalRuns.filter((r) => r.integrityStatus === "verified").length,
    manifests,
    physicalEvidence: physicalRuns,
    benchmarkComparison,
    analyticsSummary,
  };
}

/**
 * Export dataset bundle as formatted JSON string.
 */
export function exportDatasetBundleJson(bundle: ResearchDatasetBundle): string {
  return JSON.stringify(bundle, null, 2);
}
