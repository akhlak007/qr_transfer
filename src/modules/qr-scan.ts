import { readBarcodes } from "zxing-wasm/reader";
import type { OpticalDecodeObservation } from "../core/transport";

export interface QRCodeScanResult {
  bytes: Uint8Array;
  text: string;
}

/**
 * Scans a canvas or image data for a QR Code.
 * Returns the decoded byte data and text if a QR code is found, otherwise null.
 */
export async function scanQRCode(
  source: ImageData | HTMLCanvasElement
): Promise<OpticalDecodeObservation & { result?: QRCodeScanResult }> {
  const startedAt = performance.now();
  try {
    let imageData: ImageData;
    if (source instanceof HTMLCanvasElement) {
      const ctx = source.getContext("2d");
      if (!ctx) {
        return {
          outcome: "invalid",
          durationMs: performance.now() - startedAt,
          capturedAt: performance.now(),
          error: "Canvas 2D context is unavailable",
        };
      }
      imageData = ctx.getImageData(0, 0, source.width, source.height);
    } else {
      imageData = source;
    }

    const results = await readBarcodes(imageData, {
      formats: ["QRCode"],
      tryHarder: false, // Turn off for speed during video frame scanning
      tryRotate: false,
    });

    if (results && results.length > 0) {
      const firstResult = results[0];
      if (firstResult.bytes && firstResult.bytes.length > 0) {
        const result = {
          bytes: firstResult.bytes,
          text: firstResult.text || "",
        };
        return {
          outcome: "decoded",
          durationMs: performance.now() - startedAt,
          capturedAt: performance.now(),
          bytes: result.bytes,
          result,
        };
      }
    }
  } catch (error) {
    console.warn("Decode failure:", error);
    return {
      outcome: "invalid",
      durationMs: performance.now() - startedAt,
      capturedAt: performance.now(),
      error: error instanceof Error ? error.message : "Unknown QR decode error",
    };
  }
  return {
    outcome: "no-signal",
    durationMs: performance.now() - startedAt,
    capturedAt: performance.now(),
  };
}
