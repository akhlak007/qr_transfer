/**
 * TEXT_FLASH_PROTOCOL demo panel (TF6) — Send Text / Receive Text.
 * Uses TF0–TF5 pipeline. Synthetic loopback available; camera receive is
 * experimental UI only — not a physical-camera reliability claim.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyTextFlashDiagnostics,
  TEXT_FLASH_DEFAULT_FRAME_MS,
  type TextFlashDiagnostics,
} from "../transports/text-flash/text-flash-types";
import {
  TextFlashTransmitter,
  type TextFlashTxSnapshot,
} from "../transports/text-flash/text-flash-transmitter";
import { TextFlashReceiver } from "../transports/text-flash/text-flash-receiver";
import {
  createTextFlashPixelBuffer,
  paintTextFlashFrameOnCanvas,
} from "../transports/text-flash/text-flash-renderer";
import { classifyTextFlashFrame } from "../transports/text-flash/text-flash-classifier";
import {
  runTextFlashLoopback,
  type TextFlashPipelineStage,
} from "../transports/text-flash/text-flash-loopback";
import {
  buildTextFlashDemoViewModel,
  type TextFlashUiLabel,
} from "../transports/text-flash/text-flash-demo-model";

const PRESETS = ["HELLO", "TEST", "STATUS OK", "12345"] as const;

function labelClass(label: TextFlashUiLabel): string {
  if (label === "COMPLETE") return "tf-pill ok";
  if (label === "FAILED") return "tf-pill bad";
  if (label === "SENDING" || label === "RECEIVING" || label === "STABLE") return "tf-pill live";
  if (label === "REACQUIRING") return "tf-pill warn";
  return "tf-pill";
}

export const TextFlashDemoPanel: React.FC = () => {
  const [text, setText] = useState("HELLO");
  const [expectedText, setExpectedText] = useState("HELLO");
  const [frameMs, setFrameMs] = useState(TEXT_FLASH_DEFAULT_FRAME_MS);
  const [txSnap, setTxSnap] = useState<TextFlashTxSnapshot | null>(null);
  const [rxDiag, setRxDiag] = useState<TextFlashDiagnostics>(() =>
    emptyTextFlashDiagnostics(),
  );
  const [failureStage, setFailureStage] = useState<TextFlashPipelineStage | null>(null);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const txCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const txRef = useRef<TextFlashTransmitter | null>(null);
  const rxRef = useRef<TextFlashReceiver | null>(null);
  const rafRef = useRef<number>(0);
  const lastUiPush = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const pushRx = useCallback((d: TextFlashDiagnostics, force = false) => {
    const now = performance.now();
    if (!force && now - lastUiPush.current < 80) return;
    lastUiPush.current = now;
    setRxDiag(d);
  }, []);

  useEffect(() => {
    rxRef.current = new TextFlashReceiver({
      frameMs,
      maxBytes: 64,
      expectedText,
    });
    setRxDiag(rxRef.current.getDiagnostics());
  }, [frameMs, expectedText]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      txRef.current?.stop();
    };
  }, []);

  const vm = useMemo(
    () =>
      buildTextFlashDemoViewModel({
        tx: txSnap,
        rx: rxDiag,
        expectedText,
        failureStage,
        failureDetail,
      }),
    [txSnap, rxDiag, expectedText, failureStage, failureDetail],
  );

  const paintTx = useCallback((snap: TextFlashTxSnapshot) => {
    const canvas = txCanvasRef.current;
    const tx = txRef.current;
    if (!canvas || !tx) return;
    if (canvas.width !== 320) {
      canvas.width = 320;
      canvas.height = 320;
    }
    tx.paintOnCanvas(canvas);
    setTxSnap(snap);
  }, []);

  const onStartSend = async () => {
    setError(null);
    setFailureStage(null);
    setFailureDetail(null);
    setExpectedText(text);
    rxRef.current?.reset();
    rxRef.current = new TextFlashReceiver({
      frameMs,
      maxBytes: 64,
      expectedText: text,
    });
    pushRx(rxRef.current.getDiagnostics(), true);

    txRef.current?.stop();
    const tx = new TextFlashTransmitter({
      frameMs,
      width: 320,
      height: 320,
      onFrame: (_buf, snap) => paintTx(snap),
      onStatus: (snap) => setTxSnap(snap),
    });
    txRef.current = tx;
    try {
      await tx.start(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStopSend = () => {
    txRef.current?.stop();
    setTxSnap(txRef.current?.getSnapshot() ?? null);
  };

  const onReset = () => {
    txRef.current?.reset();
    rxRef.current?.reset();
    setTxSnap(txRef.current?.getSnapshot() ?? null);
    pushRx(rxRef.current?.getDiagnostics() ?? emptyTextFlashDiagnostics(), true);
    setFailureStage(null);
    setFailureDetail(null);
    setError(null);
  };

  const onSyntheticLoopback = () => {
    setError(null);
    setExpectedText(text);
    const result = runTextFlashLoopback(text, {
      frameMs,
      expectedText: text,
      channel: { seed: 1, cameraFps: 30, missProbability: 0 },
    });
    setRxDiag(result.diagnostics);
    setFailureStage(result.failureStage === "ok" ? null : result.failureStage);
    setFailureDetail(result.failureDetail);
    setTxSnap({
      status: "COMPLETE",
      text,
      frameIndex: result.channel.plan.steps.length - 1,
      frameCount: result.channel.plan.steps.length,
      phase: "idle",
      kind: "idle",
      byte: null,
      dataIndex: null,
      dwellMs: frameMs,
      progressPercent: 100,
      elapsedMs: result.channel.plan.steps.length * frameMs,
      repeatedByteFrame: false,
      frameStartedAtMs: null,
    });
    // Paint final END then idle on canvas for visual feedback
    const canvas = txCanvasRef.current;
    if (canvas) {
      canvas.width = 320;
      canvas.height = 320;
      paintTextFlashFrameOnCanvas(canvas, { kind: "idle" });
    }
  };

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = async () => {
    setError(null);
    setFailureStage(null);
    setFailureDetail(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);

      rxRef.current = new TextFlashReceiver({
        frameMs,
        maxBytes: 64,
        expectedText,
      });

      const scratch = createTextFlashPixelBuffer(160, 160);
      const preview = previewRef.current;

      const tick = (ts: number) => {
        if (!videoRef.current || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const w = 160;
        const h = 160;
        if (preview) {
          if (preview.width !== w) {
            preview.width = w;
            preview.height = h;
          }
          const ctx = preview.getContext("2d");
          ctx?.drawImage(video, 0, 0, w, h);
          const img = ctx?.getImageData(0, 0, w, h);
          if (img && rxRef.current) {
            scratch.data.set(img.data);
            const classified = classifyTextFlashFrame(scratch);
            const d = rxRef.current.ingestClassification(
              classified.classification,
              ts,
              classified.diagnostics.quality,
            );
            pushRx(d);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stopCamera();
    }
  };

  return (
    <div className="tf-demo">
      <div className="tf-demo-banner">
        TEXT_FLASH_PROTOCOL — demo / workbench only. Not VLC. Synthetic loopback
        proves software path; camera receive is experimental and unverified.
      </div>

      {error && <div className="tf-demo-error">{error}</div>}

      <div className="tf-demo-grid">
        <section className="tf-demo-card">
          <h3>Send Text</h3>
          <div className="tf-row">
            <span className={labelClass(vm.txLabel)}>{vm.txLabel}</span>
            <span className="tf-mono">{vm.txProgress}</span>
          </div>
          <label className="form-label">Message</label>
          <input
            className="form-input"
            value={text}
            maxLength={64}
            onChange={(e) => setText(e.target.value)}
            disabled={txSnap?.status === "SENDING"}
          />
          <div className="tf-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-secondary"
                disabled={txSnap?.status === "SENDING"}
                onClick={() => setText(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="form-label">Dwell (ms)</label>
          <input
            className="form-input"
            type="number"
            min={500}
            max={2000}
            value={frameMs}
            disabled={txSnap?.status === "SENDING"}
            onChange={(e) => setFrameMs(Number(e.target.value) || 750)}
          />
          <div className="tf-actions">
            <button type="button" className="btn btn-primary" onClick={() => void onStartSend()} disabled={txSnap?.status === "SENDING"}>
              Start
            </button>
            <button type="button" className="btn btn-secondary" onClick={onStopSend}>
              Stop
            </button>
            <button type="button" className="btn btn-secondary" onClick={onReset}>
              Reset
            </button>
            <button type="button" className="btn btn-secondary" onClick={onSyntheticLoopback}>
              Synthetic loopback
            </button>
          </div>
          <canvas ref={txCanvasRef} className="tf-canvas" width={320} height={320} />
          <div className="tf-meta tf-mono">
            phase={txSnap?.phase ?? "idle"} frame=
            {txSnap ? `${txSnap.frameIndex + 1}/${txSnap.frameCount}` : "—"}
            {txSnap?.repeatedByteFrame ? " repeatedByte" : ""}
          </div>
        </section>

        <section className="tf-demo-card">
          <h3>Receive Text</h3>
          <div className="tf-row">
            <span className={labelClass(vm.rxLabel)}>{vm.rxLabel}</span>
            <span className="tf-mono">{vm.rxProgress}</span>
          </div>
          <label className="form-label">Expected (workbench)</label>
          <input
            className="form-input"
            value={expectedText}
            onChange={(e) => setExpectedText(e.target.value)}
          />
          <div className="tf-actions">
            {!cameraOn ? (
              <button type="button" className="btn btn-primary" onClick={() => void startCamera()}>
                Start camera
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={stopCamera}>
                Stop camera
              </button>
            )}
          </div>
          <video ref={videoRef} className="tf-video" playsInline muted />
          <canvas ref={previewRef} className="tf-canvas" width={160} height={160} />

          <div className="tf-partial">
            <div className="form-label">Live text</div>
            <div className="tf-live-text tf-mono">{vm.partialText || "—"}</div>
          </div>

          <div className={`tf-compare ${vm.comparison.match ? "ok" : vm.comparison.mismatch ? "bad" : ""}`}>
            <div>
              <span className="form-label">Expected</span>
              <code>{vm.comparison.expected || "—"}</code>
            </div>
            <div>
              <span className="form-label">Received</span>
              <code>{vm.comparison.received || "—"}</code>
            </div>
            <div className="tf-mono">
              {vm.comparison.bytesReceived}/{vm.comparison.bytesExpected} bytes
              {vm.comparison.match
                ? " · MATCH"
                : vm.comparison.mismatch
                  ? " · MISMATCH"
                  : " · pending"}
            </div>
          </div>

          <div className="tf-diag tf-mono">
            <div>lastValid={vm.diagnosticsSummary.lastValidFrame}</div>
            <div>
              bytes={vm.diagnosticsSummary.bytesReceived}/
              {vm.diagnosticsSummary.declaredLength ?? "?"} progress=
              {vm.diagnosticsSummary.progressPercent}%
            </div>
            <div>
              reacq={String(vm.diagnosticsSummary.reacquiring)} dup=
              {vm.diagnosticsSummary.duplicateFrames} inv=
              {vm.diagnosticsSummary.invalidFrames} miss=
              {vm.diagnosticsSummary.missedFrames}
            </div>
            <div>reason={vm.diagnosticsSummary.completionReason ?? "—"}</div>
            {vm.failureStage && (
              <div className="tf-fail-stage">
                stage={vm.failureStage}
                {vm.failureDetail ? ` · ${vm.failureDetail}` : ""}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
