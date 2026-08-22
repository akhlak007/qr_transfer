import assert from "node:assert/strict";
import test from "node:test";
import { FileChunkSource } from "./chunk-source";
import { MemoryChunkSink } from "./chunk-sink";
import { MemoryFileSource } from "./file-source";

test("reads file ranges without exposing mutable source storage", async () => {
  const source = new MemoryFileSource(new Uint8Array([1, 2, 3, 4]), "data.bin");
  const range = await source.read(1, 2);
  assert.deepEqual([...range], [2, 3]);
  range[0] = 99;
  assert.deepEqual([...(await source.read(1, 2))], [2, 3]);
});

test("pads fountain blocks while preserving final logical length", async () => {
  const chunks = new FileChunkSource(new MemoryFileSource(new Uint8Array([1, 2, 3, 4, 5])), 4);
  assert.equal(chunks.totalBlocks, 2);
  assert.equal(chunks.logicalLength(1), 1);
  assert.deepEqual([...(await chunks.readBlock(1))], [5, 0, 0, 0]);
});

test("memory chunk sink stores defensive copies and sorted indices", async () => {
  const sink = new MemoryChunkSink();
  const bytes = new Uint8Array([7, 8, 0]);
  await sink.writeBlock(2, bytes, 2);
  await sink.writeBlock(0, new Uint8Array([1, 2, 3]), 3);
  bytes[0] = 99;
  assert.deepEqual(await sink.listBlockIndices(), [0, 2]);
  assert.deepEqual([...(await sink.readBlock(2))!.bytes], [7, 8, 0]);
  assert.equal((await sink.readBlock(2))!.logicalLength, 2);
});
