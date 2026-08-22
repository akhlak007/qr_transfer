import type { TransferSession } from "./transfer-session";
import { isSha256Hex } from "./integrity";

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
    && Number.isSafeInteger(session.file.size)
    && session.file.size >= 0
    && isSha256Hex(session.file.sha256Hex)
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
  if (!Number.isSafeInteger(candidate.size) || candidate.size < 0) reasons.push("Selected file size is invalid");
  if (!isSha256Hex(candidate.sha256Hex)) reasons.push("Selected file SHA-256 is invalid");
  if (candidate.name !== session.file.name) reasons.push("File name does not match the saved session");
  if (candidate.size !== session.file.size) reasons.push("File size does not match the saved session");
  if (candidate.sha256Hex !== session.file.sha256Hex) reasons.push("SHA-256 does not match the saved session");
  return reasons;
}
