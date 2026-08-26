import type { SoftwareOpticalIntegrationResult } from "./software-optical-integration";

export class VerificationEvidenceController {
  private generation = 0;
  private results: readonly SoftwareOpticalIntegrationResult[] = Object.freeze([]);

  async execute(runner: () => Promise<SoftwareOpticalIntegrationResult[]>): Promise<readonly SoftwareOpticalIntegrationResult[]> {
    const generation = ++this.generation;
    const completed = await runner();
    if (generation !== this.generation) return this.results;
    this.results = Object.freeze([...completed]);
    return this.results;
  }

  getResults(): readonly SoftwareOpticalIntegrationResult[] { return this.results; }
  invalidate(): void { this.generation++; }
}
