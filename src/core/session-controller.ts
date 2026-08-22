import type { ResumeCapability, TransferSession, TransferStatus } from "./transfer-session";
import { canRecoverReceiver, canRestartSender, type ReceiverRecoveryFacts } from "./resume-policy";

const ALLOWED_TRANSITIONS: Record<TransferStatus, ReadonlySet<TransferStatus>> = {
  preparing: new Set(["ready", "failed", "cancelled"]),
  ready: new Set(["active", "cancelled", "failed"]),
  active: new Set(["paused", "recoverable", "complete", "failed", "cancelled"]),
  paused: new Set(["active", "recoverable", "cancelled", "failed"]),
  recoverable: new Set(["active", "complete", "failed", "cancelled"]),
  complete: new Set(),
  failed: new Set(["ready", "recoverable", "cancelled"]),
  cancelled: new Set(),
};

export function transitionSession(
  session: TransferSession,
  status: TransferStatus,
  now = Date.now(),
  receiverRecoveryFacts?: ReceiverRecoveryFacts,
): TransferSession {
  if (session.status === status) return session;
  if (!ALLOWED_TRANSITIONS[session.status].has(status)) {
    throw new Error(`Invalid session transition: ${session.status} -> ${status}`);
  }
  if (status === "recoverable") {
    if (session.direction === "receive" && (!receiverRecoveryFacts || !canRecoverReceiver(receiverRecoveryFacts))) {
      throw new Error("Receiver session lacks exact durable recovery state");
    }
    if (session.direction === "send" && !canRestartSender(session)) {
      throw new Error("Sender session is not eligible for QR restart");
    }
  }
  return {
    ...session,
    status,
    updatedAt: now,
    completedAt: status === "complete" ? now : session.completedAt,
  };
}

export function setResumeCapability(
  session: TransferSession,
  resumeCapability: ResumeCapability,
  now = Date.now(),
  receiverRecoveryFacts?: ReceiverRecoveryFacts,
): TransferSession {
  if (resumeCapability === "replay-receiver" && session.direction !== "receive") {
    throw new Error("Only receiver sessions can replay accepted symbols");
  }
  if (resumeCapability === "replay-receiver" && (!receiverRecoveryFacts || !canRecoverReceiver(receiverRecoveryFacts))) {
    throw new Error("Receiver session lacks exact durable recovery state");
  }
  if (resumeCapability === "restart-sender" && session.direction !== "send") {
    throw new Error("Only sender sessions can restart from a reselected file");
  }
  if (resumeCapability === "restart-sender" && !canRestartSender(session)) {
    throw new Error("Sender session is not eligible for QR restart");
  }
  if (resumeCapability === "complete" && session.status !== "complete") {
    throw new Error("Only complete sessions can have complete resume capability");
  }
  return { ...session, resumeCapability, updatedAt: now };
}
