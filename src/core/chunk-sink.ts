export interface StoredChunk {
  index: number;
  bytes: Uint8Array;
  logicalLength: number;
}

export interface ChunkSink {
  writeBlock(index: number, bytes: Uint8Array, logicalLength: number): Promise<void>;
  readBlock(index: number): Promise<StoredChunk | null>;
  listBlockIndices(): Promise<number[]>;
  flush(): Promise<void>;
}

export class MemoryChunkSink implements ChunkSink {
  private readonly chunks = new Map<number, StoredChunk>();

  async writeBlock(index: number, bytes: Uint8Array, logicalLength: number): Promise<void> {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Chunk index must be a non-negative safe integer");
    if (!Number.isSafeInteger(logicalLength) || logicalLength < 0 || logicalLength > bytes.byteLength) {
      throw new RangeError("Logical length must fit within the stored bytes");
    }
    this.chunks.set(index, { index, bytes: bytes.slice(), logicalLength });
  }

  async readBlock(index: number): Promise<StoredChunk | null> {
    const chunk = this.chunks.get(index);
    return chunk ? { ...chunk, bytes: chunk.bytes.slice() } : null;
  }

  async listBlockIndices(): Promise<number[]> {
    return [...this.chunks.keys()].sort((left, right) => left - right);
  }

  async flush(): Promise<void> {
    // Memory writes are immediately durable for the lifetime of this adapter.
  }
}
