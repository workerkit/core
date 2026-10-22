import { describe, expect, it } from "vitest";
import { byName, instructionsByProfile } from "../src/index.js";

describe("temporary public kit restrictions", () => {
  it.each(["kit_validate", "kit_publish", "kit_replace", "kit_relist"])("teaches the pause on %s", name => {
    expect(byName(name)?.description).toContain("Public kit publishing is temporarily disabled");
    expect(byName(name)?.description).toContain("visibility:'private'");
  });

  it("keeps visibility choices compatible and explains the omitted default", () => {
    const visibility = byName("kit_publish")!.schema.visibility;
    expect(visibility?.safeParse("private").success).toBe(true);
    expect(visibility?.description).toContain("omitted visibility requests public and is refused");
    expect(instructionsByProfile.workers).toContain("Public publishing, promotion and relisting are paused");
  });

  it.each(["kits_search", "publisher_get"])("explains hidden public authorship on %s", name => {
    expect(byName(name)?.description).toContain("publisherName is empty");
    expect(byName(name)?.description).toContain("Public publisher profiles return 404");
  });
});
