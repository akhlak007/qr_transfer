# Phase 1 QR Baseline Evidence

**Recorded:** 2026-08-22  
**Environment:** Windows x64, Node v24.19.0

## Automated fountain pipeline benchmark

This is an in-process computational measurement. It does **not** include QR rendering, a physical display, a camera, ZXing decoding, or a mobile browser, and must not be presented as optical throughput.

| Metric | Measured result |
| --- | ---: |
| Input size | 262,144 bytes (256 KiB) |
| Block size | 1,024 bytes |
| Source blocks | 256 |
| Fountain symbols processed | 354 |
| Recovery overhead | 38.28125% |
| Encode/decode/reassembly elapsed | 53.825 ms |
| Computational pipeline throughput | 4,870,284 bytes/s |
| Exact byte comparison | Match |
| SHA-256 comparison | Match |
| SHA-256 | `8f2144a274ead978258dbbcc0b62c5b0ee7335eb2bf729fbb5ca4026af0f0a14` |

The benchmark injects a fixed pseudo-random sequence, making the input and symbol count reproducible. Timing and computational throughput still vary with machine load. This document records one actual run rather than an expected or advertised result.

## Physical QR benchmark status

| Test | Status |
| --- | --- |
| Desktop display to camera | Not tested in this automated environment |
| Android → Android | Not tested |
| Android → iPhone | Not tested |
| iPhone → Android | Not tested |
| iPhone → iPhone | Not tested |
| Maximum tested mobile file size | Not tested |

Physical optical results will be added only from recorded runs that include device/browser details, environment, distance, screen setting, camera/display FPS, frame statistics, elapsed time, throughput, and matching SHA-256.

## Metric definitions extracted in Phase 1

- **Camera frames captured:** frames copied from the active video element to the scan canvas.
- **Decode attempts:** captured frames submitted to ZXing.
- **QR frames decoded:** attempts returning QR bytes.
- **Camera decode misses:** attempts returning no QR result.
- **Invalid frames:** decoder errors, separate from ordinary no-result misses.
- **Duplicate/redundant:** decoded protocol frames that add no new sequential block or fountain information.
- **Accepted symbols:** sequential blocks or fountain symbols accepted as non-redundant.
- **Effective throughput:** newly resolved source bytes per measurement interval.
- **Achieved screen FPS:** completed QR renders divided by active render-loop time.
- **Packet loss:** unavailable for legacy wire frames because they have no monotonic sequence number.
- **Ambient light and signal quality:** not measured in the QR baseline; reserved for calibrated optical transports.
