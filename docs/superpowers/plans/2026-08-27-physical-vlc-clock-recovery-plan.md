# Physical VLC Clock-Recovery Implementation Plan

Design authority: `docs/superpowers/specs/2026-08-27-physical-vlc-clock-recovery-design.md`

1. Add a Manchester OOK physical modulator while retaining legacy modulation helpers for software compatibility.
2. Make the live VLC scheduler and renderer use Manchester chips and a 10 chip/s physical preset.
3. Add a timestamp-driven physical receiver that converts asynchronous camera observations into chip centers, tries both Manchester pair phases, and delegates validated logical bits to the existing VLC frame/CRC receiver.
4. Return physical acquisition diagnostics through the live router and show actionable receiver acknowledgements in the Receive UI.
5. Add deterministic tests for 30/60 FPS sampling, phase offsets, duplicate/drop patterns, weak signal, malformed Manchester pairs, exact payload recovery, and QR regression.
6. Run the complete unit suite and production build. Keep physical VLC labeled experimental until a real phone run produces matching SHA-256.
