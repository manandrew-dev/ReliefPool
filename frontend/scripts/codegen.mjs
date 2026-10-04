// Generates the Kit client for the ReliefPool program from the committed
// Anchor IDL (docs/api.md section 5). Rerun with `npm run codegen` whenever
// idl/reliefpool.json changes.
//
// The renderer empties its output folder before writing, so it renders into
// a fresh temporary folder and only that folder's contents are copied into
// src/program/generated/.

import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { createFromRoot } from "codama";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const idl = JSON.parse(
  readFileSync(new URL("../../idl/reliefpool.json", import.meta.url), "utf8")
);
const target = fileURLToPath(
  new URL("../src/program/generated", import.meta.url)
);
const scratch = join(mkdtempSync(join(tmpdir(), "reliefpool-codegen-")), "out");

await createFromRoot(rootNodeFromAnchor(idl)).accept(renderVisitor(scratch));

rmSync(target, { recursive: true, force: true });
cpSync(scratch, target, { recursive: true });
rmSync(join(scratch, ".."), { recursive: true, force: true });
