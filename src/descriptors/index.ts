export {
  CREATE,
  DELETE,
  READ_ONLY,
  TRIGGER,
  UPDATE,
} from "./types.js";
export type { HttpMethod, ToolAnnotations, ToolDescriptor } from "./types.js";

export { manageDescriptors } from "./manage.js";
export {
  directoryDescriptors,
  kitDetailData,
  kitDetailFooter,
  kitListData,
  listFooter,
  publisherPageData,
  publisherPageFooter,
} from "./directory.js";

import type { ToolDescriptor } from "./types.js";
import { manageDescriptors } from "./manage.js";
import { directoryDescriptors } from "./directory.js";

/** Every descriptor this package ships — 79 manager + 9 anonymous. */
export const allDescriptors: readonly ToolDescriptor[] = [
  ...manageDescriptors,
  ...directoryDescriptors,
];

const byNameIndex = new Map(allDescriptors.map((d) => [d.name, d]));

/** Look a descriptor up by its tool name. */
export function byName(name: string): ToolDescriptor | undefined {
  return byNameIndex.get(name);
}
