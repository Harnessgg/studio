export interface VideoReviewComment {
  id: string;
  text: string;
  timestampSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface VideoReviewCommentDraft {
  text: string;
  timestampSeconds: number;
}

export function formatVideoCommentTimestamp(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00.000";
  }

  const wholeSeconds = Math.floor(totalSeconds);
  const milliseconds = Math.floor((totalSeconds - wholeSeconds) * 1000);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(milliseconds).padStart(3, "0");

  return hours > 0 ? `${hh}:${mm}:${ss}.${mmm}` : `${mm}:${ss}.${mmm}`;
}

export function normalizeVideoReviewTimestamp(
  timestampSeconds: number,
  durationSeconds: number | null = null,
): number {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
    return 0;
  }
  if (durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds >= 0) {
    return Math.min(timestampSeconds, durationSeconds);
  }
  return timestampSeconds;
}

export function videoReviewProgressPercent(
  currentTimeSeconds: number,
  durationSeconds: number | null,
): number {
  if (
    !Number.isFinite(currentTimeSeconds) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds === null ||
    durationSeconds <= 0
  ) {
    return 0;
  }
  return Math.min(Math.max((currentTimeSeconds / durationSeconds) * 100, 0), 100);
}

export function videoReviewCommentMarkerPercent(
  timestampSeconds: number,
  durationSeconds: number | null,
): number {
  return videoReviewProgressPercent(timestampSeconds, durationSeconds);
}

export function sortVideoReviewComments<T extends { timestampSeconds: number; createdAt: string }>(
  comments: readonly T[],
): T[] {
  return comments.toSorted((left, right) => {
    const byTimestamp = left.timestampSeconds - right.timestampSeconds;
    if (byTimestamp !== 0) return byTimestamp;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function findNearestVideoReviewComment<T extends VideoReviewComment>(
  comments: readonly T[],
  currentTimeSeconds: number,
  options: {
    maxDistanceSeconds?: number;
  } = {},
): T | null {
  if (!Number.isFinite(currentTimeSeconds) || comments.length === 0) {
    return null;
  }

  const maxDistanceSeconds = options.maxDistanceSeconds ?? 0.5;
  let nearest: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const comment of comments) {
    const distance = Math.abs(comment.timestampSeconds - currentTimeSeconds);
    if (distance > maxDistanceSeconds || distance >= nearestDistance) {
      continue;
    }
    nearest = comment;
    nearestDistance = distance;
  }
  return nearest;
}

export function buildVideoReviewFeedbackMessage(
  videoPath: string,
  comments: readonly Pick<VideoReviewComment, "text" | "timestampSeconds" | "createdAt">[],
): string {
  const sortedComments = sortVideoReviewComments(comments);

  return [
    `Video review feedback for file: ${videoPath}`,
    "Comments:",
    ...sortedComments.map(
      (comment, index) =>
        `${index + 1}. [${formatVideoCommentTimestamp(comment.timestampSeconds)}] ${comment.text}`,
    ),
  ].join("\n");
}
