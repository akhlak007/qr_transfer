export interface FileSource {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  read(offset: number, length: number): Promise<Uint8Array>;
  stream(): ReadableStream<Uint8Array>;
}

function validateRange(offset: number, length: number, size: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError("Offset must be a non-negative safe integer");
  if (!Number.isSafeInteger(length) || length < 0) throw new RangeError("Length must be a non-negative safe integer");
  if (offset > size) throw new RangeError("Offset exceeds source size");
}

export class BrowserFileSource implements FileSource {
  private readonly file: File;
  readonly name: string;
  readonly size: number;
  readonly type: string;

  constructor(file: File) {
    this.file = file;
    this.name = file.name;
    this.size = file.size;
    this.type = file.type;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    validateRange(offset, length, this.size);
    const end = Math.min(this.size, offset + length);
    return new Uint8Array(await this.file.slice(offset, end).arrayBuffer());
  }

  stream(): ReadableStream<Uint8Array> {
    return this.file.stream();
  }
}

export class MemoryFileSource implements FileSource {
  private readonly bytes: Uint8Array;
  readonly name: string;
  readonly type: string;
  readonly size: number;

  constructor(
    bytes: Uint8Array,
    name = "memory.bin",
    type = "application/octet-stream",
  ) {
    this.bytes = bytes.slice();
    this.name = name;
    this.type = type;
    this.size = bytes.byteLength;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    validateRange(offset, length, this.size);
    return this.bytes.slice(offset, Math.min(this.size, offset + length));
  }

  stream(): ReadableStream<Uint8Array> {
    const bytes = this.bytes.slice();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }
}
