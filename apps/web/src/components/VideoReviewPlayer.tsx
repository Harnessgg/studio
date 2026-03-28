import { type ThreadId } from "@studio/contracts";
import { MessageSquarePlusIcon, PauseIcon, PlayIcon, SendIcon, XIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { basenameOfPath } from "~/vscode-icons";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  type VideoReviewComment,
  findNearestVideoReviewComment,
  formatVideoCommentTimestamp,
  normalizeVideoReviewTimestamp,
  videoReviewCommentMarkerPercent,
  videoReviewProgressPercent,
} from "../videoReview";
import { useVideoReviewComments, useVideoReviewCommentsStore } from "../videoReviewCommentsStore";

interface VideoReviewPlayerProps {
  threadId: ThreadId;
  videoPath: string;
  videoUrl: string;
  posterUrl?: string | null;
  isConnecting?: boolean;
  isSendBusy?: boolean;
  onSendFeedback?: (comments: VideoReviewComment[]) => Promise<void> | void;
}

interface CommentComposerState {
  text: string;
  timestampSeconds: number;
}

const SCRUB_KEYBOARD_LARGE_STEP_SECONDS = 5;
const SCRUB_KEYBOARD_STEP_SECONDS = 1;

function clampToDuration(timestampSeconds: number, durationSeconds: number): number {
  return normalizeVideoReviewTimestamp(timestampSeconds, durationSeconds);
}

