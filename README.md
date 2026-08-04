# Lumen - Optical File Transfer via QR Codes

Lumen (or `qr_transfer`) is a web-based, entirely offline application that allows you to transfer files between two devices optically using animated QR codes. It requires absolutely no internet connection, Bluetooth, or local network connection between the sender and receiver.

The application is accessible directly from your browser and leverages the device screen and camera to stream data.

## How it Works

The optical transfer mechanism is built on a few core concepts designed for speed and reliability over a lossy, one-way channel (a camera recording a screen).

### 1. Data Chunking & Metadata
When you select a file to send, the app computes a SHA-256 hash of the file to ensure integrity upon receipt. The file is then sliced into small byte chunks (configurable in the UI, up to 2,900 bytes). This chunk size is carefully chosen to maximize the data density of a high-version QR code without overwhelming the scanner.

### 2. Fountain Codes (Rateless Erasure Coding)
Because a camera might drop frames, blur, or lose focus, a standard sequential transmission of chunks would fail the moment a single frame is missed. To solve this, Lumen uses **Fountain Codes (specifically LT Codes)**.

- **Sender (Encoder)**: Instead of sending blocks 1, 2, 3, etc., the sender mathematically XOR-combines random sets of original chunks to create an infinite stream of encoded "symbols."
- **Receiver (Decoder)**: The receiver scans these symbols. Thanks to the properties of Fountain Codes, the receiver does not need any specific symbol—it just needs *any* `N + small overhead` symbols to solve the mathematical system and reconstruct the original `N` chunks. 

This means the communication is strictly **one-way**. The receiver never has to ask the sender to "resend frame 5"; it simply waits for the next random frame to arrive.

### 3. High-Speed QR Streaming
Each encoded symbol, along with its metadata (seed, degree, block count), is packaged into a binary frame (`modules/protocol.ts`). This frame is rendered into a QR code using the `qrcode` library on an HTML Canvas. The sender rapidly loops this rendering process at high frame rates (up to 60 FPS) to maximize throughput.

### 4. Optical Scanning Pipeline
On the receiving end, the app requests access to the device camera using WebRTC. It captures frames from the video feed and scans them for QR codes using the highly optimized `zxing-wasm` library. To achieve the highest possible scanning frame rate, computational overheads like automatic image rotation (`tryRotate`) are disabled.

### 5. Reassembly and Verification
As the scanner decodes QR codes, it feeds the raw bytes into the Fountain Decoder. Once the decoder accumulates enough independent symbols, it decodes the original file blocks. The app then reassembles the file, validates its SHA-256 hash against the original file's hash, and provides a download link directly in the browser.

## Technologies Used
- **Frontend Framework**: React, TypeScript, Vite
- **QR Generation**: `qrcode`
- **QR Scanning**: `zxing-wasm`
- **Styling**: Vanilla CSS
