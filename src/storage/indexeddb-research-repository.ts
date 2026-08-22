import { requestResult, transactionComplete } from "./database";
import { validateCompletedRun } from "../research/test-protocol";
import type { TestRun } from "../research/test-run";
import { deleteRecord, getRecord, listRecords } from "./indexeddb-helpers";
import type { ResearchRepository } from "./repositories";
import { StoreName } from "./schema";

export class IndexedDbResearchRepository implements ResearchRepository {
  private readonly database: IDBDatabase;
  constructor(database: IDBDatabase) { this.database = database; }

  async put(run: TestRun): Promise<void> {
    if (run.status === "complete") {
      const errors = validateCompletedRun(run);
      if (errors.length > 0) throw new Error(`Completed research record is invalid: ${errors.join("; ")}`);
    }
    const transaction = this.database.transaction(StoreName.TestRuns, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(StoreName.TestRuns);
    const existing = await requestResult(store.get(run.runId)) as TestRun | undefined;
    if (existing?.status === "complete") {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("Completed research records are immutable");
    }
    await requestResult(store.put(run));
    await completion;
  }

  async get(runId: string): Promise<TestRun | null> {
    return getRecord<TestRun>(this.database, StoreName.TestRuns, runId);
  }

  async list(): Promise<TestRun[]> {
    const values = await listRecords<TestRun>(this.database, StoreName.TestRuns);
    return values.sort((left, right) => right.createdAt - left.createdAt);
  }

  async delete(runId: string): Promise<void> {
    await deleteRecord(this.database, StoreName.TestRuns, runId);
  }
}
