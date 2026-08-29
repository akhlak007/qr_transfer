import assert from "node:assert/strict";
import test from "node:test";
import { encodeVlcFrame } from "./vlc-framing";
import { modulateManchesterOok, modulateOok } from "./vlc-modulator";
import { PhysicalVlcReceiver } from "./vlc-physical-receiver";
import { opticalDiagnosticTrace } from "../../diagnostics/optical-trace";
import { VlcOokReceiver } from "./vlc-receiver";
import { encodeCompactMessageFrame, decodeCompactMessageFrame } from "../../modules/protocol";

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

test("physical VLC soft-reacquires across a short camera stall without inventing chips", () => {
  const receiver = new PhysicalVlcReceiver(10);
  receiver.ingestSample(0, 0);
  receiver.ingestSample(255, 20);
  receiver.ingestSample(0, 200);
  const diagnostics = receiver.getDiagnostics();
  assert.equal(diagnostics.state, "REACQUIRING");
  assert.ok(diagnostics.softReacquisitions >= 1);
  assert.equal(diagnostics.validFramesCount, 0);
});

test("physical VLC hard-resets after a long camera stall", () => {
  const receiver = new PhysicalVlcReceiver(10);
  receiver.ingestSample(0, 0);
  receiver.ingestSample(255, 20);
  receiver.ingestSample(0, 520);
  assert.equal(receiver.getDiagnostics().state, "CLOCK_LOST");
  assert.equal(receiver.getDiagnostics().validFramesCount, 0);
});

test("SIGNAL_TOO_WEAK keeps timeline alive so recovery does not invent CLOCK_LOST", () => {
  const receiver = new PhysicalVlcReceiver(10);
  // Establish a valid optical range and clock, then dip into weak contrast.
  for (let t = 0; t < 400; t += 16) receiver.ingestSample(t % 32 < 16 ? 40 : 220, t);
  const beforeWeak = receiver.getDiagnostics().clockResets;
  // Flush the 60-sample luminance window with near-flat levels.
  for (let t = 400; t < 1600; t += 16) receiver.ingestSample(128 + (t % 3), t);
  assert.equal(receiver.getDiagnostics().state, "SIGNAL_TOO_WEAK");
  // Resume strong contrast without a multi-chip wall-clock gap.
  for (let t = 1600; t < 1900; t += 16) receiver.ingestSample(t % 32 < 16 ? 40 : 220, t);
  assert.ok(receiver.getDiagnostics().clockResets <= beforeWeak + 1);
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
  assert.match(diagnostics.message, /too weak|low contrast/i);
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

for (const cameraFps of [30, 60]) {
  test(`compact message recovers physically at 15 chips/s and ${cameraFps} camera FPS`, () => {
    const payload = encodeCompactMessageFrame(123, new TextEncoder().encode("hey"));
    const stream = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 1, payload }));
    const receiver = new PhysicalVlcReceiver(15);
    let recovered: Uint8Array | null = null;
    let expectedBits: number | null = null;
    let maximumBufferedBits = 0;
    receiver.onFrame((event) => { recovered = event.rawPayload; });
    const chipMs = 1000 / 15;
    for (let time = 11; time < stream.totalSymbols * chipMs + 100; time += 1000 / cameraFps) {
      const diagnostics = receiver.ingestSample(stream.levels[Math.min(stream.totalSymbols - 1, Math.floor(time / chipMs))], time);
      expectedBits ??= diagnostics.expectedFrameBits;
      maximumBufferedBits = Math.max(maximumBufferedBits, diagnostics.bufferedFrameBits);
    }
    assert.deepEqual(recovered, payload);
    assert.equal(expectedBits, (payload.length + 10) * 8);
    assert.ok(maximumBufferedBits > 64);
  });
}

test("compact message reacquires on repetition after the initial preamble is missed", () => {
  const payload = encodeCompactMessageFrame(456, new TextEncoder().encode("hey"));
  const stream = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 2, payload }));
  const receiver = new PhysicalVlcReceiver(15);
  let recovered: Uint8Array | null = null;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  const chipMs = 1000 / 15;
  const repetitionMs = stream.totalSymbols * chipMs;
  for (let time = 100 * chipMs; time < repetitionMs * 2 + 100; time += 1000 / 60) {
    const repeatedTime = time % repetitionMs;
    receiver.ingestSample(stream.levels[Math.min(stream.totalSymbols - 1, Math.floor(repeatedTime / chipMs))], time);
  }
  assert.deepEqual(recovered, payload);
});

function recoverCompactText(text: string, cameraFps: number, chipRate = 10, options?: {
  dropEvery?: number;
  duplicateEvery?: number;
  unevenJitterMs?: number;
}) {
  const payload = encodeCompactMessageFrame(1, new TextEncoder().encode(text));
  const stream = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 7, payload }));
  const receiver = new PhysicalVlcReceiver(chipRate);
  let recovered: Uint8Array | null = null;
  let maxProgress = 0;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  const chipMs = 1000 / chipRate;
  const framePeriod = 1000 / cameraFps;
  let observation = 0;
  for (let time = 7; time < stream.totalSymbols * chipMs + 150; time += framePeriod) {
    observation++;
    if (options?.dropEvery && observation % options.dropEvery === 0) continue;
    const sampleTime = options?.unevenJitterMs
      ? time + ((observation % 3) - 1) * options.unevenJitterMs
      : time;
    const chip = Math.min(stream.totalSymbols - 1, Math.floor(sampleTime / chipMs));
    const diagnostics = receiver.ingestSample(stream.levels[chip]!, sampleTime);
    maxProgress = Math.max(maxProgress, diagnostics.frameProgressPercent);
    if (options?.duplicateEvery && observation % options.duplicateEvery === 0) {
      receiver.ingestSample(stream.levels[chip]!, sampleTime + 0.1);
    }
  }
  return { payload, recovered, maxProgress, diagnostics: receiver.getDiagnostics() };
}

