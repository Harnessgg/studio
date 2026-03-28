import { FilmIcon, FileImageIcon, FileTextIcon, MusicIcon } from "lucide-react";
import type { ProjectStyleGuideSourceSummary, ThreadId } from "@studio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { ensureNativeApi } from "../nativeApi";
import { useStore } from "../store";
import {
  generateProjectStyleGuide,
  projectInspectWorkspaceQueryOptions,
  projectQueryKeys,
} from "../lib/projectReactQuery";
import {
  buildWorkspaceFileUrl,
  resolveWorkspaceAbsolutePath,
  workspaceEntryCategoryLabel,
} from "../studioWorkspace";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { toastManager } from "./ui/toast";
import { Textarea } from "./ui/textarea";

const MAX_REFERENCE_VIDEO_BYTES = 32 * 1024 * 1024;
const MAX_REFERENCE_VIDEO_BYTES_LABEL = `${Math.floor(MAX_REFERENCE_VIDEO_BYTES / (1024 * 1024))} MB`;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read video data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read video."));
    });
    reader.readAsDataURL(file);
  });
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
  previewPath?: string | null;
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
  const [styleDraft, setStyleDraft] = useState("");
  const [styleDirty, setStyleDirty] = useState(false);
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastSourceSummary, setLastSourceSummary] = useState<ProjectStyleGuideSourceSummary | null>(
    null,
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const projectCwd = project?.cwd ?? null;
  const workspace = workspaceQuery.data;
  const effectivePreviewPath =
    props.previewPath ?? workspace?.latestExportPath ?? workspace?.sampleVideoPaths?.[0] ?? null;
  const previewKind = effectivePreviewPath ? mediaEntryKind(effectivePreviewPath) : "other";
  const previewFileUrl =
    effectivePreviewPath && project?.cwd
      ? buildWorkspaceFileUrl(project.cwd, effectivePreviewPath)
      : null;
  const previewPosterUrl =
    workspace?.sampleImagePaths?.[0] && project?.cwd
      ? buildWorkspaceFileUrl(project.cwd, workspace.sampleImagePaths[0])
      : null;
  const saveStyleGuideMutation = useMutation({
    mutationFn: async () => {
      if (!projectCwd) {
        throw new Error("Project is not available.");
      }
      const api = ensureNativeApi();
      return api.projects.writeFile({
        cwd: projectCwd,
        relativePath: "STYLE.md",
        contents: styleDraft,
      });
    },
    onSuccess: async () => {
      setStyleDirty(false);
      if (projectCwd) {
        await queryClient.invalidateQueries({
          queryKey: projectQueryKeys.inspectWorkspace(projectCwd),
        });
      }
    },
  });
  const generateStyleGuideMutation = useMutation({
    mutationFn: generateProjectStyleGuide,
    onSuccess: (result) => {
      setStyleDraft(result.markdown);
      setStyleDirty(true);
      setStyleDialogOpen(true);
      setGenerationError(null);
      setLastSourceSummary(result.sourceSummary);
      setReferenceUrl("");
      toastManager.add({
        type: "success",
        title: "STYLE.md draft generated",
        description: `Reference frames analyzed from ${result.sourceSummary.displayName}.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to generate STYLE.md.";
      setGenerationError(message);
      toastManager.add({
        type: "error",
        title: "Style guide generation failed",
        description: message,
      });
    },
  });

  useEffect(() => {
    if (styleDirty) {
      return;
    }
    setStyleDraft(workspace?.styleGuideExcerpt ?? "");
  }, [styleDirty, workspace?.styleGuideExcerpt]);

  if ((!thread && !draftThread) || !project) {
    return null;
  }

  const handleReferenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!project) {
      return;
    }
    if (!file.type.startsWith("video/")) {
      const message = "Select a video file.";
      setGenerationError(message);
      toastManager.add({
        type: "warning",
        title: "Unsupported file",
        description: message,
      });
      return;
    }
    if (file.size <= 0 || file.size > MAX_REFERENCE_VIDEO_BYTES) {
      const message = `Reference videos must be smaller than ${MAX_REFERENCE_VIDEO_BYTES_LABEL}.`;
      setGenerationError(message);
      toastManager.add({
        type: "warning",
        title: "Video too large",
        description: message,
      });
      return;
    }

    let dataUrl: string;
    try {
      setGenerationError(null);
      dataUrl = await readFileAsDataUrl(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read the selected video.";
      setGenerationError(message);
      toastManager.add({
        type: "error",
        title: "Video read failed",
        description: message,
      });
      return;
    }

    await generateStyleGuideMutation.mutateAsync({
      cwd: project.cwd,
      source: {
        type: "upload",
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
      },
    });
  };

  const submitReferenceUrl = async () => {
    if (!project) {
      return;
    }
    const trimmedUrl = referenceUrl.trim();
    if (trimmedUrl.length === 0) {
      setGenerationError("Enter a public direct video URL.");
      return;
    }
    setGenerationError(null);
    await generateStyleGuideMutation.mutateAsync({
      cwd: project.cwd,
      source: {
        type: "url",
        url: trimmedUrl,
      },
    });
  };

  const openWorkspaceEntry = (relativePath: string) => {
    const api = ensureNativeApi();
    const absolutePath = resolveWorkspaceAbsolutePath(project.cwd, relativePath);
    void api.shell.openInEditor(absolutePath, "file-manager");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-card/60 p-4">
      <div className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto pr-1">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-600/80">
            Project tools
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{project.name}</h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">{project.cwd}</p>
        </div>

        <Button
          className="h-auto justify-start rounded-2xl border-border bg-background/70 px-4 py-3 text-left"
          onClick={() => {
            setStyleDialogOpen(true);
            setGenerationError(null);
          }}
          size="lg"
          variant="outline"
        >
          <FileTextIcon className="size-4 text-cyan-600/80" />
          STYLE.md
        </Button>

        {props.showPreview !== false ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
            {previewFileUrl && previewKind === "video" ? (
              <video
                className="aspect-video w-full bg-black"
                controls
                poster={previewPosterUrl ?? undefined}
                preload="metadata"
                src={previewFileUrl}
              />
            ) : previewFileUrl && previewKind === "image" ? (
              <img
                alt=""
                className="max-h-72 w-full object-contain bg-black/90"
                src={previewFileUrl}
              />
            ) : previewFileUrl && previewKind === "audio" ? (
              <div className="p-4">
                <audio className="w-full" controls preload="metadata" src={previewFileUrl} />
              </div>
            ) : previewFileUrl ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Preview available. Use the asset list to open this file directly.
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Add clips or exports to see a preview here.
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FilmIcon className="size-4 text-cyan-600/80" />
              Assets
            </div>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
              {(workspace?.mediaEntries ?? []).length} files
            </span>
          </div>
          <div className="mt-3 grid max-h-[28rem] gap-2 overflow-auto pr-1">
            {(workspace?.mediaEntries ?? []).length > 0 ? (
              workspace?.mediaEntries.map((entry) => (
                <div
                  className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-3"
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
                    className="self-start sm:self-center"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => openWorkspaceEntry(entry.path)}
                  >
                    View in folder
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

      <input
        ref={uploadInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => void handleReferenceUpload(event)}
      />

      <Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
        <DialogPopup className="flex h-[min(82vh,760px)] w-[min(92vw,900px)] max-w-none flex-col p-0">
          <DialogHeader className="border-b border-border">
            <DialogTitle>STYLE.md</DialogTitle>
            <DialogDescription>
              Write project direction manually or generate a draft from a reference video.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Generate from reference video
                  </p>
                  <p className="mt-2 max-w-2xl leading-5 text-muted-foreground">
                    Upload a short reference clip or paste a public direct video URL. Generated
                    markdown replaces the current draft but is not written until you save.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generateStyleGuideMutation.isPending}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {generateStyleGuideMutation.isPending ? "Analyzing..." : "Use Video File"}
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="https://example.com/reference.mp4"
                  value={referenceUrl}
                  onChange={(event) => setReferenceUrl(event.target.value)}
                />
                <Button
                  size="sm"
                  disabled={generateStyleGuideMutation.isPending}
                  onClick={() => void submitReferenceUrl()}
                >
                  {generateStyleGuideMutation.isPending ? "Analyzing..." : "Use Video URL"}
                </Button>
              </div>
              {generationError ? (
                <p className="mt-2 text-xs text-destructive">{generationError}</p>
              ) : null}
              {lastSourceSummary ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Generated from {lastSourceSummary.displayName} with {lastSourceSummary.frameCount}{" "}
                  reference frame{lastSourceSummary.frameCount === 1 ? "" : "s"}.
                  {lastSourceSummary.warnings.length > 0
                    ? ` ${lastSourceSummary.warnings.join(" ")}`
                    : ""}
                </p>
              ) : null}
            </div>

            <Textarea
              className="min-h-[22rem] flex-1 font-mono text-xs"
              value={styleDraft}
              onChange={(event) => {
                setStyleDraft(event.target.value);
                setStyleDirty(true);
              }}
              placeholder="Project style guide contents"
            />
          </DialogPanel>
          <DialogFooter>
            <div className="mr-auto text-xs text-muted-foreground">
              {saveStyleGuideMutation.isSuccess && !styleDirty
                ? "STYLE.md saved."
                : "Changes save directly to the project root."}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStyleDialogOpen(false)}
              disabled={saveStyleGuideMutation.isPending}
            >
              Close
            </Button>
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
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
