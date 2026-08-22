import type { FileSource } from "./file-source";

export interface ChunkSource {
  readonly blockSize: number;
  readonly totalBlocks: number;
  readBlock(index: number): Promise<Uint8Array>;
  logicalLength(index: number): number;
}

export class FileChunkSource implements ChunkSource {
  private readonly source: FileSource;
  readonly blockSize: number;
  readonly totalBlocks: number;

  constructor(source: FileSource, blockSize: number) {
    if (!Number.isSafeInteger(blockSize) || blockSize <= 0) throw new RangeError("Block size must be a positive safe integer");
    this.source = source;
    this.blockSize = blockSize;
    this.totalBlocks = Math.ceil(source.size / blockSize);
  }

  logicalLength(index: number): number {
    this.validateIndex(index);
    return Math.min(this.blockSize, this.source.size - index * this.blockSize);
  }

  async readBlock(index: number): Promise<Uint8Array> {
    const logicalLength = this.logicalLength(index);
    const bytes = await this.source.read(index * this.blockSize, logicalLength);
    const padded = new Uint8Array(this.blockSize);
    padded.set(bytes);
    return padded;
  }

  private validateIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.totalBlocks) {
      throw new RangeError(`Chunk index ${index} is out of range`);
    }
  }
}
