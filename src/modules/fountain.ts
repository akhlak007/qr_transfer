/**
 * Deterministic seeded 32-bit PRNG (Mulberry32).
 * Returns a function that generates a pseudo-random float between 0 (inclusive) and 1 (exclusive).
 */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Robust Soliton Distribution for LT Fountain Codes.
 */
export class RobustSoliton {
  private cdf: number[];

  constructor(K: number, c = 0.1, delta = 0.05) {
    if (K <= 0) {
      this.cdf = [0];
      return;
    }
    if (K === 1) {
      this.cdf = [0, 1.0];
      return;
    }

    const rho = new Array(K + 1).fill(0);
    rho[1] = 1 / K;
    for (let i = 2; i <= K; i++) {
      rho[i] = 1 / (i * (i - 1));
    }

    const tau = new Array(K + 1).fill(0);
    const S = c * Math.log(K / delta) * Math.sqrt(K);
    const R = K / S;
    const R_floor = Math.floor(R);

    if (S > 0) {
      for (let i = 1; i <= K; i++) {
        if (i < R_floor) {
          tau[i] = S / (i * K);
        } else if (i === R_floor) {
          tau[i] = (S * Math.log(S / delta)) / K;
        } else {
          tau[i] = 0;
        }
      }
    }

    const beta = new Array(K + 1).fill(0);
    let sum = 0;
    for (let i = 1; i <= K; i++) {
      beta[i] = rho[i] + tau[i];
      sum += beta[i];
    }

    this.cdf = new Array(K + 1).fill(0);
    let cumulative = 0;
    for (let i = 1; i <= K; i++) {
      cumulative += beta[i] / sum;
      this.cdf[i] = cumulative;
    }
    this.cdf[K] = 1.0; // Ensure CDF ends precisely at 1
  }

  public sample(randomFloat: number): number {
    let low = 1;
    let high = this.cdf.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (randomFloat <= this.cdf[mid]) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }
}

/**
 * Deterministically derives the block indices composing a symbol using a seed.
 */
export function getIndicesFromSeed(seed: number, degree: number, K: number): number[] {
  const rng = mulberry32(seed);
  const indices = Array.from({ length: K }, (_, i) => i);
  // Partial Fisher-Yates shuffle
  for (let i = 0; i < degree; i++) {
    const j = i + Math.floor(rng() * (K - i));
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }
  return indices.slice(0, degree);
}

export interface FountainSymbol {
  seed: number;
  degree: number;
  payload: Uint8Array;
}

/**
 * LT Fountain Code Encoder.
 */
export class FountainEncoder {
  private blocks: Uint8Array[];
  private blockSize: number;
  private soliton: RobustSoliton;
  private random: () => number;

  constructor(blocks: Uint8Array[], blockSize: number, random: () => number = Math.random) {
    this.blocks = blocks;
    this.blockSize = blockSize;
    this.soliton = new RobustSoliton(blocks.length);
    this.random = random;
  }

  /**
   * Generates a new random fountain symbol.
   */
  public generateSymbol(): FountainSymbol {
    const seed = Math.floor(this.random() * 0xffffffff);
    const rng = mulberry32(seed);
    const degree = this.soliton.sample(rng());
    const indices = getIndicesFromSeed(seed, degree, this.blocks.length);

    const payload = new Uint8Array(this.blockSize);
    for (const index of indices) {
      const block = this.blocks[index];
      for (let i = 0; i < this.blockSize; i++) {
        payload[i] ^= block[i];
      }
    }

    return { seed, degree, payload };
  }
}

interface DecoderSymbol {
  seed: number;
  indices: Set<number>;
  payload: Uint8Array;
}

/**
 * LT Fountain Code Peeling Decoder.
 */
export class FountainDecoder {
  private K: number;
  private blockSize: number;
  private resolvedBlocks = new Map<number, Uint8Array>();
  private unresolvedSymbols: DecoderSymbol[] = [];
  
