# Phase 10 Final Known Limitations

1. Physical screen-to-camera validation was not performed. Noise tolerance, viewing distance, exposure behavior, display refresh interaction, rolling shutter, focus, and ambient-light performance remain unverified on hardware.
2. No browser-control surface was connected during this audit. The running server was verified and UI behavior was source-audited, but interactive selection, native permission denial, real disconnect/reconnect, and visual layout require a separate operator click-through.
3. Camera lifecycle acceptance uses deterministic dependency fakes; it verifies ownership and race behavior but is not a substitute for browser/device testing.
4. The deterministic software optical channel is a simulation and does not reproduce every camera or display characteristic.
5. The production JavaScript bundle is 717.61 kB (190.71 kB gzip), above Vite's default advisory threshold. This is a performance concern, not a protocol-correctness blocker.
6. One pre-existing lint warning remains in `src/research/benchmark-engine.ts` for an unused catch parameter.
7. VLC modes other than OOK are outside this Phase 10 acceptance scope even though unified receiver support exists elsewhere.

These limitations do not change the software-only protocol results, but they prohibit any claim of physical optical readiness.
