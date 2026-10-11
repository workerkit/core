import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getEncoding } from "js-tiktoken";

const encoder = getEncoding("o200k_base");
const complex = new Set(["worker_run", "kit_install", "kit_install_preview", "kit_publish", "kit_validate", "delivery_create", "worker_deploy", "mcp_server_create"]);

/** Analyze a captured tools/list + initialize payload, never a token billing estimate. */
export function measureSurface(surface, { sharedText = {}, uppercaseTerms = {} } = {}) {
  if (!Array.isArray(surface.tools) || typeof surface.instructions !== "string") {
    throw new Error("Expected {tools: [...], instructions: string}");
  }
  const names = surface.tools.map(t => t.name);
  if (new Set(names).size !== names.length) throw new Error("Duplicate advertised tool name");
  const parameterTexts = [];
  function visit(value, location) {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, location + "[" + i + "]"));
    if (!value || typeof value !== "object") return;
    if (typeof value.description === "string") parameterTexts.push({location, text: value.description});
    for (const [key, child] of Object.entries(value)) {
      if (key !== "description") visit(child, location + "." + key);
    }
  }
  const rows = surface.tools.map(tool => {
    if (!tool.name || typeof tool.description !== "string" || !tool.inputSchema) throw new Error("Incomplete tool definition");
    const firstParameter = parameterTexts.length;
    visit(tool.inputSchema, tool.name);
    const serialized = JSON.stringify(tool);
    return {
      name: tool.name,
      definitionChars: serialized.length,
      definitionTokens: encoder.encode(serialized).length,
      descriptionChars: tool.description.length,
      inputSchemaChars: JSON.stringify(tool.inputSchema).length,
      parameterDescriptionChars: parameterTexts.slice(firstParameter).reduce((n,p)=>n+p.text.length,0),
    };
  });
  const spans = new Map();
  const texts = [...surface.tools.map(t=>({location:t.name, text:t.description})), ...parameterTexts];
  for (const {location,text} of texts) {
    // Exact long clauses, reported as advisory candidates rather than semantic duplication.
    for (const span of text.split(/(?<=[.!?])\s+/).filter(s=>s.length>=120)) {
      const locations = spans.get(span) ?? new Set();
      locations.add(location); spans.set(span, locations);
    }
  }
  const duplicates = [...spans].filter(([,locations])=>locations.size>1)
    .map(([text,locations])=>({text,locations:[...locations].sort(),repeatedChars:text.length*(locations.size-1),
      owners: Object.entries(sharedText).filter(([,value])=>value.includes(text)).map(([id])=>id),
    }))
    .sort((a,b)=>b.repeatedChars-a.repeatedChars);
  const shouting = texts.flatMap(({location,text}) => [...new Set(text.match(/\b[A-Z][A-Z_]{2,}\b/g) ?? [])]
    .filter(word=>!Object.hasOwn(uppercaseTerms,word)).map(word=>({location,word})));
  const catalog = JSON.stringify({tools:surface.tools});
  return {
    toolCount: rows.length,
    catalogChars: catalog.length,
    catalogTokens: encoder.encode(catalog).length,
    instructionsChars: surface.instructions.length,
    instructionsTokens: encoder.encode(surface.instructions).length,
    combinedTokens: encoder.encode(JSON.stringify(surface)).length,
    fourCharsPerTokenEstimate: Math.ceil(catalog.length/4),
    descriptionChars: rows.reduce((n,r)=>n+r.descriptionChars,0),
    inputSchemaChars: rows.reduce((n,r)=>n+r.inputSchemaChars,0),
    parameterDescriptionChars: rows.reduce((n,r)=>n+r.parameterDescriptionChars,0),
    note: "Parameter-description characters are already included in inputSchemaChars. Token counts describe serialized metadata, not billed or model-visible tokens.",
    oversized: rows.filter(r=>r.descriptionChars>2*(complex.has(r.name)?1200:700)).map(r=>({name:r.name,chars:r.descriptionChars})),
    duplicates,
    shouting,
    descriptionExposureWarnings: rows.filter(r=>r.descriptionChars>2048).map(r=>({name:r.name,chars:r.descriptionChars,
      note:"Verify the supported client's description exposure; length alone does not prove truncation."})),
    tools: rows,
  };
}

export function measureCapture(capture) {
  if (!capture.surfaces || Object.keys(capture.surfaces).length===0) throw new Error("No captured surfaces");
  return {
    schemaVersion:1,
    tokenizer:{package:"js-tiktoken",version:"1.0.21",encoding:"o200k_base"},
    provenance:capture.provenance,
    surfaces:Object.fromEntries(Object.entries(capture.surfaces).map(([name,surface])=>[name,measureSurface(surface)])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input,output]=process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: node scripts/measure-descriptions.mjs <capture.json> <report.json>");
  const report=measureCapture(JSON.parse(readFileSync(input,"utf8")));
  writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.surfaces).map(([name,s])=>[name,{
    tools:s.toolCount,catalogTokens:s.catalogTokens,instructionTokens:s.instructionsTokens,
    catalogChars:s.catalogChars,longRepeatedClauses:s.duplicates.length,oversized:s.oversized.length,
  }])),null,2));
}
