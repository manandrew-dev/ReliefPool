import { createApp } from "./app.js";
import { MockChain, type Chain } from "./chain.js";
import { HttpClassifier, MockClassifier } from "./classifier.js";
import { loadConfig } from "./config.js";
import { Pipeline } from "./pipeline.js";
import { FeedPoller } from "./poller.js";
import { loadScenarios } from "./scenarios.js";
import { SolanaChain, checkIdl, loadIdl, loadKeypair } from "./solana.js";
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
  if (!config.poolAddress) throw new Error("MOCK_CHAIN=false needs POOL_ADDRESS.");
  const idl = loadIdl(config.idlPath);
  const problems = checkIdl(idl);
  if (problems.length) {
    throw new Error(`The IDL at ${config.idlPath} does not match docs/api.md §5:\n- ${problems.join("\n- ")}`);
  }
  const chain = new SolanaChain({
    rpcUrl: config.rpcUrl,
    idl,
    poolAddress: config.poolAddress,
    oracle: loadKeypair(config.oracleKeypairPath),
  });
  const programId = chain.programId.toBase58();
  const vault = chain.vaultAddress.toBase58();
  if (config.programId && config.programId !== programId) {
    throw new Error(`PROGRAM_ID ${config.programId} does not match the IDL address ${programId}.`);
  }
  if (config.vaultAddress && config.vaultAddress !== vault) {
    throw new Error(`VAULT_ADDRESS ${config.vaultAddress} is not the vault PDA of the pool (${vault}).`);
  }
  // GET /pool serves these; fill them in when .env leaves them out.
  config.programId = programId;
  config.vaultAddress = vault;
  return chain;
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