  // Stats
  public totalProcessedSymbols = 0;
  public redundantSymbols = 0;

  constructor(K: number, blockSize: number) {
    this.K = K;
    this.blockSize = blockSize;
  }

  /**
   * Processes a newly received fountain symbol.
   * Returns true if the file is now fully resolved.
   */
  public processSymbol(symbol: FountainSymbol): boolean {
    this.totalProcessedSymbols++;

    if (this.isDone()) {
      return true;
    }

    // Recover block indices from seed using the transmitted degree
    const degree = symbol.degree;
    const indicesArray = getIndicesFromSeed(symbol.seed, degree, this.K);
    const indices = new Set(indicesArray);

    const payload = new Uint8Array(symbol.payload);

    const decSymbol: DecoderSymbol = {
      seed: symbol.seed,
      indices,
      payload,
    };

    // Simplify the symbol with all already resolved blocks
    for (const idx of Array.from(decSymbol.indices)) {
      if (this.resolvedBlocks.has(idx)) {
        const resolvedVal = this.resolvedBlocks.get(idx)!;
        for (let i = 0; i < this.blockSize; i++) {
          decSymbol.payload[i] ^= resolvedVal[i];
        }
        decSymbol.indices.delete(idx);
      }
    }

    if (decSymbol.indices.size === 0) {
      this.redundantSymbols++;
      return this.isDone();
    }

    if (decSymbol.indices.size === 1) {
      // Resolve immediately and propagate!
      this.resolveSymbol(decSymbol);
    } else {
      // Check if we already have this exact set of indices to avoid duplicate tracking
      const isDuplicate = this.unresolvedSymbols.some((s) => {
        if (s.indices.size !== decSymbol.indices.size) return false;
        for (const idx of decSymbol.indices) {
          if (!s.indices.has(idx)) return false;
        }
        return true;
      });

      if (isDuplicate) {
        this.redundantSymbols++;
      } else {
        this.unresolvedSymbols.push(decSymbol);
      }
    }

    return this.isDone();
  }

  private resolveSymbol(decSymbol: DecoderSymbol) {
    const blockIndex = Array.from(decSymbol.indices)[0];
    if (this.resolvedBlocks.has(blockIndex)) {
      return;
    }

    // Save the resolved block
    this.resolvedBlocks.set(blockIndex, decSymbol.payload);

    // Propagate the resolved block to all unresolved symbols
    const nextToResolve: DecoderSymbol[] = [];
    
    // We filter out symbols that get resolved
    this.unresolvedSymbols = this.unresolvedSymbols.filter((symbol) => {
      if (symbol.indices.has(blockIndex)) {
        for (let i = 0; i < this.blockSize; i++) {
          symbol.payload[i] ^= decSymbol.payload[i];
        }
        symbol.indices.delete(blockIndex);

        if (symbol.indices.size === 1) {
          nextToResolve.push(symbol);
          return false; // remove from unresolved
        }
        if (symbol.indices.size === 0) {
          return false; // redundant/done, remove
        }
      }
      return true;
    });

    // Recursively resolve cascading symbols
    for (const sym of nextToResolve) {
      this.resolveSymbol(sym);
    }
  }

  /**
   * Checks if all K blocks have been resolved.
   */
  public isDone(): boolean {
    return this.resolvedBlocks.size === this.K;
  }

  /**
   * Returns the count of resolved blocks.
   */
  public getResolvedCount(): number {
    return this.resolvedBlocks.size;
  }

  /**
   * Returns all resolved blocks in a sorted array.
   * Throws an error if the decoder is not done.
   */
  public getResolvedBlocks(): Uint8Array[] {
    if (!this.isDone()) {
      throw new Error("Cannot retrieve blocks before decoding is complete.");
    }
    const blocks: Uint8Array[] = [];
    for (let i = 0; i < this.K; i++) {
      blocks.push(this.resolvedBlocks.get(i)!);
    }
    return blocks;
  }
}
