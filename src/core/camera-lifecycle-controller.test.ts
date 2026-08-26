import assert from "node:assert/strict";
import test from "node:test";
import { CameraLifecycleController, type CameraStreamLike } from "./camera-lifecycle-controller";

function fixture() {
  let acquisitions = 0;
  let stopped = 0;
  let cancelled = 0;
  let cleared = 0;
  let revoked = 0;
  let resolve!: (stream: CameraStreamLike) => void;
  const pending = new Promise<CameraStreamLike>((done) => { resolve = done; });
  const video: { srcObject: CameraStreamLike | null } = { srcObject: null };
  const controller = new CameraLifecycleController(video, {
    acquire: () => { acquisitions++; return pending; },
    requestFrame: () => 10,
    cancelFrame: () => { cancelled++; },
    setInterval: () => 20,
    clearInterval: () => { cleared++; },
    revokeObjectUrl: () => { revoked++; },
  });
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] };
  return { controller, video, stream, resolve, counts: () => ({ acquisitions, stopped, cancelled, cleared, revoked }) };
}

test("concurrent starts and reconnects share one camera acquisition", async () => {
  const f = fixture();
  const first = f.controller.start();
  const second = f.controller.start();
  const reconnect = f.controller.reconnect();
  assert.equal(first, second);
  assert.equal(first, reconnect);
  assert.equal(f.counts().acquisitions, 1);
  f.resolve(f.stream);
  await Promise.all([first, second, reconnect]);
  assert.equal(f.video.srcObject, f.stream);
});

test("dispose deterministically cleans camera resources and is idempotent", async () => {
  const f = fixture();
  const started = f.controller.start();
  f.resolve(f.stream);
  await started;
  f.controller.scheduleFrame(() => undefined);
  f.controller.registerInterval(() => undefined, 1000);
  f.controller.registerObjectUrl("blob:test");
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(f.video.srcObject, null);
  assert.deepEqual(f.counts(), { acquisitions: 1, stopped: 1, cancelled: 1, cleared: 1, revoked: 1 });
});

test("a late acquisition after stop is discarded and its tracks are stopped", async () => {
  const f = fixture();
  const started = f.controller.start();
  f.controller.stop();
  f.resolve(f.stream);
  await assert.rejects(started, /Stale camera acquisition/);
  assert.equal(f.counts().stopped, 1);
  assert.equal(f.video.srcObject, null);
});
