import { describe, expect, it } from "vitest";
import { byName, executeTool, z, type PortEdenClient } from "../src/index.js";

describe("GitHub setup discovery", () => {
  it.each(["accounts", "repos", "branches"])("%s is an authenticated bounded read with complete query forwarding", async resource => {
    const descriptor = byName(`app_github_${resource}`)!;
    expect(descriptor.auth).toBe("manager");
    expect(descriptor.annotations?.readOnlyHint).toBe(true);
    const params = z.object(descriptor.schema).parse({ operatorId: "6e6f6f70-0000-4000-8000-000000000001",
      connectionId: 7, repo: "acme/private", q: "brain", page: 2, pageSize: 10, type: "organization" });
    const calls: unknown[] = [];
    const client = { get: async (path: string, opts: unknown) => { calls.push({ path, opts }); return { status: 200, data: {} }; } } as unknown as PortEdenClient;
    await executeTool(client, descriptor, params, { token: "pe_mgr_test" });
    expect(calls).toEqual([{ path: `/api/manage/apps/github/${resource}`, opts: { params, token: "pe_mgr_test", signal: undefined } }]);
    expect(descriptor.description).toContain("discoverAppResources");
  });
  it("validates inputs without accepting provider URLs or unbounded requests", () => {
    const schema = z.object(byName("app_github_branches")!.schema);
    const invalid = [
      { repo: "https://github.com/acme/repo" }, { repo: "acme/../repo" }, { repo: "./repo" }, { repo: "acme/." },
      { repo: "acme/repo\n" }, { repo: "acme\n/repo" }, { repo: "a/b", pageSize: 101 },
      { repo: "a/b", connectionId: -1 }, { repo: "a/b", q: "a\nb" },
    ];
    for (const input of invalid) expect(schema.safeParse(input).success, JSON.stringify(input)).toBe(false);
    expect(schema.parse({ repo: "acme/private" })).toMatchObject({ page: 1, pageSize: 50 });
    expect(z.object(byName("app_github_accounts")!.schema).parse({})).toMatchObject({ pageSize: 20, type: "all" });
  });
  it("teaches explicit installation targets and honest page filtering", () => {
    expect(byName("kit_install")!.schema.githubSelection.description).toContain("Required");
    for (const name of ["app_github_repos", "app_github_branches"])
      expect(byName(name)!.description).toContain("empty result can still have nextPage");
  });
});
