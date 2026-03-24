import { describe, expect, it } from "vitest";
import {
  codexLastEventHasError,
  codexRecordsToConversation,
  extractCodexPreview,
  extractCodexTaskSummary,
  hasCodexPendingToolUse,
  isCodexAskingForInput,
  type CodexJsonlRecord,
} from "./codex-reader";

function record(payload: CodexJsonlRecord["payload"]): CodexJsonlRecord {
  return {
    timestamp: "2026-03-23T20:00:00.000Z",
    type: "response_item",
    payload,
  };
}

describe("extractCodexPreview", () => {
  it("tracks the latest user message, assistant text, and tool burst", () => {
    const preview = extractCodexPreview([
      record({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Please fix the dashboard" }],
      }),
      record({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "I'm checking the repo now." }],
      }),
      record({
        type: "function_call",
        name: "exec_command",
        call_id: "call_1",
        arguments: JSON.stringify({ cmd: "npm run lint" }),
      }),
    ]);

    expect(preview.lastUserMessage).toBe("Please fix the dashboard");
    expect(preview.lastAssistantText).toBe("I'm checking the repo now.");
    expect(preview.assistantIsNewer).toBe(true);
    expect(preview.lastTools[0]?.name).toBe("exec_command");
    expect(preview.lastTools[0]?.input).toContain("npm run lint");
  });
});

describe("Codex status helpers", () => {
  it("detects pending tool calls until output arrives", () => {
    expect(
      hasCodexPendingToolUse([
        record({
          type: "function_call",
          name: "exec_command",
          call_id: "call_1",
          arguments: JSON.stringify({ cmd: "npm test" }),
        }),
      ]),
    ).toBe(true);

    expect(
      hasCodexPendingToolUse([
        record({
          type: "function_call",
          name: "exec_command",
          call_id: "call_1",
          arguments: JSON.stringify({ cmd: "npm test" }),
        }),
        record({
          type: "function_call_output",
          call_id: "call_1",
          output: "Process exited with code 0",
        }),
      ]),
    ).toBe(false);
  });

  it("detects direct operator prompts and recent tool errors", () => {
    expect(
      isCodexAskingForInput([
        record({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Do you want me to keep the scope tight?" }],
        }),
      ]),
    ).toBe(true);

    expect(
      codexLastEventHasError([
        record({
          type: "function_call_output",
          call_id: "call_1",
          output: "Process exited with code 1",
        }),
      ]),
    ).toBe(true);
  });
});

describe("codexRecordsToConversation", () => {
  it("attaches function calls to the latest assistant turn", () => {
    const conversation = codexRecordsToConversation([
      record({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Run the test suite" }],
      }),
      record({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "I’m running it now." }],
      }),
      record({
        type: "function_call",
        name: "exec_command",
        call_id: "call_1",
        arguments: JSON.stringify({ cmd: "npm test" }),
      }),
    ]);

    expect(conversation).toHaveLength(2);
    expect(conversation[1]?.toolUses[0]?.name).toBe("exec_command");
    expect(conversation[1]?.toolUses[0]?.input).toEqual({ cmd: "npm test" });
  });
});

describe("extractCodexTaskSummary", () => {
  it("builds a prompt-based task summary from thread metadata", () => {
    const summary = extractCodexTaskSummary(
      "Review the desktop roadmap and add Codex support",
      "Review the desktop roadmap and add Codex support with minimal UI churn.",
    );

    expect(summary?.source).toBe("prompt");
    expect(summary?.title).toContain("Review the desktop roadmap");
  });
});
