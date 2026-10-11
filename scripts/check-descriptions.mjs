import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allDescriptors, toolsForProfile, instructionsByProfile, guidance, backendContractProvenance, z } from "../dist/index.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { measureSurface } from "./measure-descriptions.mjs";

// This measures a freshly built, transport-neutral descriptor projection. The
// MCP repository separately measures real SDK initialize/tools-list output and
// enforces reviewed growth budgets, including transport metadata.
const uppercaseTerms = {
  API:"API terminology", HTTP:"HTTP protocol", HTTPS:"HTTPS protocol", JSON:"JSON format",
  UTC:"UTC timezone", IANA:"Timezone database", UUID:"UUID identifier", GUID:"GUID identifier",
  URL:"URL format", URLs:"URL format", ISO:"Date format", RFC:"Protocol references",
  MCP:"Model Context Protocol", LLM:"Language model", BYOK:"Billing mode",
  GET:"HTTP method", POST:"HTTP method", PUT:"HTTP method", PATCH:"HTTP method", DELETE:"HTTP method",
  XOR:"Exclusive inputs", AND:"Filter conjunction", OR:"Alternative requirements",
  RUNTIME_NOT_ENABLED:"Runtime gate wire code", OPERATION_NOT_ALLOWED:"Authority wire code",
};
const sharedText = Object.fromEntries(Object.entries(guidance).map(([id,text])=>[`guidance.${id}`,text]));
const surfaces = Object.fromEntries(Object.entries(instructionsByProfile).map(([profile,instructions])=> {
  const tools = toolsForProfile(profile).map(d=>({name:d.name,title:d.title,description:d.description,
    inputSchema:zodToJsonSchema(d.strictInput ? z.object(d.schema).strict() : z.object(d.schema), {target:"jsonSchema7",$refStrategy:"none"}),
    ...(d.outputSchema ? {outputSchema:zodToJsonSchema(z.object(d.outputSchema), {target:"jsonSchema7",$refStrategy:"none"})} : {}),
    annotations:d.annotations,
  }));
  return [profile,measureSurface({tools,instructions},{sharedText,uppercaseTerms})];
}));
const report = {schemaVersion:1,kind:"core-descriptor-projection",provenance:backendContractProvenance,
  tokenizer:{package:"js-tiktoken",version:"1.0.21",encoding:"o200k_base"},
  note:"Fresh core output, excluding MCP transport metadata. Size, duplication and uppercase findings are advisory. Unattributed repetitions require review; they are not automatically redundant.",surfaces};
const baselineIndex = process.argv.indexOf("--baseline");
if (baselineIndex >= 0) {
  const path = process.argv[baselineIndex+1];
  if (!path) throw Error("--baseline requires a prior report path");
  const baseline = JSON.parse(readFileSync(resolve(path),"utf8"));
  if (baseline.kind !== report.kind || baseline.tokenizer?.version !== report.tokenizer.version || baseline.tokenizer?.encoding !== report.tokenizer.encoding)
    throw Error("Baseline must use the same projection and tokenizer; do not compare it to an MCP capture");
  report.deltas = Object.fromEntries(Object.entries(surfaces).map(([profile,current])=> {
    const previous = baseline.surfaces[profile];
    if (!previous) throw Error(`Missing baseline profile: ${profile}`);
    return [profile,Object.fromEntries(["catalogChars","catalogTokens","instructionsChars","instructionsTokens","descriptionChars","inputSchemaChars","parameterDescriptionChars"].map(key=>[key,current[key]-previous[key]]))];
  }));
}
if (process.argv.includes("--json")) console.log(JSON.stringify(report,null,2));
else for (const [profile,r] of Object.entries(surfaces)) console.log(JSON.stringify({profile,projectionTokens:r.catalogTokens,
  instructionsTokens:r.instructionsTokens,descriptionChars:r.descriptionChars,schemaChars:r.inputSchemaChars,
  parameterDescriptionChars:r.parameterDescriptionChars,fourCharEstimate:r.fourCharsPerTokenEstimate,
  oversized:r.oversized,exposureWarnings:r.descriptionExposureWarnings,
  repeatedClauses:r.duplicates.length,attributedRepeatedClauses:r.duplicates.filter(d=>d.owners.length).length,
  uppercaseWarnings:r.shouting.length,...(report.deltas ? {delta:report.deltas[profile]} : {})}));
if (new Set(allDescriptors.map(d=>d.name)).size !== allDescriptors.length) throw Error("Duplicate canonical tool");
