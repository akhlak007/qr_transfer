/**
 * 2D Spatial-Frequency Transform Engine for Visual OFDM (Milestone 4B)
 *
 * Implements separable 2D Discrete Cosine Transform (2D-DCT-II) and
 * Inverse 2D-DCT (2D-IDCT-II) for real-valued optical spatial intensity modulation.
 *
 * Real-valued transforms avoid complex conjugate Hermitian overhead and directly
 * yield 2D grayscale spatial luminance patterns suitable for screen display.
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

/**
 * 1D Forward Discrete Cosine Transform (DCT-II)
 */
export function dct1D(input: Float64Array | number[]): Float64Array {
  const N = input.length;
  const output = new Float64Array(N);
  const factor = Math.PI / (2 * N);

  for (let k = 0; k < N; k++) {
    let sum = 0.0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((2 * n + 1) * k * factor);
    }
    const alpha = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
    output[k] = alpha * sum;
  }
  return output;
}

/**
 * 1D Inverse Discrete Cosine Transform (IDCT-II / DCT-III)
 */
export function idct1D(input: Float64Array | number[]): Float64Array {
  const N = input.length;
  const output = new Float64Array(N);
  const factor = Math.PI / (2 * N);

  for (let n = 0; n < N; n++) {
    let sum = 0.0;
    for (let k = 0; k < N; k++) {
      const alpha = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
      sum += alpha * input[k] * Math.cos((2 * n + 1) * k * factor);
    }
    output[n] = sum;
  }
  return output;
}

/**
 * 2D Inverse DCT (Frequency-domain Subcarriers -> Spatial Luminance Matrix)
 */
export function idct2D(freqGrid: Float64Array | number[], N: number): Float64Array {
  const temp = new Float64Array(N * N);
  const spatial = new Float64Array(N * N);

  // 1. 1D IDCT on each row
  const rowIn = new Float64Array(N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      rowIn[c] = freqGrid[r * N + c];
    }
    const rowOut = idct1D(rowIn);
    for (let c = 0; c < N; c++) {
      temp[r * N + c] = rowOut[c];
    }
  }

  // 2. 1D IDCT on each column
  const colIn = new Float64Array(N);
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      colIn[r] = temp[r * N + c];
    }
    const colOut = idct1D(colIn);
    for (let r = 0; r < N; r++) {
      spatial[r * N + c] = colOut[r];
    }
  }

  return spatial;
}

/**
 * 2D Forward DCT (Spatial Luminance Matrix -> Frequency-domain Subcarriers)
 */
export function dct2D(spatial: Float64Array | number[], N: number): Float64Array {
  const temp = new Float64Array(N * N);
  const freqGrid = new Float64Array(N * N);

  // 1. 1D DCT on each row
  const rowIn = new Float64Array(N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      rowIn[c] = spatial[r * N + c];
    }
    const rowOut = dct1D(rowIn);
    for (let c = 0; c < N; c++) {
      temp[r * N + c] = rowOut[c];
    }
  }

  // 2. 1D DCT on each column
  const colIn = new Float64Array(N);
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      colIn[r] = temp[r * N + c];
    }
    const colOut = dct1D(colIn);
    for (let r = 0; r < N; r++) {
      freqGrid[r * N + c] = colOut[r];
    }
  }

  return freqGrid;
}
