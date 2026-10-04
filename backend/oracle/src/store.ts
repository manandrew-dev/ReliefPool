import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EventStatus, QuakeEvent } from "./types.js";

export interface EventQuery {
  limit: number;
  status?: EventStatus;
  since?: string;
}

// In-memory events, persisted to a JSON file on every change so a restart mid-demo
// keeps payout signatures (docs/api.md §7).
export class EventStore {
  private events = new Map<string, QuakeEvent>();

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8")) as QuakeEvent[];
      for (const e of saved) this.events.set(e.id, e);
    }
  }

  has(id: string): boolean {
    return this.events.has(id);
  }

  get(id: string): QuakeEvent | undefined {
    return this.events.get(id);
  }

  all(): QuakeEvent[] {
    return [...this.events.values()];
  }

  insert(event: QuakeEvent): void {
    if (this.events.has(event.id)) throw new Error(`Event ${event.id} already stored`);
    this.events.set(event.id, event);
    this.save();
  }

  update(id: string, patch: Partial<QuakeEvent>): QuakeEvent {
    const current = this.events.get(id);
    if (!current) throw new Error(`Event ${id} not found`);
    const next = { ...current, ...patch };
    this.events.set(id, next);
    this.save();
    return next;
  }

  // Newest first by processedAt.
  query({ limit, status, since }: EventQuery): QuakeEvent[] {
    const sinceMs = since ? Date.parse(since) : null;
    return this.all()
      .filter((e) => !status || e.status === status)
      .filter((e) => sinceMs === null || Date.parse(e.processedAt) > sinceMs)
      .sort((a, b) => Date.parse(b.processedAt) - Date.parse(a.processedAt))
      .slice(0, limit);
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    // Write then rename, so a crash mid-write never leaves a truncated file.
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.all(), null, 2));
    renameSync(tmp, this.file);
  }
}
