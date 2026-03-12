import { describe, expect, it } from "vitest";
import { parseCodexStudioResult } from "./codexStudioResult";

describe("parseCodexStudioResult", () => {
  it("parses a done trailer with a markdown file link", () => {
    expect(
      parseCodexStudioResult(
        [
          "Finished the export.",
          "",
          "STUDIO_RESULT: DONE",
          "STUDIO_FILE: [.harnessgg/exports/final-cut.mp4](.harnessgg/exports/final-cut.mp4)",
        ].join("\n"),
      ),
    ).toEqual({
      status: "done",
      relativePath: ".harnessgg/exports/final-cut.mp4",
    });
  });

  it("parses an error trailer", () => {
    expect(
      parseCodexStudioResult(
        ["Render failed.", "", "STUDIO_RESULT: ERROR", "STUDIO_ERROR: Missing FFmpeg"].join("\n"),
      ),
    ).toEqual({
      status: "error",
      errorMessage: "Missing FFmpeg",
    });
  });

  it("rejects absolute file paths", () => {
    expect(
      parseCodexStudioResult(
        ["STUDIO_RESULT: DONE", "STUDIO_FILE: [bad](C:\\temp\\final.mp4)"].join("\n"),
      ),
    ).toEqual({
      status: "done",
      relativePath: null,
    });
  });
});
