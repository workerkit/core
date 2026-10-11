// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
/** Describes authorization; only the backend enforces it. */
export const managerScopes = [
  "readWorkers", "readRuns", "runWorkers", "manageMemory", "manageSchedules",
  "manageInstructions", "manageState", "installKits", "manageDeliveries", "manageBudgets",
  "createWorkers", "publishKits", "manageConnections", "manageDeployments", "deleteWorkers",
  "readWallet", "requestWalletTopUp", "discoverAppResources", "invokeActions",
] as const;
export type ManagerScope = typeof managerScopes[number];
export type ScopeRequirement =
  | { kind: "scope"; scope: ManagerScope }
  | { kind: "all" | "any"; requirements: readonly ScopeRequirement[] }
  | { kind: "conditional"; field: string; test: "present" | "true"; requirement: ScopeRequirement }
  | { kind: "ownedCheckout"; scope: "requestWalletTopUp" };

const groups: Partial<Record<ManagerScope, readonly string[]>> = {
  readWorkers: ["workers_list","worker_get","fleet_health","account_usage","memory_get","schedules_list","delivery_list","delivery_channels","instruction_get","instruction_versions","instruction_version_get","models_list","deployments_list","deployment_get","worker_permissions_get","publisher_get_mine","my_kits_list","kit_scan_get","apps_list","model_keys_list","mcp_servers_list","mcp_server_get","action_worker_options","worker_tools"],
  readRuns: ["worker_runs","runs_feed","fleet_pulse","run_get","run_events","run_transcript","run_question"],
  runWorkers: ["worker_run","run_bulk","run_answer","run_cancel"],
  manageMemory: ["memory_add","memory_update","memory_delete","run_clear_digest","run_score"],
  manageSchedules: ["worker_timezone_set","schedule_create","schedule_update","schedule_delete"],
  manageInstructions: ["instruction_set","instruction_restore","worker_decision_set"],
  manageState: ["worker_set_enabled"],
  installKits: ["kit_install_preview"],
  manageDeliveries: ["delivery_create","delivery_update","delivery_secret_rotate","delivery_delete"],
  manageBudgets: ["budget_get","budget_set","fleet_budget_get","fleet_budget_set"],
  createWorkers: ["action_worker_create","worker_clone_preview","worker_clone","worker_clone_bulk"],
  publishKits: ["publisher_set","kit_validate","kit_publish","kit_update","kit_replace","kit_unpublish","kit_relist","kit_make_private","kit_delete"],
  manageConnections: ["app_connect","app_disconnect","model_key_set","model_key_delete","mcp_server_create","mcp_server_discover","mcp_server_set_tools","mcp_server_delete"],
  manageDeployments: ["worker_deploy","deployment_update","worker_undeploy"],
  deleteWorkers: ["worker_delete"],
  readWallet: ["wallet_get"],
  requestWalletTopUp: ["wallet_checkout_create"],
  discoverAppResources: ["app_slack_workspaces","app_slack_conversations","app_github_accounts","app_github_repos","app_github_branches"],
  invokeActions: ["worker_tool_call","worker_tool_invocation"],
};
const requirements: Record<string, ScopeRequirement | null> = {
  key_info:null, onboarding_get:null, support_request_create:null,
  workerkit_about:null, directory_overview:null, kits_search:null, kit_get:null,
  publisher_get:null, kit_app_tools:null, kit_authoring_guide:null, kit_vocabulary:null,
};
for (const [scope,names] of Object.entries(groups)) for (const name of names) {
  if (name in requirements) throw new Error("Duplicate scope declaration: " + name);
  requirements[name] = {kind:"scope",scope:scope as ManagerScope};
}
const withDeployment = (scope: ManagerScope, settingsImplyDeploy = false): ScopeRequirement => ({
  kind:"all",requirements:[
    {kind:"scope",scope},
    {kind:"conditional",field:"deploy",test:"true",requirement:{kind:"scope",scope:"manageDeployments"}},
    ...(settingsImplyDeploy ? [{kind:"conditional" as const,field:"deployment",test:"present" as const,requirement:{kind:"scope" as const,scope:"manageDeployments" as const}}] : []),
  ],
});
requirements.kit_install = withDeployment("installKits", true);
requirements.decision_worker_create = withDeployment("createWorkers");
requirements.wallet_checkout_get = {kind:"any",requirements:[
  {kind:"scope",scope:"readWallet"},
  {kind:"ownedCheckout",scope:"requestWalletTopUp"},
]};
export const toolScopeRequirements: Readonly<Record<string, ScopeRequirement | null>> = Object.freeze(requirements);

export function scopeRequirementFor(name:string): ScopeRequirement | null {
  if (!(name in toolScopeRequirements)) throw new Error("Missing scope contract: " + name);
  return toolScopeRequirements[name];
}
function scopePhrase(requirement:ScopeRequirement):string {
  switch(requirement.kind) {
    case "scope": return requirement.scope;
    case "ownedCheckout": return requirement.scope + " only for a checkout created by this credential";
    case "conditional": return scopePhrase(requirement.requirement) + (requirement.test==="true" ? " when " + requirement.field + ":true" : " when " + requirement.field + " is supplied");
    case "all": return requirement.requirements.map(scopePhrase).join("; also ");
    case "any": return requirement.requirements.map(scopePhrase).join(", or ");
  }
}
export function renderScopeRequirement(requirement:ScopeRequirement|null,anonymous=false):string {
  if (anonymous) return "";
  return requirement ? "Requires " + scopePhrase(requirement) + "." : "No additional scope required.";
}
