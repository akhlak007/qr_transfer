import { chunkFile, reassembleFile } from "./chunker";
import { FountainEncoder, FountainDecoder, mulberry32 } from "./fountain";

function runTest() {
  console.log("Starting Fountain Code offline simulation test...");
  
  // 1. Generate random bytes (e.g., 50 KB)
  const originalSize = 50 * 1024; 
  const originalBytes = new Uint8Array(originalSize);
  for (let i = 0; i < originalSize; i++) {
    originalBytes[i] = Math.floor(Math.random() * 256);
  }
  
  const blockSize = 512; // bytes per block
  const K = Math.ceil(originalSize / blockSize);
  console.log(`Original Size: ${originalSize} bytes, Block Size: ${blockSize} bytes, Blocks (K): ${K}`);
  
  // 2. Chunk the file
  const blocks = chunkFile(originalBytes, blockSize);
  
  // 3. Initialize encoder
  const encoder = new FountainEncoder(blocks, blockSize, mulberry32(0x4c554d45));
  
  // 4. Generate symbols
  const symbols = [];
  const symbolLimit = Math.floor(K * 4.0); // Deterministic ceiling for the peeling decoder
  for (let i = 0; i < symbolLimit; i++) {
    symbols.push(encoder.generateSymbol());
  }
  
  // Shuffle symbols to simulate out-of-order and dropped frames
  const shuffleRandom = mulberry32(0x51525354);
  symbols.sort(() => shuffleRandom() - 0.5);
  
  // 5. Decode symbols sequentially
  const decoder = new FountainDecoder(K, blockSize);
  let resolved = false;
  let symbolsUsed = 0;
  
  for (const sym of symbols) {
    symbolsUsed++;
    if (decoder.processSymbol(sym)) {
      resolved = true;
      break;
    }
  }
  
  if (!resolved) {
    throw new Error(`Failed to decode file using ${symbolsUsed} symbols (out of ${symbolLimit})`);
  }
  
  console.log(`Successfully resolved file! Chunks needed: ${K}, Symbols processed: ${symbolsUsed} (~${((symbolsUsed / K) * 100).toFixed(1)}%)`);
  
  // 6. Reconstruct file and assert equivalence
  const resolvedBlocks = decoder.getResolvedBlocks();
  const reconstructedBytes = reassembleFile(resolvedBlocks, originalSize, blockSize);
  
  if (reconstructedBytes.length !== originalBytes.length) {
    throw new Error(`Length mismatch! Original: ${originalBytes.length}, Reconstructed: ${reconstructedBytes.length}`);
  }
  
  for (let i = 0; i < originalBytes.length; i++) {
    if (originalBytes[i] !== reconstructedBytes[i]) {
      throw new Error(`Byte mismatch at index ${i}! Original: ${originalBytes[i]}, Reconstructed: ${reconstructedBytes[i]}`);
    }
  }
  
  console.log("ASSERTION SUCCESS: Reconstructed bytes match original bytes exactly!");
  console.log("Fountain Code offline simulation test PASSED.\n");
}

try {
  runTest();
} catch (e: any) {
  console.error("Test FAILED:", e.message);
  process.exit(1);
}
