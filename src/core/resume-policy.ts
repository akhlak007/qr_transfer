import type { TransferSession } from "./transfer-session";

export interface ReceiverRecoveryFacts {
  hasExactMetadata: boolean;
  durableAcceptedSymbols: number;
  storageAvailable: boolean;
}

export function canRecoverReceiver(facts: ReceiverRecoveryFacts): boolean {
  return facts.storageAvailable && facts.hasExactMetadata && facts.durableAcceptedSymbols > 0;
}

export function canRestartSender(session: TransferSession): boolean {
  return session.direction === "send"
    && session.transport === "qr"
    && session.file.size >= 0
    && session.file.sha256Hex.length === 64
    && session.status !== "complete"
    && session.status !== "cancelled";
}

export interface ReselectedFileIdentity {
  name: string;
  size: number;
  sha256Hex: string;
}

export function validateReselectedFile(session: TransferSession, candidate: ReselectedFileIdentity): string[] {
  const reasons: string[] = [];
  if (candidate.name !== session.file.name) reasons.push("File name does not match the saved session");
  if (candidate.size !== session.file.size) reasons.push("File size does not match the saved session");
  if (candidate.sha256Hex !== session.file.sha256Hex) reasons.push("SHA-256 does not match the saved session");
  return reasons;
}
