export type OpticalTraceStage = "PhysicalCameraService" | "PhysicalVlcReceiver"
  | "VlcOokReceiver" | "LiveReceiverRouter" | "ApplicationReconstructionService" | "VlcTransmitter";

export interface OpticalTraceEvent {
  sequence: number;
  timestampMs: number;
  wallClockIso: string;
  stage: OpticalTraceStage;
  event: string;
  details: Record<string, string | number | boolean | null | number[]>;
}

export interface OpticalTraceExport {
  schemaVersion: 1;
  createdAt: string;
  capacity: number;
  droppedEvents: number;
  events: OpticalTraceEvent[];
}

export class OpticalDiagnosticTrace {
  private readonly capacity: number;
  private events: OpticalTraceEvent[] = [];
  private nextSequence = 1;
  private droppedEvents = 0;
  private enabled = false;

  constructor(capacity = 60_000) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("Trace capacity must be positive");
    this.capacity = capacity;
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  isEnabled(): boolean { return this.enabled; }

  record(stage: OpticalTraceStage, event: string, details: OpticalTraceEvent["details"] = {}, timestampMs?: number): void {
    if (!this.enabled) return;
    const monotonic = timestampMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    this.events.push({ sequence: this.nextSequence++, timestampMs: monotonic, wallClockIso: new Date().toISOString(), stage, event, details });
    if (this.events.length > this.capacity) {
      this.events.shift();
      this.droppedEvents++;
    }
  }

  clear(): void {
    this.events = [];
    this.nextSequence = 1;
    this.droppedEvents = 0;
  }

  snapshot(): OpticalTraceExport {
    return { schemaVersion: 1, createdAt: new Date().toISOString(), capacity: this.capacity,
      droppedEvents: this.droppedEvents, events: this.events.map((event) => ({ ...event, details: { ...event.details } })) };
  }
}

export const opticalDiagnosticTrace = new OpticalDiagnosticTrace();

export function downloadOpticalTrace(fileName = `vlc-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`): void {
  const json = JSON.stringify(opticalDiagnosticTrace.snapshot(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
