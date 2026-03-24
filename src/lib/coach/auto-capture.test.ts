import { describe, expect, it } from "vitest";
import { detectAutomaticAiContext } from "./auto-capture";

describe("detectAutomaticAiContext", () => {
  it("detects dedicated AI app usage", () => {
    const detection = detectAutomaticAiContext({
      appName: "Cursor",
      windowTitle: "AI risk memo draft",
      workMode: "research",
      opportunity: "",
    });

    expect(detection).toEqual({
      tool: "cursor",
      promptCaptureMode: "window_title",
    });
  });

  it("ignores browser usage entirely", () => {
    const detection = detectAutomaticAiContext({
      appName: "Google Chrome",
      windowTitle: "ChatGPT - AI risk memo draft",
      workMode: "browser",
      opportunity: "",
    });

    expect(detection).toBeNull();
  });
});
