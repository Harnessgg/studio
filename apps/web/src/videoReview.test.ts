import { describe, expect, it } from "vitest";

import {
  buildVideoReviewFeedbackMessage,
  findNearestVideoReviewComment,
  formatVideoCommentTimestamp,
  videoReviewCommentMarkerPercent,
} from "./videoReview";

describe("formatVideoCommentTimestamp", () => {
  it("formats sub-hour timestamps as mm:ss.mmm", () => {
    expect(formatVideoCommentTimestamp(65.432)).toBe("01:05.432");
  });

  it("formats hour-long timestamps as hh:mm:ss.mmm", () => {
    expect(formatVideoCommentTimestamp(3661.005)).toBe("01:01:01.005");
  });
});

describe("videoReviewCommentMarkerPercent", () => {
  it("converts timestamps to clamped percentages", () => {
    expect(videoReviewCommentMarkerPercent(25, 100)).toBe(25);
    expect(videoReviewCommentMarkerPercent(999, 100)).toBe(100);
    expect(videoReviewCommentMarkerPercent(-5, 100)).toBe(0);
  });
});

describe("findNearestVideoReviewComment", () => {
  const comments = [
    {
      id: "a",
      text: "first",
      timestampSeconds: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "b",
      text: "second",
      timestampSeconds: 20,
      createdAt: "2026-01-01T00:00:01.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    },
  ];

  it("returns the nearest comment within the configured threshold", () => {
    expect(findNearestVideoReviewComment(comments, 20.3)?.id).toBe("b");
  });

  it("returns null when no comment is near the playhead", () => {
    expect(findNearestVideoReviewComment(comments, 30)).toBeNull();
  });
});

describe("buildVideoReviewFeedbackMessage", () => {
  it("builds a chronological feedback list", () => {
    expect(
      buildVideoReviewFeedbackMessage("exports/final.mp4", [
        {
          text: "tighten this cut",
          timestampSeconds: 12,
          createdAt: "2026-01-01T00:00:01.000Z",
        },
        {
          text: "swap the b-roll",
          timestampSeconds: 5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    ).toBe(
      [
        "Timeline feedback for file: exports/final.mp4",
        "Comments:",
        "1. [00:05.000] swap the b-roll",
        "2. [00:12.000] tighten this cut",
      ].join("\n"),
    );
  });
});
