import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateContract, syncContract } from "./import-backend-contract.mjs";

const contract = validateContract(JSON.parse(readFileSync(new URL("../contracts/backend-agent-contract.json",import.meta.url),"utf8")));
assert.match(contract.sourceRevision,/^[a-f0-9]{40}$/,
  "Publishing requires the reviewed backend source commit, not working-tree provenance. Release backend first, then import its exact artifact.");
syncContract(contract,true);
console.log(`Backend source ${contract.sourceRevision}; payload ${contract.contentHash}`);