export const VideoReviewPlayer = memo(function VideoReviewPlayer({
  threadId,
  videoPath,
  videoUrl,
  posterUrl,
  isConnecting = false,
  isSendBusy = false,
  onSendFeedback,
}: VideoReviewPlayerProps) {
  const comments = useVideoReviewComments(threadId, videoPath);
  const addComment = useVideoReviewCommentsStore((state) => state.addComment);
  const clearComments = useVideoReviewCommentsStore((state) => state.clearComments);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const scrubResumePlaybackRef = useRef(false);
  const activeScrubPointerIdRef = useRef<number | null>(null);

  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubTimeSeconds, setScrubTimeSeconds] = useState<number | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [composerState, setComposerState] = useState<CommentComposerState | null>(null);

  const displayedTimeSeconds = scrubTimeSeconds ?? currentTimeSeconds;
  const progressPercent = videoReviewProgressPercent(displayedTimeSeconds, durationSeconds);
  const activeCommentId =
    findNearestVideoReviewComment(comments, displayedTimeSeconds)?.id ?? selectedCommentId;
  const activeComment = useMemo(
    () => comments.find((comment) => comment.id === activeCommentId) ?? null,
    [activeCommentId, comments],
  );

  useEffect(() => {
    setCurrentTimeSeconds(0);
    setDurationSeconds(0);
    setIsPlaying(false);
    setScrubTimeSeconds(null);
    setSelectedCommentId(null);
    setComposerState(null);
    scrubResumePlaybackRef.current = false;
    activeScrubPointerIdRef.current = null;
  }, [videoPath, videoUrl]);

  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const seekTo = useCallback(
    (timestampSeconds: number, options?: { pause?: boolean }) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      const nextTime = clampToDuration(timestampSeconds, durationSeconds);
      video.currentTime = nextTime;
      setCurrentTimeSeconds(nextTime);
      if (options?.pause) {
        video.pause();
      }
    },
    [durationSeconds],
  );

  const finishScrub = useCallback(() => {
    activeScrubPointerIdRef.current = null;
    setScrubTimeSeconds(null);
    if (scrubResumePlaybackRef.current) {
      const playPromise = videoRef.current?.play();
      if (playPromise) {
        void playPromise.catch(() => {});
      }
    }
    scrubResumePlaybackRef.current = false;
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      const playPromise = video.play();
      void playPromise.catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const beginCreateComment = useCallback(() => {
    pauseVideo();
    setComposerState({
      text: "",
      timestampSeconds: currentTimeSeconds,
    });
  }, [currentTimeSeconds, pauseVideo]);

  const submitComment = useCallback(() => {
    if (!composerState) {
      return;
    }
    const created = addComment(threadId, videoPath, composerState);
    if (created) {
      setSelectedCommentId(created.id);
    }
    setComposerState(null);
  }, [addComment, composerState, threadId, videoPath]);

  const jumpToComment = useCallback(
    (comment: VideoReviewComment) => {
      setSelectedCommentId(comment.id);
      seekTo(comment.timestampSeconds, { pause: true });
    },
    [seekTo],
  );

  const startScrub = useCallback(() => {
    if (durationSeconds <= 0) {
      return;
    }
    const video = videoRef.current;
    scrubResumePlaybackRef.current = Boolean(video && !video.paused);
    video?.pause();
  }, [durationSeconds]);

  const handleTimelineChange = useCallback(
    (nextTimeSeconds: number) => {
      const nextTime = clampToDuration(nextTimeSeconds, durationSeconds);
      setScrubTimeSeconds(nextTime);
      seekTo(nextTime, { pause: true });
    },
    [durationSeconds, seekTo],
  );

  const timelineTimeFromClientX = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || durationSeconds <= 0) {
        return 0;
      }
      const rect = timeline.getBoundingClientRect();
      if (rect.width <= 0) {
        return 0;
      }
      const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return percent * durationSeconds;
    },
    [durationSeconds],
  );

  const onTimelineRangeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (durationSeconds <= 0) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown": {
          event.preventDefault();
          handleTimelineChange(
            displayedTimeSeconds -
              (event.shiftKey ? SCRUB_KEYBOARD_LARGE_STEP_SECONDS : SCRUB_KEYBOARD_STEP_SECONDS),
          );
          return;
        }
        case "ArrowRight":
        case "ArrowUp": {
          event.preventDefault();
          handleTimelineChange(
            displayedTimeSeconds +
              (event.shiftKey ? SCRUB_KEYBOARD_LARGE_STEP_SECONDS : SCRUB_KEYBOARD_STEP_SECONDS),
          );
          return;
        }
        case "Home": {
          event.preventDefault();
          handleTimelineChange(0);
          return;
        }
        case "End": {
          event.preventDefault();
          handleTimelineChange(durationSeconds);
          return;
        }
      }
    },
    [displayedTimeSeconds, durationSeconds, handleTimelineChange],
  );

  const onTimelinePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (durationSeconds <= 0) {
        return;
      }
      activeScrubPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      startScrub();
      handleTimelineChange(timelineTimeFromClientX(event.clientX));
    },
    [durationSeconds, handleTimelineChange, startScrub, timelineTimeFromClientX],
  );

  const onTimelinePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeScrubPointerIdRef.current !== event.pointerId) {
        return;
      }
      handleTimelineChange(timelineTimeFromClientX(event.clientX));
    },
    [handleTimelineChange, timelineTimeFromClientX],
  );

  const onTimelinePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeScrubPointerIdRef.current !== event.pointerId) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishScrub();
    },
    [finishScrub],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
      <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="size-full min-h-0 flex-1 cursor-pointer bg-black object-contain"
          onClick={togglePlayback}
          onDurationChange={(event) => {
            const nextDuration = Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0;
            setDurationSeconds(nextDuration);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setScrubTimeSeconds(null);
          }}
          onLoadedMetadata={(event) => {
            const nextDuration = Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0;
            setDurationSeconds(nextDuration);
            setCurrentTimeSeconds(event.currentTarget.currentTime);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onPlay={() => {
            setIsPlaying(true);
          }}
          onTimeUpdate={(event) => {
            setCurrentTimeSeconds(event.currentTarget.currentTime);
          }}
          poster={posterUrl ?? undefined}
          preload="metadata"
          src={videoUrl}
        />
      </div>

      <div className="shrink-0 border-t border-white/10 bg-neutral-950 px-3 py-3 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="border-white/15 bg-white/8 text-white hover:bg-white/12"
            onClick={togglePlayback}
            size="sm"
            variant="outline"
          >
            {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 font-mono text-xs tabular-nums">
            {formatVideoCommentTimestamp(displayedTimeSeconds)} /{" "}
            {formatVideoCommentTimestamp(durationSeconds)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs text-white/72">
            {basenameOfPath(videoPath)}
          </span>
          <Button
            className="border-white/15 bg-white/8 text-white hover:bg-white/12"
            onClick={beginCreateComment}
            size="sm"
            variant="outline"
          >
            <MessageSquarePlusIcon className="size-4" />
            Leave comment
          </Button>
          <Button
            disabled={comments.length === 0 || isSendBusy || isConnecting}
            onClick={() => void onSendFeedback?.(comments)}
            size="sm"
          >
            <SendIcon className="size-4" />
            Send
          </Button>
          {comments.length > 0 ? (
            <Button
              onClick={() => {
                clearComments(threadId, videoPath);
                setSelectedCommentId(null);
                setComposerState(null);
              }}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
          {activeComment ? (
            <span className="rounded-full border border-yellow-400/35 bg-yellow-400/12 px-2.5 py-1 text-xs text-yellow-100">
              Note at {formatVideoCommentTimestamp(activeComment.timestampSeconds)}
            </span>
          ) : null}
        </div>

        <div className="mt-4">
          <div
            ref={timelineRef}
            aria-label="Video review timeline"
            className="relative h-8 cursor-pointer touch-none outline-none"
            onKeyDown={onTimelineRangeKeyDown}
            onPointerCancel={onTimelinePointerEnd}
            onPointerDown={onTimelinePointerDown}
            onPointerMove={onTimelinePointerMove}
            onPointerUp={onTimelinePointerEnd}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={durationSeconds > 0 ? durationSeconds : 0}
            aria-valuenow={displayedTimeSeconds}
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/14">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-yellow-400 via-amber-300 to-orange-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {comments.map((comment) => {
              const leftPercent = videoReviewCommentMarkerPercent(
                comment.timestampSeconds,
                durationSeconds,
              );
              const isActive = comment.id === activeCommentId;
              return (
                <Tooltip key={comment.id}>
                  <TooltipTrigger
                    render={
                      <button
                        data-comment-marker="true"
                        aria-label={`Jump to comment at ${formatVideoCommentTimestamp(comment.timestampSeconds)}`}
                        className={cn(
                          "absolute top-1/2 z-20 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-transparent outline-none transition-transform hover:scale-105 focus-visible:scale-105",
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          jumpToComment(comment);
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        style={{ left: `${leftPercent}%` }}
                        type="button"
                      >
                        <span
                          className={cn(
                            "pointer-events-none h-4 w-1.5 rounded-full border",
                            isActive
                              ? "border-yellow-100 bg-yellow-300 shadow-[0_0_0_2px_rgba(250,204,21,0.18)]"
                              : "border-slate-950/70 bg-yellow-400 shadow-[0_0_0_1px_rgba(15,23,42,0.55)]",
                          )}
                        />
                      </button>
                    }
                  />
                  <TooltipPopup side="top" className="max-w-72 whitespace-normal">
                    <p className="font-medium text-foreground">
                      {formatVideoCommentTimestamp(comment.timestampSeconds)}
                    </p>
                    <p className="mt-1 text-muted-foreground">{comment.text}</p>
                  </TooltipPopup>
                </Tooltip>
              );
            })}
            <div
              className="pointer-events-none absolute top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950 bg-white shadow-[0_0_0_2px_rgba(250,204,21,0.28)]"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-3">
          {composerState ? (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.05] p-2.5 sm:flex-row sm:items-start">
              <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 font-mono text-xs text-white/72">
                {formatVideoCommentTimestamp(composerState.timestampSeconds)}
              </span>
              <Textarea
                autoFocus
                className="min-h-11 border-white/10 bg-black/30 text-sm text-white placeholder:text-white/35"
                onChange={(event) =>
                  setComposerState((existing) =>
                    existing
                      ? {
                          ...existing,
                          text: event.target.value,
                        }
                      : existing,
                  )
                }
                placeholder="Leave a comment at this timestamp"
                rows={1}
                value={composerState.text}
              />
              <div className="flex shrink-0 items-center gap-2">
                <Button disabled={!composerState.text.trim()} onClick={submitComment} size="sm">
                  Save
                </Button>
                <Button onClick={() => setComposerState(null)} size="sm" variant="ghost">
                  <XIcon className="size-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default VideoReviewPlayer;
