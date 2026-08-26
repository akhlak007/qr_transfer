import test from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../../core/transport";
import { RendererRegistry } from "./renderer-registry";
import type { OpticalRenderer } from "./optical-renderer";

const stub = (id: TransportId): OpticalRenderer => ({
  id,
  async render() {
    return { durationMs: 0, diagnostics: {
      activeRenderer: id,
      modulationType: "test",
      symbolRate: 1,
      frameSequence: 0,
      transportPipeline: "test",
    } };
  },
});

test("renderer registry resolves protocol-specific renderers without fallback", () => {
  const registry = new RendererRegistry()
    .register(stub(TransportId.QR))
    .register(stub(TransportId.VLC))
    .register(stub(TransportId.VisualOFDM));
  assert.equal(registry.get(TransportId.QR).id, TransportId.QR);
  assert.equal(registry.get(TransportId.VLC).id, TransportId.VLC);
  assert.equal(registry.get(TransportId.VisualOFDM).id, TransportId.VisualOFDM);
  assert.throws(() => registry.get("missing" as TransportId), /No optical renderer/);
});
