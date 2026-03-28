import { type ThreadId } from "@studio/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { VIDEO_REVIEW_COMMENTS_STORAGE_KEY } from "./storageKeys";
import { randomUUID } from "./lib/utils";
import {
  type VideoReviewComment,
  type VideoReviewCommentDraft,
  normalizeVideoReviewTimestamp,
  sortVideoReviewComments,
} from "./videoReview";

interface VideoReviewCommentsStoreState {
  commentsByThreadId: Record<ThreadId, Record<string, VideoReviewComment[]>>;
  addComment: (
    threadId: ThreadId,
    videoPath: string,
    draft: VideoReviewCommentDraft,
    options?: { createdAt?: string },
  ) => VideoReviewComment | null;
  updateComment: (
    threadId: ThreadId,
    videoPath: string,
    commentId: string,
    draft: VideoReviewCommentDraft,
    options?: { updatedAt?: string },
  ) => void;
  deleteComment: (threadId: ThreadId, videoPath: string, commentId: string) => void;
  clearComments: (threadId: ThreadId, videoPath: string) => void;
}

const EMPTY_VIDEO_REVIEW_COMMENTS: VideoReviewComment[] = [];

function normalizeCommentText(text: string): string {
  return text.trim();
}

function nextCommentsForPath(
  existingComments: VideoReviewComment[] | undefined,
  nextComment: VideoReviewComment,
): VideoReviewComment[] {
  return sortVideoReviewComments([...(existingComments ?? []), nextComment]);
}

export const useVideoReviewCommentsStore = create<VideoReviewCommentsStoreState>()(
  persist(
    (set) => ({
      commentsByThreadId: {},
      addComment: (threadId, videoPath, draft, options) => {
        const text = normalizeCommentText(draft.text);
        if (videoPath.trim().length === 0 || text.length === 0) {
          return null;
        }

        const now = options?.createdAt ?? new Date().toISOString();
        const nextComment: VideoReviewComment = {
          id: randomUUID(),
          text,
          timestampSeconds: normalizeVideoReviewTimestamp(draft.timestampSeconds),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          const existingByPath = state.commentsByThreadId[threadId] ?? {};
          return {
            commentsByThreadId: {
              ...state.commentsByThreadId,
              [threadId]: {
                ...existingByPath,
                [videoPath]: nextCommentsForPath(existingByPath[videoPath], nextComment),
              },
            },
          };
        });

        return nextComment;
      },
      updateComment: (threadId, videoPath, commentId, draft, options) => {
        const text = normalizeCommentText(draft.text);
        if (videoPath.trim().length === 0 || commentId.trim().length === 0 || text.length === 0) {
          return;
        }

        set((state) => {
          const existingByPath = state.commentsByThreadId[threadId];
          const existingComments = existingByPath?.[videoPath];
          if (!existingComments || existingComments.length === 0) {
            return state;
          }

          let didChange = false;
          const updatedComments = [...existingComments];
          for (let index = 0; index < updatedComments.length; index += 1) {
            const comment = updatedComments[index];
            if (!comment || comment.id !== commentId) {
              continue;
            }
            didChange = true;
            updatedComments[index] = {
              ...comment,
              text,
              timestampSeconds: normalizeVideoReviewTimestamp(draft.timestampSeconds),
              updatedAt: options?.updatedAt ?? new Date().toISOString(),
            };
            break;
          }

          if (!didChange) {
            return state;
          }

          return {
            commentsByThreadId: {
              ...state.commentsByThreadId,
              [threadId]: {
                ...existingByPath,
                [videoPath]: sortVideoReviewComments(updatedComments),
              },
            },
          };
        });
      },
      deleteComment: (threadId, videoPath, commentId) => {
        if (videoPath.trim().length === 0 || commentId.trim().length === 0) {
          return;
        }

        set((state) => {
          const existingByPath = state.commentsByThreadId[threadId];
          const existingComments = existingByPath?.[videoPath];
          if (!existingByPath || !existingComments) {
            return state;
          }

          const nextComments = existingComments.filter((comment) => comment.id !== commentId);
          if (nextComments.length === existingComments.length) {
            return state;
          }

          if (nextComments.length === 0) {
            const nextByPath = { ...existingByPath };
            delete nextByPath[videoPath];

            if (Object.keys(nextByPath).length === 0) {
              const nextByThread = { ...state.commentsByThreadId };
              delete nextByThread[threadId];
              return { commentsByThreadId: nextByThread };
            }

            return {
              commentsByThreadId: {
                ...state.commentsByThreadId,
                [threadId]: nextByPath,
              },
            };
          }

          return {
            commentsByThreadId: {
              ...state.commentsByThreadId,
              [threadId]: {
                ...existingByPath,
                [videoPath]: nextComments,
              },
            },
          };
        });
      },
      clearComments: (threadId, videoPath) => {
        if (videoPath.trim().length === 0) {
          return;
        }

        set((state) => {
          const existingByPath = state.commentsByThreadId[threadId];
          if (!existingByPath || !Object.hasOwn(existingByPath, videoPath)) {
            return state;
          }

          const nextByPath = { ...existingByPath };
          delete nextByPath[videoPath];
          if (Object.keys(nextByPath).length === 0) {
            const nextByThread = { ...state.commentsByThreadId };
            delete nextByThread[threadId];
            return { commentsByThreadId: nextByThread };
          }

          return {
            commentsByThreadId: {
              ...state.commentsByThreadId,
              [threadId]: nextByPath,
            },
          };
        });
      },
    }),
    {
      name: VIDEO_REVIEW_COMMENTS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        commentsByThreadId: state.commentsByThreadId,
      }),
    },
  ),
);

export function selectVideoReviewComments(
  state: VideoReviewCommentsStoreState,
  threadId: ThreadId,
  videoPath: string | null,
): VideoReviewComment[] {
  if (!videoPath) {
    return EMPTY_VIDEO_REVIEW_COMMENTS;
  }
  return state.commentsByThreadId[threadId]?.[videoPath] ?? EMPTY_VIDEO_REVIEW_COMMENTS;
}

export function useVideoReviewComments(
  threadId: ThreadId,
  videoPath: string | null,
): VideoReviewComment[] {
  return useVideoReviewCommentsStore((state) =>
    selectVideoReviewComments(state, threadId, videoPath),
  );
}
