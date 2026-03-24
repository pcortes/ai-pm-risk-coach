import { describe, expect, it } from "vitest";
import { detectAutomaticAiContext } from "./auto-capture";

describe("detectAutomaticAiContext", () => {
  it("detects AI tool usage from the active window title", () => {
    const detection = detectAutomaticAiContext({
      appName: "Google Chrome",
      windowTitle: "ChatGPT - AI risk memo draft",
      workMode: "browser",
      opportunity: "",
    });

    expect(detection).toEqual({
      tool: "chatgpt",
      promptCaptureMode: "window_title",
    });
  });

  it("ignores non-AI windows", () => {
    const detection = detectAutomaticAiContext({
      appName: "Google Chrome",
      windowTitle: "Monster Jam Tickets Apr 05, 2026 Oakland, CA | Ticketmaster",
      workMode: "browser",
      opportunity: "",
    });

    expect(detection).toBeNull();
  });
});
