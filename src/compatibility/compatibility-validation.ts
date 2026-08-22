import type { TransportId } from "../core/transport";
import { isMeasuredRun, isPhysicallyVerifiedRun, type TestRun } from "../research/test-run";
import { mobileDirectionOf, type MobileDirection } from "./compatibility-record";

export type CompatibilityStatus = "verified" | "failed" | "not-tested";

export function compatibilityStatus(
  runs: TestRun[],
  direction: MobileDirection,
  transport: TransportId,
): CompatibilityStatus {
  const matching = runs.filter((run) => isMeasuredRun(run) && run.transport === transport && mobileDirectionOf(run) === direction && run.evidenceKind === "physical");
  if (matching.some(isPhysicallyVerifiedRun)) return "verified";
  if (matching.length > 0) return "failed";
  return "not-tested";
}
