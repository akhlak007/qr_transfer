# Phase 9 Protocol Capability Matrix

Legend: **Pass** = directly demonstrated; **Isolated only** = algorithms/harness pass but live App chain fails; **N/A** = no such observed stage; **Fail** = independently confirmed incompatibility.

| Protocol | Application TX | Renderer | Receiver | CRC | Fountain | SHA-256 | Live App E2E | Release status |
|---|---|---|---|---|---|---|---|---|
| QR | Pass | Pass | Pass (`scanQRCode`) | N/A / currently misreported | Pass | Pass | Pass for software QR transfer | Blocked by evidence semantics |
| VLC OOK | Fail: missing VLC frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM BPSK 8x8 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM BPSK 16x16 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM BPSK 32x32 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM QPSK 8x8 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM QPSK 16x16 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM QPSK 32x32 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM 16-QAM 8x8 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM 16-QAM 16x16 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |
| OFDM 16-QAM 32x32 | Fail: missing OFDM frame wrapper | Pass in isolation | Pass in isolation | Pass in isolated framed path | Pass in isolated path | Pass in isolated path | Fail | Release Blocker |

## Evidence boundary

The 18-test Phase 8E suite demonstrates isolated software transmitter/channel/receiver paths. It does not validate the live `App` composition. Therefore isolated successes are retained as engineering capability evidence but are insufficient for production release promotion.

No physical-device capability is asserted by this matrix.
