// Single-instance guarantee: every descriptor schema is built from THIS zod
// export. Consumers (MCP servers, CLIs) that need to introspect or extend the
// schemas should import z from here rather than depending on zod directly, so
// instanceof checks and schema identity can never split across two copies.
export { z } from "zod";
