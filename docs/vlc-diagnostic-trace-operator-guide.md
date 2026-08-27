# VLC Diagnostic Trace Operator Guide

1. Open the deployed site on sender and receiver and hard-refresh both pages.
2. On both devices select **VLC**, **OOK**, and the same Manchester chip rate. Use **15 chips/s** when the receiver reports at least 27 camera FPS; otherwise use **10 chips/s**.
3. On the receiver, select **Receive**, then start the camera. Starting a new VLC camera session clears and enables the temporary trace automatically.
4. Aim the receiver at the transmitter so the changing canvas fills the target box. Keep both devices stationary.
5. Start a short text-message transmission. VLC OOK messages use the compact repeated path: a three-byte message needs 358 chips (about 23.9 seconds at 15 chips/s or 35.8 seconds at 10 chips/s). If the first preamble is missed, leave the sender running for another repetition.
6. Stop the receiver camera. In **Temporary VLC Diagnostic Trace**, click **Download JSON Trace**.
7. Send the downloaded `vlc-trace-*.json` file for analysis together with sender/receiver device models, browser versions, selected chip rate, approximate distance, and screen brightness.

The trace is bounded to 60,000 events. When full, it discards the oldest events and reports `droppedEvents` in the JSON. It records camera, luminance/timing, OOK synchronization, router dispatch, and reconstruction events. It does not change modulation, framing, synchronization thresholds, CRC, or reconstruction decisions.

Physical limits: screen refresh scheduling, camera exposure, rolling shutter, auto-exposure, focus, glare, and browser frame delivery can increase observed time or cause a repetition. The UI's completion message proves a CRC-valid VLC frame was recovered; the optical channel is one-way, so the sender cannot know when the receiver has completed.

Compact physical VLC messages are limited to 1,007 UTF-8 bytes because the unchanged receiver frame buffer is 8,192 bits. Larger text must use QR or be split in a future explicitly versioned VLC protocol.
