import { performance } from "node:perf_hooks";
import { chunkFile, reassembleFile } from "../modules/chunker";
import { FountainDecoder, FountainEncoder, mulberry32 } from "../modules/fountain";
import { equalBytes, sha256Hex } from "../core/integrity";

async function runBenchmark() {
  const fileSize = 256 * 1024;
  const blockSize = 1024;
  const original = new Uint8Array(fileSize);
  for (let index = 0; index < original.length; index++) original[index] = (index * 31 + 17) & 0xff;

  const startedAt = performance.now();
  const blocks = chunkFile(original, blockSize);
  const encoder = new FountainEncoder(blocks, blockSize, mulberry32(0x4c554d45));
  const decoder = new FountainDecoder(blocks.length, blockSize);
  let symbolsProcessed = 0;
  const maximumSymbols = blocks.length * 4;

  while (!decoder.isDone() && symbolsProcessed < maximumSymbols) {
    decoder.processSymbol(encoder.generateSymbol());
    symbolsProcessed++;
  }
  if (!decoder.isDone()) throw new Error(`Decoder did not finish within ${maximumSymbols} symbols`);

  const reconstructed = reassembleFile(decoder.getResolvedBlocks(), fileSize, blockSize);
  const elapsedMs = performance.now() - startedAt;
  const exactMatch = equalBytes(original, reconstructed);
  const originalHash = await sha256Hex(original);
  const receivedHash = await sha256Hex(reconstructed);
  const result = {
    scope: "In-process fountain encode/decode; no screen or camera",
    runtime: `${process.platform} ${process.arch}; Node ${process.version}`,
    fileSize,
    blockSize,
    sourceBlocks: blocks.length,
    symbolsProcessed,
    recoveryOverheadPercent: ((symbolsProcessed - blocks.length) / blocks.length) * 100,
    elapsedMs,
    computationalThroughputBytesPerSecond: fileSize / (elapsedMs / 1000),
    exactMatch,
    sha256Match: originalHash === receivedHash,
    sha256: originalHash,
  };
  console.log(JSON.stringify(result, null, 2));
}

runBenchmark().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
