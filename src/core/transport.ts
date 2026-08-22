export const TransportId = {
  QR: "qr",
  VLC: "vlc",
  VisualOFDM: "visual-ofdm",
} as const;

export type TransportId = (typeof TransportId)[keyof typeof TransportId];

export type TransportMaturity = "baseline" | "experimental" | "research-prototype";

export interface TransportDescriptor {
  id: TransportId;
  label: string;
  maturity: TransportMaturity;
  available: boolean;
}

export const TRANSPORTS: Record<TransportId, TransportDescriptor> = {
  [TransportId.QR]: {
    id: TransportId.QR,
    label: "QR Streaming",
    maturity: "baseline",
    available: true,
  },
  [TransportId.VLC]: {
    id: TransportId.VLC,
    label: "Screen-to-Camera VLC",
    maturity: "experimental",
    available: false,
  },
  [TransportId.VisualOFDM]: {
    id: TransportId.VisualOFDM,
    label: "Visual OFDM (Research Prototype)",
    maturity: "research-prototype",
    available: false,
  },
};

export type DecodeOutcome = "decoded" | "no-signal" | "invalid";

export interface OpticalDecodeObservation {
  outcome: DecodeOutcome;
  durationMs: number;
  capturedAt: number;
  bytes?: Uint8Array;
  error?: string;
}

export interface OpticalRenderObservation {
  durationMs: number;
  completedAt: number;
  payloadBytes: number;
}
