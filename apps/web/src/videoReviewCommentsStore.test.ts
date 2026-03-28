import { ThreadId } from "@studio/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { selectVideoReviewComments, useVideoReviewCommentsStore } from "./videoReviewCommentsStore";

const THREAD_ID = ThreadId.makeUnsafe("thread-1");
const OTHER_THREAD_ID = ThreadId.makeUnsafe("thread-2");

describe("videoReviewCommentsStore", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    useVideoReviewCommentsStore.setState({ commentsByThreadId: {} });
  });

  it("stores comments by thread and video path", () => {
    const store = useVideoReviewCommentsStore.getState();
    store.addComment(THREAD_ID, "exports/a.mp4", {
      text: "trim the intro",
      timestampSeconds: 3,
    });

    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/a.mp4"),
    ).toHaveLength(1);
    expect(
      selectVideoReviewComments(
        useVideoReviewCommentsStore.getState(),
        OTHER_THREAD_ID,
        "exports/a.mp4",
      ),
    ).toHaveLength(0);
  });

  it("keeps comments isolated across preview files", () => {
    const store = useVideoReviewCommentsStore.getState();
    store.addComment(THREAD_ID, "exports/a.mp4", {
      text: "trim the intro",
      timestampSeconds: 3,
    });
    store.addComment(THREAD_ID, "exports/b.mp4", {
      text: "swap the ending",
      timestampSeconds: 8,
    });

    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/a.mp4"),
    ).toHaveLength(1);
    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/b.mp4"),
    ).toHaveLength(1);
  });

  it("updates and deletes comments", () => {
    const store = useVideoReviewCommentsStore.getState();
    const created = store.addComment(THREAD_ID, "exports/a.mp4", {
      text: "trim the intro",
      timestampSeconds: 3,
    });
    expect(created).not.toBeNull();
    if (!created) {
      return;
    }

    store.updateComment(THREAD_ID, "exports/a.mp4", created.id, {
      text: "tighten the intro",
      timestampSeconds: 4,
    });

    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/a.mp4"),
    ).toEqual([
      expect.objectContaining({
        id: created.id,
        text: "tighten the intro",
        timestampSeconds: 4,
      }),
    ]);

    store.deleteComment(THREAD_ID, "exports/a.mp4", created.id);

    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/a.mp4"),
    ).toHaveLength(0);
  });

  it("clears comments for one preview path without touching others", () => {
    const store = useVideoReviewCommentsStore.getState();
    store.addComment(THREAD_ID, "exports/a.mp4", {
      text: "trim the intro",
      timestampSeconds: 3,
    });
    store.addComment(THREAD_ID, "exports/b.mp4", {
      text: "swap the ending",
      timestampSeconds: 8,
    });

    store.clearComments(THREAD_ID, "exports/a.mp4");

    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/a.mp4"),
    ).toHaveLength(0);
    expect(
      selectVideoReviewComments(useVideoReviewCommentsStore.getState(), THREAD_ID, "exports/b.mp4"),
    ).toHaveLength(1);
  });
});
