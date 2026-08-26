export class FinalizationGenerationGuard {
  private generation = 0;

  capture(): number { return this.generation; }
  invalidate(): void { this.generation++; }
  isCurrent(captured: number): boolean { return captured === this.generation; }
}
