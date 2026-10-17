import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const localBundle = resolve(root, "contracts/backend-agent-contract.json");
const header = "// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.\n";
const allowed = new Set([
  "descriptors/actions.ts", "descriptors/app-discovery.ts", "descriptors/decision-authoring.ts",
  "descriptors/decision-receipt.ts", "descriptors/directory.ts", "descriptors/index.ts",
  "descriptors/manage.ts", "descriptors/onboarding.ts", "descriptors/quality.ts", "descriptors/support.ts", "descriptors/types.ts",
  "guidance.ts", "guidance-coverage.ts", "text-audit.ts", "instructions.ts", "profiles.ts", "scopes.ts", "zod.ts", "redact.ts",
]);

export function validateContract(contract) {
  const { schemaVersion, sourceRepository, contractVersion, sourceRevision, contentHash, ...payload } = contract;
  if (schemaVersion !== 2 || sourceRepository !== "workerkit-backend" || !contractVersion || !sourceRevision)
    throw Error("Unsupported backend contract or missing provenance");
  if (createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== contentHash)
    throw Error("Backend contract content hash mismatch");
  const names = Object.keys(payload.files ?? {});
  if (names.length !== allowed.size || names.some(name => !allowed.has(name)))
    throw Error("Unexpected backend source inventory; review importer paths before accepting new modules");
  if (Object.values(payload.files).some(source => typeof source !== "string")) throw Error("Invalid backend module");
  return contract;
}

export function syncContract(contract, check = false) {
  validateContract(contract); // Validate everything before writing any file.
  const {sourceRepository, contractVersion, sourceRevision, contentHash} = contract;
  const sources = { ...contract.files, "contract-provenance.ts":
    `export const backendContractProvenance = ${JSON.stringify({sourceRepository, contractVersion, sourceRevision, contentHash}, null, 2)} as const;\n` };
  for (const [name, source] of Object.entries(sources)) {
    const path = resolve(root, "src", name);
    const expected = header + source;
    if (check) {
      if (readFileSync(path, "utf8").replaceAll("\r\n", "\n") !== expected)
        throw Error(`Generated source differs from backend: ${name}`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, expected);
    }
  }
  if (!check) {
    mkdirSync(dirname(localBundle), { recursive: true });
    writeFileSync(localBundle, JSON.stringify(contract, null, 2) + "\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const input = check ? localBundle : process.argv[2];
  if (!input) throw Error("Usage: node scripts/import-backend-contract.mjs <backend/Data/AgentContract.json> | --check");
  syncContract(JSON.parse(readFileSync(input, "utf8")), check);
  // Build/prepack may run under npm pack --json; keep its stdout machine-readable.
  console.error(check ? "Core matches its pinned backend contract." : "Imported backend agent contract.");
}
