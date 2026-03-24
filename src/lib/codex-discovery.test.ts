import { describe, expect, it } from "vitest";
import { parseCodexSource } from "./codex-discovery";

describe("parseCodexSource", () => {
  it("marks custom claude-control sources as managed top-level threads", () => {
    expect(parseCodexSource('{"custom":"claude-control"}', null)).toEqual({
      label: "claude-control",
      isTopLevel: true,
      isManaged: true,
    });
  });

  it("filters subagent sources even when serialized as JSON", () => {
    expect(
      parseCodexSource(
        '{"subagent":{"thread_spawn":{"parent_thread_id":"thread-1","depth":1,"agent_nickname":"Ada","agent_role":"worker"}}}',
        null,
      ),
    ).toEqual({
      label: "subagent",
      isTopLevel: false,
      isManaged: false,
    });
  });

  it("filters any thread with an agent nickname", () => {
    expect(parseCodexSource("cli", "Ada")).toEqual({
      label: "cli",
      isTopLevel: false,
      isManaged: false,
    });
  });
});
