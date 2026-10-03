import type { Pipeline } from "./pipeline.js";
import type { QuakeInput } from "./types.js";
import { fetchFeed } from "./usgs.js";

// Polls the USGS live feed (FR-10). A failed poll is logged and skipped; it never
// affects events already being processed.
export class FeedPoller {
  lastPollAt: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly pipeline: Pipeline,
    private readonly feedUrl: string,
    private readonly intervalMs: number,
    private readonly fetch: (url: string) => Promise<QuakeInput[]> = fetchFeed,
  ) {}

  start(): void {
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return; // previous poll still running
    this.polling = true;
    try {
      const inputs = await this.fetch(this.feedUrl);
      this.lastPollAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      // Oldest first, so events are stored in the order they happened.
      for (const input of inputs.reverse()) {
        void this.pipeline.processLive(input);
      }
    } catch (err) {
      console.error(`[poller] feed poll failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.polling = false;
    }
  }
}
