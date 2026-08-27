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

export interface OpticalTraceLiveSummary {
  capacity: number;
  eventCount: number;
  droppedEvents: number;
  enabled: boolean;
  stageCounts: Record<OpticalTraceStage, number>;
  lastEvent: OpticalTraceEvent | null;
  lastPhysicalObservation: OpticalTraceEvent | null;
}

const TRACE_STAGES: OpticalTraceStage[] = ["PhysicalCameraService", "PhysicalVlcReceiver", "VlcOokReceiver",
  "LiveReceiverRouter", "ApplicationReconstructionService", "VlcTransmitter"];

export class OpticalDiagnosticTrace {
  private readonly capacity: number;
  private events: Array<OpticalTraceEvent | undefined>;
  private start = 0;
  private size = 0;
  private nextSequence = 1;
  private droppedEvents = 0;
  private enabled = false;
  private stageCounts = this.emptyStageCounts();
  private lastEvent: OpticalTraceEvent | null = null;
  private lastPhysicalObservation: OpticalTraceEvent | null = null;

  constructor(capacity = 60_000) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("Trace capacity must be positive");
    this.capacity = capacity;
    this.events = new Array(capacity);
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  isEnabled(): boolean { return this.enabled; }

  record(stage: OpticalTraceStage, event: string, details: OpticalTraceEvent["details"] = {}, timestampMs?: number): void {
    if (!this.enabled) return;
    const monotonic = timestampMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    const entry = { sequence: this.nextSequence++, timestampMs: monotonic, wallClockIso: new Date().toISOString(),
      stage, event, details: this.copyDetails(details) };
    if (this.size === this.capacity) {
      const discarded = this.events[this.start];
      if (discarded) {
        this.stageCounts[discarded.stage]--;
        if (discarded === this.lastPhysicalObservation) this.lastPhysicalObservation = null;
      }
      this.events[this.start] = entry;
      this.start = (this.start + 1) % this.capacity;
      this.droppedEvents++;
    } else {
      this.events[(this.start + this.size) % this.capacity] = entry;
      this.size++;
    }
    this.stageCounts[stage]++;
    this.lastEvent = entry;
    if (stage === "PhysicalVlcReceiver" && event === "camera-observation") this.lastPhysicalObservation = entry;
  }

  clear(): void {
    this.events = new Array(this.capacity);
    this.start = 0;
    this.size = 0;
    this.nextSequence = 1;
    this.droppedEvents = 0;
    this.stageCounts = this.emptyStageCounts();
    this.lastEvent = null;
    this.lastPhysicalObservation = null;
  }

  snapshot(): OpticalTraceExport {
    return { schemaVersion: 1, createdAt: new Date().toISOString(), capacity: this.capacity,
      droppedEvents: this.droppedEvents, events: this.orderedEvents().map((event) => this.copyEvent(event)!) };
  }

  getLiveSummary(): OpticalTraceLiveSummary {
    return { capacity: this.capacity, eventCount: this.size, droppedEvents: this.droppedEvents,
      enabled: this.enabled, stageCounts: { ...this.stageCounts }, lastEvent: this.copyEvent(this.lastEvent),
      lastPhysicalObservation: this.copyEvent(this.lastPhysicalObservation) };
  }

  private orderedEvents(): OpticalTraceEvent[] {
    const ordered = new Array<OpticalTraceEvent>(this.size);
    for (let index = 0; index < this.size; index++) ordered[index] = this.events[(this.start + index) % this.capacity]!;
    return ordered;
  }

  private emptyStageCounts(): Record<OpticalTraceStage, number> {
    return Object.fromEntries(TRACE_STAGES.map((stage) => [stage, 0])) as Record<OpticalTraceStage, number>;
  }

  private copyEvent(event: OpticalTraceEvent | null): OpticalTraceEvent | null {
    return event ? { ...event, details: this.copyDetails(event.details) } : null;
  }

  private copyDetails(details: OpticalTraceEvent["details"]): OpticalTraceEvent["details"] {
    return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
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
