import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createArchiveEntry,
  verifyArchiveEntryIntegrity,
  exportArchiveManifest,
  ArchiveEntryKind,
} from "./archive-manager";

describe("Research Archive Manager Unit Tests (Milestone 7D)", () => {
  test("creates archive entry with deterministic SHA-256 checksum and verifies integrity", async () => {
    const payload = { test: "data", count: 42 };
    const entry = await createArchiveEntry("Sample Dataset", ArchiveEntryKind.DATASET, payload, "1.0.0", 42);

    assert.equal(entry.title, "Sample Dataset");
    assert.equal(entry.archiveKind, ArchiveEntryKind.DATASET);
    assert.equal(entry.version, "1.0.0");
    assert.equal(entry.itemCount, 42);
    assert.ok(entry.sizeBytes > 0);
    assert.equal(entry.checksumSha256.length, 64);

    // Verify integrity passes
    const isValid = await verifyArchiveEntryIntegrity(entry);
    assert.equal(isValid, true);
  });

  test("detects payload tampering in archive entry", async () => {
    const entry = await createArchiveEntry("Tamper Test", ArchiveEntryKind.PUBLICATION, { content: "original" });
    entry.payloadJson = JSON.stringify({ content: "tampered" });

    const isValid = await verifyArchiveEntryIntegrity(entry);
    assert.equal(isValid, false);
  });

  test("exports valid master archive manifest", async () => {
    const e1 = await createArchiveEntry("Arch 1", ArchiveEntryKind.DATASET, { a: 1 });
    const e2 = await createArchiveEntry("Arch 2", ArchiveEntryKind.PUBLICATION, { b: 2 });

    const manifestJson = exportArchiveManifest([e1, e2]);
    const parsed = JSON.parse(manifestJson);

    assert.equal(parsed.manifestVersion, 1);
    assert.equal(parsed.totalArchivesCount, 2);
    assert.ok(parsed.totalSizeBytes > 0);
    assert.equal(parsed.archives.length, 2);
  });
});
