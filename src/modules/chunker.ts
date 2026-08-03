/**
 * Chunks a Uint8Array into fixed-size blocks.
 * If the last block is smaller than the block size, it will be padded with zeros.
 */
export function chunkFile(fileData: Uint8Array, blockSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  const totalLength = fileData.length;
  const numChunks = Math.ceil(totalLength / blockSize);

  for (let i = 0; i < numChunks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalLength);
    const chunk = new Uint8Array(blockSize); // filled with 0s by default

    // Copy original data into chunk
    chunk.set(fileData.subarray(start, end));
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Reassembles chunked blocks back into a single Uint8Array.
 * If finalSize is provided, it trims the padding off the last block.
 */
export function reassembleFile(chunks: Uint8Array[], finalSize: number, blockSize: number): Uint8Array {
  const result = new Uint8Array(finalSize);
  const numChunks = chunks.length;

  for (let i = 0; i < numChunks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, finalSize);
    const chunkData = chunks[i].subarray(0, end - start);
    result.set(chunkData, start);
  }

  return result;
}
