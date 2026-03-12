import {
  AlertTriangleIcon,
  FilmIcon,
  FileImageIcon,
  FileTextIcon,
  MusicIcon,
  PlayCircleIcon,
} from "lucide-react";
import type { ThreadId } from "@studio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { ensureNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { projectInspectWorkspaceQueryOptions, projectQueryKeys } from "../lib/projectReactQuery";
import {
  buildWorkspaceFileUrl,
  resolveWorkspaceAbsolutePath,
  workspaceEntryCategoryLabel,
} from "../studioWorkspace";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

function MetricCard(props: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-[0.18em]">{props.label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{props.value}</p>
    </div>
  );
}

function mediaEntryKind(entryPath: string): "video" | "audio" | "image" | "other" {
  const normalized = entryPath.toLowerCase();
  if (/\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg|ogv)$/i.test(normalized)) return "video";
  if (/\.(mp3|wav|flac|m4a|aac|ogg|wma|aiff)$/i.test(normalized)) return "audio";
  if (/\.(png|jpg|jpeg|gif|webp|svg|psd|tif|tiff|heic)$/i.test(normalized)) return "image";
  return "other";
}

function MediaEntryIcon(props: { entryPath: string }) {
  const kind = mediaEntryKind(props.entryPath);
  if (kind === "video") {
    return <FilmIcon className="size-4 text-cyan-600/80" />;
  }
  if (kind === "audio") {
    return <MusicIcon className="size-4 text-cyan-600/80" />;
  }
  if (kind === "image") {
    return <FileImageIcon className="size-4 text-cyan-600/80" />;
  }
  return <FileTextIcon className="size-4 text-cyan-600/80" />;
}

function MediaThumbnail(props: { cwd: string; entryPath: string }) {
  const fileUrl = buildWorkspaceFileUrl(props.cwd, props.entryPath);
  const kind = mediaEntryKind(props.entryPath);

  if (fileUrl && kind === "image") {
    return (
      <img
        alt=""
        className="size-full object-cover"
        draggable={false}
        loading="lazy"
        src={fileUrl}
      />
    );
  }

  if (fileUrl && kind === "video") {
    return (
      <video
        aria-hidden="true"
        className="size-full object-cover"
        muted
        playsInline
        preload="metadata"
        src={fileUrl}
      />
    );
  }

  return (
    <div className="flex size-full items-center justify-center bg-muted/40">
      <MediaEntryIcon entryPath={props.entryPath} />
    </div>
  );
}

