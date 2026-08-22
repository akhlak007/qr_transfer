import type { TestRun } from "./test-run";

export function validateCompletedRun(run: TestRun): string[] {
  const errors: string[] = [];
  if (run.status !== "complete") errors.push("Test run is still a draft");
  if (run.completedAt === null) errors.push("Completion time is required");
  if (run.metrics.fileSize < 0) errors.push("File size cannot be negative");
  if (run.metrics.elapsedMs <= 0) errors.push("Elapsed time must be measured");
  if (run.metrics.averageThroughputBytesPerSecond < 0) errors.push("Throughput cannot be negative");
  if (run.evidenceKind === "physical") {
    if (!run.sender.deviceName || !run.receiver.deviceName) errors.push("Physical runs require sender and receiver devices");
    if (run.environment === "unspecified") errors.push("Physical runs require an environment");
  }
  return errors;
}
