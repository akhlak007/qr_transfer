import { readBarcodes } from "zxing-wasm/reader";

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
): Promise<QRCodeScanResult | null> {
  try {
    let imageData: ImageData;
    if (source instanceof HTMLCanvasElement) {
      const ctx = source.getContext("2d");
      if (!ctx) return null;
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
        return {
          bytes: firstResult.bytes,
          text: firstResult.text || "",
        };
      }
    }
  } catch (error) {
    console.warn("Decode failure:", error);
  }
  return null;
}
