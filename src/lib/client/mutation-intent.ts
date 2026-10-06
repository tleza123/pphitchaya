// Keep the same id on a retry after a lost response, so the server receipt prevents duplicate money entries.
export class MutationIntent {
  private pending: { payload: string; requestId: string } | null = null;
  requestId(payload: unknown): string {
    const fingerprint = JSON.stringify(payload);
    if (this.pending?.payload !== fingerprint) this.pending = { payload: fingerprint, requestId: crypto.randomUUID() };
    return this.pending.requestId;
  }
  complete() { this.pending = null; }
}
