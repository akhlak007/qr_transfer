import type { TestRun } from "./test-run";

export type CapabilityEvidence = "implemented" | "simulated" | "physically-tested" | "not-tested";

export function evidenceStatus(runs: TestRun[]): CapabilityEvidence {
  const completed = runs.filter((run) => run.status === "complete");
  if (completed.some((run) => run.evidenceKind === "physical")) return "physically-tested";
  if (completed.some((run) => run.evidenceKind === "simulated")) return "simulated";
  return "not-tested";
}
