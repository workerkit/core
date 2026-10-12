// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { allDescriptors, byName } from "./descriptors/index.js";
import { manageTextFragments } from "./descriptors/manage.js";
import { githubPagingText } from "./descriptors/app-discovery.js";
import { guidance, workerCreationTimezoneHint, runModelHint } from "./guidance.js";

/** Advisory reporting policy; never truncate or remove text to meet these values. */
const complexTools = new Set(["worker_run", "kit_install", "kit_install_preview", "kit_publish", "kit_validate", "delivery_create", "worker_deploy", "mcp_server_create"]);
export const textAuditPolicy = {
  minimumRepeatedClauseChars: 120,
  // Plain operations have up to two inputs; 3+ inputs use the multi-parameter
  // guide, except the eight explicitly reviewed complex operations above.
  descriptionGuidance: Object.fromEntries(allDescriptors.map(d => {
    const category = complexTools.has(d.name) ? "complex" : Object.keys(d.schema).length > 2 ? "multi" : "plain";
    return [d.name, { category, chars: category === "complex" ? 1200 : category === "multi" ? 700 : 500 }];
  })),
  uppercaseTerms: {
    API:"API terminology", HTTP:"HTTP protocol", HTTPS:"HTTPS protocol", JSON:"JSON format",
    UTC:"UTC timezone", IANA:"Timezone database", UUID:"UUID identifier", GUID:"GUID identifier",
    URL:"URL format", URLs:"URL format", ISO:"Date format", RFC:"Protocol references",
    MCP:"Model Context Protocol", LLM:"Language model", BYOK:"Billing mode",
    GET:"HTTP method", POST:"HTTP method", PUT:"HTTP method", PATCH:"HTTP method", DELETE:"HTTP method",
    XOR:"Exclusive inputs", AND:"Filter conjunction", OR:"Alternative requirements",
    RUNTIME_NOT_ENABLED:"Runtime gate wire code", OPERATION_NOT_ALLOWED:"Authority wire code",
  },
} as const;

export interface ReviewedTextFragment {
  text: string;
  ruleId: string;
  locations: readonly string[];
  reason: string;
}
const fields = (tools: string[], field: string) => tools.map(t=>`${t}.properties.${field}`);
const param = (tool: string, field: string): string => {
  const text = byName(tool)?.schema[field]?.description;
  if (!text) throw Error(`Missing reviewed parameter: ${tool}.${field}`);
  return text;
};
const fragment = (text: string, ruleId: string, locations: string[], reason: string): ReviewedTextFragment =>
  ({text:text.trim(),ruleId,locations,reason});
const listing = ["kit_publish","kit_replace","kit_update","kit_validate"];
const authored = ["kit_publish","kit_replace","kit_validate"];
const schedules = ["schedule_create","schedule_update"];
const clones = ["worker_clone","worker_clone_bulk","worker_clone_preview"];
const delivery = ["delivery_create","delivery_update"];

// Each value references its actual canonical constant or shared schema. Reasons
// apply only at these reviewed destinations; an extra destination needs review.
export const reviewedTextFragments: Readonly<Record<string, ReviewedTextFragment>> = {
  "schema.kit.appDescriptions": fragment(param("kit_publish","appDescriptions"),"KIT-01",fields(listing,"appDescriptions"),"Pinned-app notes must describe granted operations; each mutation can be discovered independently."),
  "schema.delivery.target": fragment(param("delivery_create","target"),"DELIVERY-01",fields(delivery,"target"),"Create and update each need channel-specific shape and mutual exclusions before a write."),
  "schema.classifier.profile": fragment(param("worker_run","decisionProfileId"),"DECISION-01",[...fields(["worker_run","worker_deploy","deployment_update"],"decisionProfileId"),"run_bulk.properties.workers.items.properties.decisionProfileId"],"Classifier selection and funding differ from the language model on every supplied-field path."),
  "schema.kit.content": fragment(param("kit_publish","content"),"KIT-01",fields(authored,"content"),"Opaque content needs its guide prerequisite, kind rules and exclusions on every authoring entry point."),
  "schema.kit.protection": fragment(param("kit_publish","isProtected"),"PROTECTED-01",fields(listing,"isProtected"),"The disclosure choice affects installed workers and withheld publisher content."),
  "guidance.spendCap": fragment(guidance.spendCap,"RECEIPT-01",["worker_run","run_get","run_bulk"],"A receipt alone does not identify the spend ceiling; each direct receipt path needs the distinction."),
  "schema.kit.visibility": fragment(param("kit_publish","visibility"),"KIT-01",fields(authored,"visibility"),"Private/public changes scan and installation behavior before publication."),
  "guidance.scores": fragment(manageTextFragments.score,"SCORE-01",["run_get","worker_runs","run_score"],"Null is not zero and human scoring overrides self-report wherever scores are read or written."),
  "schema.clone.instruction": fragment(param("worker_clone","includeInstruction"),"PROTECTED-01",[...fields(["worker_clone","worker_clone_preview"],"includeInstruction"),"worker_clone_bulk.properties.workers.items.properties.includeInstruction"],"Protected instructions require an explicit exclusion for preview, single and bulk clone."),
  "guidance.clone": fragment(manageTextFragments.clone,"DELIVERY-01",clones,"Copying rules, memory, schedules, delivery and budgets has consequences on every clone path."),
  "schema.schedule.type": fragment(manageTextFragments.scheduleType,"DELIVERY-01",[...schedules,...fields(schedules,"scheduleType")],"Cross-field type requirements and future/DST semantics are not all encoded in the optional-field schema."),
  "guidance.schedule.gates": fragment(manageTextFragments.scheduleGate,"DELIVERY-01",schedules,"Both schedule mutations can hit cadence/count plan walls with different remedies."),
  "schema.app.provider": fragment(param("app_connect","provider"),"AUTH-01",fields(["app_connect","app_disconnect"],"provider"),"Connection and disconnection require the exact provider/MCP namespace."),
  "guidance.budget.window": fragment(manageTextFragments.budgetWindow,"FLEET-01",["budget_get","budget_set"],"Dollar windows and local run-count windows differ on both read and update."),
  "guidance.github.paging": fragment(githubPagingText,"EVIDENCE-01",["app_github_repos","app_github_branches"],"Page filtering can return empty nonterminal pages; failures do not all mean reconnect."),
  "guidance.schedule.overlap": fragment(manageTextFragments.scheduleOverlap,"DELIVERY-01",schedules,"Schedule non-overlap differs from on-demand plan concurrency."),
  "schema.delivery.condition": fragment(param("delivery_create","condition"),"DELIVERY-01",fields(delivery,"condition"),"Condition values have outcome-specific routing including webhook-only Skipped."),
  "schema.worker.creationTimezone": fragment(workerCreationTimezoneHint,"SETTINGS-01",fields(["action_worker_create","decision_worker_create"],"timeZoneId"),"Both creation flows must ask the creator and explain the UTC default."),
  "schema.run.model": fragment(runModelHint,"MONEY-01",["worker_run.properties.modelSlug","run_bulk.properties.workers.items.properties.modelSlug"],"A per-run override does not edit the saved deployment, in single or bulk execution."),
};
