/**
 * Research Archival Storage & Versioning Manager (Milestone 7D)
 *
 * Implements:
 * - Immutable long-term archival of research datasets, publications, reports, and benchmarks
 * - SHA-256 integrity verification across stored archival records
 * - Versioned archival manifests with deterministic provenance tracking
 *
 * NOTE: For archival research governance only.
 */

import { sha256Hex } from "../core/integrity";

export const ArchiveEntryKind = {
  DATASET: "dataset",
  PUBLICATION: "publication",
  REPRODUCIBILITY_REPORT: "reproducibility_report",
  BENCHMARK_BUNDLE: "benchmark_bundle",
} as const;

export type ArchiveEntryKind = (typeof ArchiveEntryKind)[keyof typeof ArchiveEntryKind];

export interface ArchiveEntry {
  archiveId: string;
  version: string;
  title: string;
  createdAt: number;
  archiveKind: ArchiveEntryKind;
  itemCount: number;
  sizeBytes: number;
  checksumSha256: string;
  payloadJson: string;
}

export interface ArchiveManifest {
  manifestVersion: number;
  exportedAt: string;
  totalArchivesCount: number;
  totalSizeBytes: number;
  archives: Omit<ArchiveEntry, "payloadJson">[];
}

/**
 * Create an immutable archive entry with cryptographic SHA-256 checksum.
 */
export async function createArchiveEntry(
  title: string,
  kind: ArchiveEntryKind,
  payload: any,
  version = "1.0.0",
  itemCount = 1
): Promise<ArchiveEntry> {
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const buffer = new TextEncoder().encode(payloadJson);
  const checksumSha256 = await sha256Hex(buffer);
  const archiveId = `arch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    archiveId,
    version,
    title,
    createdAt: Date.now(),
    archiveKind: kind,
    itemCount,
    sizeBytes: buffer.byteLength,
    checksumSha256,
    payloadJson,
  };
}

/**
 * Verify cryptographic checksum integrity of an archive entry.
 */
export async function verifyArchiveEntryIntegrity(entry: ArchiveEntry): Promise<boolean> {
  const buffer = new TextEncoder().encode(entry.payloadJson);
  const calculated = await sha256Hex(buffer);
  return calculated === entry.checksumSha256;
}

/**
 * Export a versioned master archive manifest summarizing all archived entries.
 */
export function exportArchiveManifest(entries: ArchiveEntry[]): string {
  const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  const sanitized = entries.map(({ payloadJson: _payloadJson, ...meta }) => meta);

  const manifest: ArchiveManifest = {
    manifestVersion: 1,
    exportedAt: new Date().toISOString(),
    totalArchivesCount: entries.length,
    totalSizeBytes,
    archives: sanitized,
  };

  return JSON.stringify(manifest, null, 2);
}
