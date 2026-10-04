// Fetches each demo quake from the USGS catalog and writes scenarios.json.
// Run once (or after changing the list): npm run scenarios:build
import { writeFileSync } from "node:fs";
import { scenariosPath } from "../src/scenarios.js";
import type { Scenario } from "../src/types.js";
import { fetchEventById } from "../src/usgs.js";

// Scenario IDs plus a runId must fit in 32 bytes, so keep IDs short.
const SOURCES: (Omit<Scenario, "input"> & { usgsId: string })[] = [
  {
    id: "jp-2025-m48",
    usgsId: "us6000q4y3",
    label: "Small offshore quake, too weak to score (M4.8, 2025)",
    expectedOutcome: "no_payout",
  },
  {
    id: "jp-2013-m69-deep",
    usgsId: "usc000f03a",
    label: "Deep inland quake near Obihiro (M6.9, 107 km, 2013)",
    expectedOutcome: "no_payout",
  },
  {
    id: "jp-2022-m73",
    usgsId: "us6000h519",
    label: "Fukushima offshore quake (M7.3, 2022)",
    expectedOutcome: "payout",
  },
  {
    id: "tohoku-2011-m91",
    usgsId: "official20110311054624120_30",
    label: "Great Tohoku earthquake (M9.1, 2011)",
    expectedOutcome: "payout",
  },
];

const scenarios: Scenario[] = [];
for (const { usgsId, ...rest } of SOURCES) {
  const input = await fetchEventById(usgsId);
  scenarios.push({ ...rest, input });
  console.log(`${rest.id}: M${input.magnitude} ${input.place} (${input.time})`);
}
writeFileSync(scenariosPath, JSON.stringify(scenarios, null, 2) + "\n");
console.log(`Wrote ${scenarios.length} scenarios to ${scenariosPath}`);
