// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { manageDescriptors, directoryDescriptors } from "./descriptors/index.js";
import type { ToolDescriptor } from "./descriptors/types.js";
import type { ToolProfile } from "./instructions.js";

export const workersDirectoryToolNames = [
  "workerkit_about","directory_overview","kits_search","kit_get","kit_app_tools","kit_authoring_guide","kit_vocabulary",
] as const;
export const decisionToolNames = [
  "key_info","account_usage","apps_list","workers_list","worker_get","worker_permissions_get","decision_worker_create",
  "models_list","worker_run","run_get","run_cancel","instruction_get","instruction_set","worker_deploy","deployment_update",
  "kit_install_preview","kit_install","my_kits_list","kits_search","kit_get","kit_app_tools","kit_authoring_guide",
  "support_request_create","worker_timezone_set",
] as const;

// Company Knowledge has its own MCP mount; the fleet profiles carry every other manager tool.
export const knowledgeToolNames = [
  "knowledge_sources","knowledge_search","knowledge_get","knowledge_changes","knowledge_configuration_get","knowledge_configuration_set",
] as const;

export function toolsForProfile(profile:ToolProfile): readonly ToolDescriptor[] {
  if (profile==="directory") return directoryDescriptors;
  const knowledge = manageDescriptors.filter(d=>(knowledgeToolNames as readonly string[]).includes(d.name));
  if (profile==="knowledge") return knowledge;
  const full = [...manageDescriptors.filter(d=>!knowledge.includes(d)), ...directoryDescriptors.filter(d=>(workersDirectoryToolNames as readonly string[]).includes(d.name))];
  return profile==="workers" ? full : full.filter(d=>(decisionToolNames as readonly string[]).includes(d.name));
}
