import { testRunValidationErrors, type TestRun } from "./test-run";

export function validateCompletedRun(run: TestRun): string[] {
  return testRunValidationErrors(run);
}