for (const text of ["HELLO", "STATUS OK", "HELLO WORLD", "স্বাগতম"]) {
  test(`short CompactMessage recovers "${text}" at 30 FPS`, () => {
    const result = recoverCompactText(text, 30);
    assert.deepEqual(result.recovered, result.payload);
    assert.ok(result.maxProgress > 0);
    assert.equal(result.diagnostics.crcStatus === "valid" || result.diagnostics.validFramesCount >= 1, true);
  });
}

test("short CompactMessage tolerates uneven 30 FPS intervals", () => {
  const result = recoverCompactText("HELLO", 30, 10, { unevenJitterMs: 4 });
  assert.deepEqual(result.recovered, result.payload);
});

test("short CompactMessage tolerates duplicated camera frames", () => {
  const result = recoverCompactText("STATUS OK", 60, 10, { duplicateEvery: 7 });
  assert.deepEqual(result.recovered, result.payload);
});

test("short CompactMessage recovers after dropped frames at 60 FPS", () => {
  const result = recoverCompactText("HELLO WORLD", 60, 10, { dropEvery: 9 });
  assert.deepEqual(result.recovered, result.payload);
});

test("partial frame progress is reported before CRC completion", () => {
  const payload = encodeCompactMessageFrame(9, new TextEncoder().encode("HELLO"));
  const stream = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 3, payload }));
  const receiver = new PhysicalVlcReceiver(10);
  const chipMs = 100;
  let sawPartial = false;
  for (let time = 0; time < stream.totalSymbols * chipMs * 0.55; time += 1000 / 60) {
    const diagnostics = receiver.ingestSample(
      stream.levels[Math.min(stream.totalSymbols - 1, Math.floor(time / chipMs))]!,
      time,
    );
    if (diagnostics.expectedFrameBits !== null && diagnostics.bufferedFrameBits > 0
      && diagnostics.bufferedFrameBits < diagnostics.expectedFrameBits
      && diagnostics.validFramesCount === 0) {
      sawPartial = true;
      assert.ok(diagnostics.frameProgressPercent > 0 && diagnostics.frameProgressPercent < 100);
      break;
    }
  }
  assert.equal(sawPartial, true);
});

test("HELLO validation: CRC PASS recovers exact text at 10 chips/s and 30 FPS", () => {
  const text = "HELLO";
  const result = recoverCompactText(text, 30, 10);
  assert.deepEqual(result.recovered, result.payload);
  assert.equal(decodeCompactMessageFrame(result.recovered!).text, text);
  assert.ok(result.diagnostics.validFramesCount >= 1);
});

test("HELLO validation: soft reacquire preserves buffered frame bits", () => {
  const payload = encodeCompactMessageFrame(11, new TextEncoder().encode("HELLO"));
  const stream = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 5, payload }));
  const receiver = new PhysicalVlcReceiver(10);
  const chipMs = 100;
  let bufferedBeforeStall = 0;
  let expectedBits: number | null = null;
  // Feed enough to lock and buffer some header bits, then insert a soft stall.
  for (let time = 0; time < stream.totalSymbols * chipMs * 0.45; time += 1000 / 60) {
    const diagnostics = receiver.ingestSample(
      stream.levels[Math.min(stream.totalSymbols - 1, Math.floor(time / chipMs))]!,
      time,
    );
    if (diagnostics.expectedFrameBits !== null && diagnostics.bufferedFrameBits > 16) {
      bufferedBeforeStall = diagnostics.bufferedFrameBits;
      expectedBits = diagnostics.expectedFrameBits;
      const stallAt = time + 180;
      receiver.ingestSample(stream.levels[Math.min(stream.totalSymbols - 1, Math.floor(stallAt / chipMs))]!, stallAt);
      assert.equal(receiver.getDiagnostics().state, "REACQUIRING");
      assert.ok(receiver.getDiagnostics().bufferedFrameBits >= bufferedBeforeStall * 0.5
        || receiver.getDiagnostics().bufferedFrameBits > 0);
      assert.equal(receiver.getDiagnostics().expectedFrameBits, expectedBits);
      break;
    }
  }
  assert.ok(bufferedBeforeStall > 0);
});

test("HELLO validation: repeated transmission recovers after missing first pass", () => {
  const payload = encodeCompactMessageFrame(12, new TextEncoder().encode("HELLO"));
  const stream = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 6, payload }));
  const receiver = new PhysicalVlcReceiver(10);
  let recovered: Uint8Array | null = null;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  const chipMs = 100;
  const period = stream.totalSymbols * chipMs;
  // Start mid-frame, then let a full retransmission complete.
  for (let time = period * 0.4; time < period * 2.2; time += 1000 / 30) {
    const local = time % period;
    receiver.ingestSample(stream.levels[Math.min(stream.totalSymbols - 1, Math.floor(local / chipMs))]!, time);
  }
  assert.deepEqual(recovered, payload);
});
