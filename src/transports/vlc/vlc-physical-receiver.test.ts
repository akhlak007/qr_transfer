import assert from "node:assert/strict";
import test from "node:test";
import { encodeVlcFrame } from "./vlc-framing";
import { modulateManchesterOok, modulateOok } from "./vlc-modulator";
import { PhysicalVlcReceiver } from "./vlc-physical-receiver";
import { opticalDiagnosticTrace } from "../../diagnostics/optical-trace";
import { VlcOokReceiver } from "./vlc-receiver";

function transmitAtCameraFps(cameraFps: number, phaseMs = 0, dropEvery = 0, transmitterChipMs = 100) {
  const payload = Uint8Array.from({ length: 48 }, (_, index) => index * 17 + 3);
  const bytes = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 4, payload });
  const stream = modulateManchesterOok(bytes);
  const receiver = new PhysicalVlcReceiver(10);
  let recovered: Uint8Array | null = null;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  const framePeriod = 1000 / cameraFps;
  const duration = stream.totalSymbols * transmitterChipMs + 200;
  let observation = 0;
  for (let time = phaseMs; time < duration; time += framePeriod) {
    observation++;
    if (dropEvery > 0 && observation % dropEvery === 0) continue;
    const chip = Math.min(stream.totalSymbols - 1, Math.floor(time / transmitterChipMs));
    receiver.ingestSample(stream.levels[chip], time);
  }
  return { payload, recovered, diagnostics: receiver.getDiagnostics() };
}

for (const cameraFps of [30, 60]) {
  test(`physical Manchester VLC recovers at ${cameraFps} camera FPS`, () => {
    const result = transmitAtCameraFps(cameraFps, 17);
    assert.deepEqual(result.recovered, result.payload);
    assert.ok(result.diagnostics.validFramesCount >= 1);
  });
}

test("physical Manchester VLC tolerates dropped camera observations", () => {
  const result = transmitAtCameraFps(60, 41, 11);
  assert.deepEqual(result.recovered, result.payload);
});

test("physical Manchester VLC tracks two-percent sender clock drift", () => {
  const result = transmitAtCameraFps(60, 23, 0, 102);
  assert.deepEqual(result.recovered, result.payload);
});

test("physical VLC drops lock instead of inventing chips across a camera stall", () => {
  const receiver = new PhysicalVlcReceiver(10);
  receiver.ingestSample(0, 0);
  receiver.ingestSample(255, 20);
  receiver.ingestSample(0, 200);
  assert.equal(receiver.getDiagnostics().state, "CLOCK_LOST");
  assert.equal(receiver.getDiagnostics().validFramesCount, 0);
});

test("physical VLC calibration accepts a shifted exposure range", () => {
  const payload = new Uint8Array([3, 1, 4, 1, 5]);
  const bytes = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 8, payload });
  const stream = modulateManchesterOok(bytes);
  const receiver = new PhysicalVlcReceiver(10);
  let recovered: Uint8Array | null = null;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  let time = 0;
  for (; time < 1000; time += 1000 / 60) receiver.ingestSample(Math.floor(time / 100) % 2 ? 255 : 0, time);
  const shiftedAt = time;
  for (; time < shiftedAt + stream.totalSymbols * 100; time += 1000 / 60) {
    const chip = Math.min(stream.totalSymbols - 1, Math.floor((time - shiftedAt) / 100));
    receiver.ingestSample(stream.levels[chip] === 0 ? 140 : 220, time);
  }
  assert.deepEqual(recovered, payload);
});

test("physical VLC acknowledges an unusable camera signal", () => {
  const receiver = new PhysicalVlcReceiver(10);
  for (let index = 0; index < 20; index++) receiver.ingestSample(110, index * 16);
  const diagnostics = receiver.getDiagnostics();
  assert.equal(diagnostics.state, "SIGNAL_TOO_WEAK");
  assert.match(diagnostics.message, /cannot distinguish light levels/i);
});

test("diagnostic tracing does not change recovered bytes, CRC, or receiver behavior", () => {
  const run = (enabled: boolean) => {
    opticalDiagnosticTrace.clear();
    opticalDiagnosticTrace.setEnabled(enabled);
    const result = transmitAtCameraFps(60, 19, 13, 101);
    return { recovered: result.recovered, crcStatus: result.diagnostics.crcStatus,
      validFramesCount: result.diagnostics.validFramesCount,
      corruptFramesCount: result.diagnostics.corruptFramesCount,
      state: result.diagnostics.state, trace: opticalDiagnosticTrace.snapshot() };
  };
  const withoutTrace = run(false);
  const withTrace = run(true);
  opticalDiagnosticTrace.setEnabled(false);
  assert.deepEqual(withTrace.recovered, withoutTrace.recovered);
  assert.deepEqual(
    { crcStatus: withTrace.crcStatus, validFramesCount: withTrace.validFramesCount,
      corruptFramesCount: withTrace.corruptFramesCount, state: withTrace.state },
    { crcStatus: withoutTrace.crcStatus, validFramesCount: withoutTrace.validFramesCount,
      corruptFramesCount: withoutTrace.corruptFramesCount, state: withoutTrace.state },
  );
  assert.equal(withoutTrace.trace.events.length, 0);
  assert.ok(withTrace.trace.events.some((event) => event.stage === "PhysicalVlcReceiver"));
  assert.ok(withTrace.trace.events.some((event) => event.stage === "VlcOokReceiver" && event.event === "crc-pass"));
});

test("discarded VLC frames record an explicit rejection reason", () => {
  const bytes = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 9, payload: new Uint8Array([1, 2, 3]) });
  bytes[9] ^= 0x40;
  opticalDiagnosticTrace.clear();
  opticalDiagnosticTrace.setEnabled(true);
  const receiver = new VlcOokReceiver();
  for (const level of modulateOok(bytes).levels) receiver.ingestLuminanceSample(level);
  opticalDiagnosticTrace.setEnabled(false);
  assert.equal(receiver.getDiagnostics().crcStatus, "invalid");
  const rejection = opticalDiagnosticTrace.snapshot().events.find((event) => event.event === "frame-rejected");
  assert.equal(rejection?.details.reason, "crc-failed");
});
