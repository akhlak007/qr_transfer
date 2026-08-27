# VLC Diagnostic Trace Operator Guide

1. Open the deployed site on sender and receiver and hard-refresh both pages.
2. On both devices select **VLC**, **OOK**, and the same Manchester chip rate. Start with 10 chips/s.
3. On the receiver, select **Receive**, then start the camera. Starting a new VLC camera session clears and enables the temporary trace automatically.
4. Aim the receiver at the transmitter so the changing canvas fills the target box. Keep both devices stationary.
5. Start a short text-message transmission. Capture at least 30 seconds; if the status reaches `CRC failed`, continue until the sender repeats or for another 30 seconds.
6. Stop the receiver camera. In **Temporary VLC Diagnostic Trace**, click **Download JSON Trace**.
7. Send the downloaded `vlc-trace-*.json` file for analysis together with sender/receiver device models, browser versions, selected chip rate, approximate distance, and screen brightness.

The trace is bounded to 60,000 events. When full, it discards the oldest events and reports `droppedEvents` in the JSON. It records camera, luminance/timing, OOK synchronization, router dispatch, and reconstruction events. It does not change modulation, framing, synchronization thresholds, CRC, or reconstruction decisions.