export default function StudioProjectOverview(props: {
  threadId: ThreadId;
  showPreview?: boolean;
  onPreviewEntry?: (relativePath: string) => void;
}) {
  const queryClient = useQueryClient();
  const thread = useStore((store) => store.threads.find((entry) => entry.id === props.threadId));
  const draftThread = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[props.threadId] ?? null,
  );
  const project = useStore((store) => {
    const projectId = thread?.projectId ?? draftThread?.projectId;
    return projectId ? store.projects.find((entry) => entry.id === projectId) : undefined;
  });
  const workspaceQuery = useQuery(
    projectInspectWorkspaceQueryOptions({
      cwd: project?.cwd ?? null,
      enabled: project !== undefined,
    }),
  );

  if ((!thread && !draftThread) || !project) {
    return null;
  }

  const [styleDraft, setStyleDraft] = useState("");
  const [styleDirty, setStyleDirty] = useState(false);
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const workspace = workspaceQuery.data;
  const mediaSummary = workspace?.mediaSummary;
  const latestExportUrl =
    workspace?.latestExportPath && project?.cwd
      ? buildWorkspaceFileUrl(project.cwd, workspace.latestExportPath)
      : null;
  const previewPosterUrl =
    workspace?.sampleImagePaths[0] && project?.cwd
      ? buildWorkspaceFileUrl(project.cwd, workspace.sampleImagePaths[0])
      : null;
  const saveStyleGuideMutation = useMutation({
    mutationFn: async () => {
      const api = ensureNativeApi();
      return api.projects.writeFile({
        cwd: project.cwd,
        relativePath: "STYLE.md",
        contents: styleDraft,
      });
    },
    onSuccess: async () => {
      setStyleDirty(false);
      await queryClient.invalidateQueries({
        queryKey: projectQueryKeys.inspectWorkspace(project.cwd),
      });
    },
  });

  useEffect(() => {
    if (styleDirty) {
      return;
    }
    setStyleDraft(workspace?.styleGuideExcerpt ?? "");
  }, [styleDirty, workspace?.styleGuideExcerpt]);

  const openWorkspaceEntry = (relativePath: string) => {
    const api = ensureNativeApi();
    const absolutePath = resolveWorkspaceAbsolutePath(project.cwd, relativePath);
    void api.shell.openInEditor(absolutePath, "file-manager");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-card/60 p-4">
      <div className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-600/80">
              Studio Project
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{project.name}</h2>
            <p className="mt-1 break-all text-xs text-muted-foreground">{project.cwd}</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="Video Clips"
                value={String(mediaSummary?.videoCount ?? 0)}
                icon={FilmIcon}
              />
              <MetricCard
                label="Audio Tracks"
                value={String(mediaSummary?.audioCount ?? 0)}
                icon={MusicIcon}
              />
              <MetricCard
                label="Images"
                value={String(mediaSummary?.imageCount ?? 0)}
                icon={FileImageIcon}
              />
              <MetricCard
                label="Docs & Subs"
                value={String(
                  (mediaSummary?.documentCount ?? 0) + (mediaSummary?.subtitleCount ?? 0),
                )}
                icon={FileTextIcon}
              />
            </div>
          </div>

          {props.showPreview !== false ? (
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <PlayCircleIcon className="size-4 text-cyan-600/80" />
                Latest export preview
              </div>
              {latestExportUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-black/90">
                  <video
                    className="aspect-video w-full bg-black"
                    controls
                    poster={previewPosterUrl ?? undefined}
                    preload="metadata"
                    src={latestExportUrl}
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  Exported video will appear here after the agent writes a file into
                  <code className="ml-1">.harnessgg/exports</code>.
                </div>
              )}
              {workspace?.exportPaths?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {workspace.exportPaths.map((entry) => (
                    <span
                      className="rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
                      key={entry}
                    >
                      {entry.replace(".harnessgg/exports/", "")}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FilmIcon className="size-4 text-cyan-600/80" />
              Media browser
            </div>
            <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
              {(workspace?.mediaEntries ?? []).length > 0 ? (
                workspace?.mediaEntries.map((entry) => (
                  <div
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-accent/40"
                    key={entry.path}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => props.onPreviewEntry?.(entry.path)}
                    >
                      <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
                        <MediaThumbnail cwd={project.cwd} entryPath={entry.path} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{entry.path}</p>
                        <p className="mt-1 text-muted-foreground">
                          {workspaceEntryCategoryLabel(entry)}
                        </p>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => openWorkspaceEntry(entry.path)}
                    >
                      Open
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No media files detected in this project folder yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background/70 p-4 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileTextIcon className="size-4 text-cyan-600/80" />
                STYLE.md
              </div>
              {styleEditorOpen ? (
                <p className="mt-2 max-w-xl leading-5 text-muted-foreground">
                  Use this file for project-specific subtitles, transitions, color, audio, and
                  export defaults. It is injected into every edit run.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!workspace?.styleGuideExcerpt ? (
                <div className="rounded-xl border border-warning/25 bg-warning/8 px-3 py-2 text-warning-foreground">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangleIcon className="size-4" />
                    Creating default STYLE.md
                  </div>
                </div>
              ) : null}
              <Button
                size="sm"
                variant={styleEditorOpen ? "secondary" : "outline"}
                onClick={() => {
                  setStyleEditorOpen((current) => !current);
                }}
              >
                {styleEditorOpen ? "Hide STYLE.md" : "Edit STYLE.md"}
              </Button>
            </div>
          </div>

          {styleEditorOpen ? (
            <>
              <Textarea
                className="mt-3 min-h-56 font-mono text-xs"
                value={styleDraft}
                onChange={(event) => {
                  setStyleDraft(event.target.value);
                  setStyleDirty(true);
                }}
                placeholder="Project style guide contents"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground">
                  {saveStyleGuideMutation.isSuccess && !styleDirty
                    ? "STYLE.md saved."
                    : "Changes save directly to the project root."}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!styleDirty || saveStyleGuideMutation.isPending}
                    onClick={() => {
                      setStyleDraft(workspace?.styleGuideExcerpt ?? "");
                      setStyleDirty(false);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    disabled={saveStyleGuideMutation.isPending || !styleDirty}
                    onClick={() => void saveStyleGuideMutation.mutateAsync()}
                  >
                    {saveStyleGuideMutation.isPending ? "Saving..." : "Save STYLE.md"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
