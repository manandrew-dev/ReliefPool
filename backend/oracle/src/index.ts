import { createApp } from "./app.js";
import { MockChain, type Chain } from "./chain.js";
import { HttpClassifier, MockClassifier } from "./classifier.js";
import { loadConfig } from "./config.js";
import { Pipeline } from "./pipeline.js";
import { FeedPoller } from "./poller.js";
import { loadScenarios } from "./scenarios.js";
import { EventStore } from "./store.js";

const config = loadConfig();

function createChain(): Chain {
  if (config.mockChain) {
    return new MockChain({
      threshold: config.mockThreshold,
      payoutLamports: config.mockPayoutLamports,
      confirmMs: config.mockConfirmMs,
    });
  }
  throw new Error("MOCK_CHAIN=false needs the Anchor client, which waits on the program IDL.");
}

const store = new EventStore(config.dataFile);
const classifier = config.mockClassifier
  ? new MockClassifier()
  : new HttpClassifier(config.classifierUrl);
const chain = createChain();
const pipeline = new Pipeline({
  store,
  classifier,
  chain,
  bounds: config.region.bounds,
  minMagnitude: config.minMagnitude,
  defaultThreshold: config.mockThreshold,
});
const poller = new FeedPoller(pipeline, config.usgsFeedUrl, config.pollIntervalMs);

await pipeline.recover();

const app = createApp({
  config,
  store,
  pipeline,
  classifier,
  chain,
  scenarios: loadScenarios(),
  lastFeedPollAt: () => poller.lastPollAt,
});

app.listen(config.port, () => {
  console.log(`[oracle] http://localhost:${config.port}/api`);
  console.log(
    `[oracle] classifier=${config.mockClassifier ? "mock" : config.classifierUrl} ` +
      `chain=${config.mockChain ? "mock" : config.rpcUrl} region="${config.region.name}"`,
  );
  if (config.pollEnabled) poller.start();
  else console.log("[oracle] live polling disabled (POLL_ENABLED=false)");
});
