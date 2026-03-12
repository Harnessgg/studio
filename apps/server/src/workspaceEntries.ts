import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { runProcess } from "./processRunner";
import {
  buildDefaultProjectStyleGuide,
  DEFAULT_PROJECT_AGENTS_MD,
} from "./harnessProjectTemplates";

import {
  ProjectEntry,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  type ProjectWorkspaceInspectInput,
  type ProjectWorkspaceInspectResult,
} from "@t3tools/contracts";

const WORKSPACE_CACHE_TTL_MS = 15_000;
const WORKSPACE_CACHE_MAX_KEYS = 4;
const WORKSPACE_INDEX_MAX_ENTRIES = 25_000;
const WORKSPACE_SCAN_READDIR_CONCURRENCY = 32;
const GIT_CHECK_IGNORE_MAX_STDIN_BYTES = 256 * 1024;
const VIDEO_FILE_EXTENSIONS = new Set([
  ".3g2",
  ".3gp",
  ".avi",
  ".flv",
  ".m2v",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".ogv",
  ".webm",
  ".wmv",
]);
const AUDIO_FILE_EXTENSIONS = new Set([
  ".aac",
  ".aiff",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".wav",
  ".wma",
]);
const IMAGE_FILE_EXTENSIONS = new Set([
  ".gif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".png",
  ".psd",
  ".svg",
  ".tif",
  ".tiff",
  ".webp",
]);
const SUBTITLE_FILE_EXTENSIONS = new Set([".ass", ".srt", ".vtt"]);
const DOCUMENT_FILE_EXTENSIONS = new Set([".cube", ".doc", ".docx", ".md", ".pdf", ".rtf", ".txt"]);
const PREVIEWABLE_VIDEO_FILE_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".convex",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  ".cache",
]);

interface WorkspaceIndex {
  scannedAt: number;
  entries: ProjectEntry[];
  truncated: boolean;
}

const workspaceIndexCache = new Map<string, WorkspaceIndex>();
const inFlightWorkspaceIndexBuilds = new Map<string, Promise<WorkspaceIndex>>();

export async function ensureHarnessWorkspaceScaffold(cwd: string): Promise<void> {
  const harnessDir = path.join(cwd, ".harnessgg");
  const exportsDir = path.join(harnessDir, "exports");
  const logsDir = path.join(harnessDir, "logs");
  const tempDir = path.join(harnessDir, "tmp");
  const configPath = path.join(harnessDir, "config.json");
  const styleGuidePath = path.join(cwd, "STYLE.md");
  const agentsPath = path.join(cwd, "AGENTS.md");

  await fs.mkdir(exportsDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });

  try {
    await fs.access(configPath);
  } catch {
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          exportsDir: ".harnessgg/exports",
          logsDir: ".harnessgg/logs",
          tempDir: ".harnessgg/tmp",
          transcriptionMode: "local-whisper",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  try {
    await fs.access(styleGuidePath);
  } catch {
    await fs.writeFile(styleGuidePath, `${buildDefaultProjectStyleGuide(cwd)}\n`, "utf8");
  }

  try {
    await fs.access(agentsPath);
  } catch {
    await fs.writeFile(agentsPath, `${DEFAULT_PROJECT_AGENTS_MD}\n`, "utf8");
  }
}

function toPosixPath(input: string): string {
  return input.split(path.sep).join("/");
}

function parentPathOf(input: string): string | undefined {
  const separatorIndex = input.lastIndexOf("/");
  if (separatorIndex === -1) {
    return undefined;
  }
  return input.slice(0, separatorIndex);
}

function basenameOf(input: string): string {
  const separatorIndex = input.lastIndexOf("/");
  if (separatorIndex === -1) {
    return input;
  }
  return input.slice(separatorIndex + 1);
}

function fileExtensionOf(input: string): string {
  const extension = path.extname(input).toLowerCase();
  return extension;
}

function normalizeQuery(input: string): string {
  return input
    .trim()
    .replace(/^[@./]+/, "")
    .toLowerCase();
}

function scoreEntry(entry: ProjectEntry, query: string): number {
  if (!query) {
    return entry.kind === "directory" ? 0 : 1;
  }

  const normalizedPath = entry.path.toLowerCase();
  const normalizedName = basenameOf(normalizedPath);

  if (normalizedName === query) return 0;
  if (normalizedPath === query) return 1;
  if (normalizedName.startsWith(query)) return 2;
  if (normalizedPath.startsWith(query)) return 3;
  if (normalizedPath.includes(`/${query}`)) return 4;
  return 5;
}

function isPathInIgnoredDirectory(relativePath: string): boolean {
  const firstSegment = relativePath.split("/")[0];
  if (!firstSegment) return false;
  return IGNORED_DIRECTORY_NAMES.has(firstSegment);
}

function splitNullSeparatedPaths(input: string, truncated: boolean): string[] {
  const parts = input.split("\0");
  if (parts.length === 0) return [];

  // If output was truncated, the final token can be partial.
  if (truncated && parts[parts.length - 1]?.length) {
    parts.pop();
  }

  return parts.filter((value) => value.length > 0);
}

function directoryAncestorsOf(relativePath: string): string[] {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) return [];
  const directories: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    directories.push(segments.slice(0, index).join("/"));
  }
  return directories;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const boundedConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = Array.from({ length: items.length }) as TOutput[];
  let nextIndex = 0;

  const workers = Array.from({ length: boundedConcurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex] as TInput, currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function isInsideGitWorkTree(cwd: string): Promise<boolean> {
  const insideWorkTree = await runProcess("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    allowNonZeroExit: true,
    timeoutMs: 5_000,
    maxBufferBytes: 4_096,
  }).catch(() => null);
  return Boolean(
    insideWorkTree && insideWorkTree.code === 0 && insideWorkTree.stdout.trim() === "true",
  );
}

async function filterGitIgnoredPaths(cwd: string, relativePaths: string[]): Promise<string[]> {
  if (relativePaths.length === 0) {
    return relativePaths;
  }

  const ignoredPaths = new Set<string>();
  let chunk: string[] = [];
  let chunkBytes = 0;

  const flushChunk = async (): Promise<boolean> => {
    if (chunk.length === 0) {
      return true;
    }

    const checkIgnore = await runProcess("git", ["check-ignore", "--no-index", "-z", "--stdin"], {
      cwd,
      allowNonZeroExit: true,
      timeoutMs: 20_000,
      maxBufferBytes: 16 * 1024 * 1024,
      outputMode: "truncate",
      stdin: `${chunk.join("\0")}\0`,
    }).catch(() => null);
    chunk = [];
    chunkBytes = 0;

    if (!checkIgnore) {
      return false;
    }

    // git-check-ignore exits with 1 when no paths match.
    if (checkIgnore.code !== 0 && checkIgnore.code !== 1) {
      return false;
    }

    const matchedIgnoredPaths = splitNullSeparatedPaths(
      checkIgnore.stdout,
      Boolean(checkIgnore.stdoutTruncated),
    );
    for (const ignoredPath of matchedIgnoredPaths) {
      ignoredPaths.add(ignoredPath);
    }
    return true;
  };

  for (const relativePath of relativePaths) {
    const relativePathBytes = Buffer.byteLength(relativePath) + 1;
    if (
      chunk.length > 0 &&
      chunkBytes + relativePathBytes > GIT_CHECK_IGNORE_MAX_STDIN_BYTES &&
      !(await flushChunk())
    ) {
      return relativePaths;
    }

    chunk.push(relativePath);
    chunkBytes += relativePathBytes;

    if (chunkBytes >= GIT_CHECK_IGNORE_MAX_STDIN_BYTES && !(await flushChunk())) {
      return relativePaths;
    }
  }

  if (!(await flushChunk())) {
    return relativePaths;
  }

  if (ignoredPaths.size === 0) {
    return relativePaths;
  }

  return relativePaths.filter((relativePath) => !ignoredPaths.has(relativePath));
}

async function buildWorkspaceIndexFromGit(cwd: string): Promise<WorkspaceIndex | null> {
  if (!(await isInsideGitWorkTree(cwd))) {
    return null;
  }

  const listedFiles = await runProcess(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd,
      allowNonZeroExit: true,
      timeoutMs: 20_000,
      maxBufferBytes: 16 * 1024 * 1024,
      outputMode: "truncate",
    },
  ).catch(() => null);
  if (!listedFiles || listedFiles.code !== 0) {
    return null;
  }

  const listedPaths = splitNullSeparatedPaths(
    listedFiles.stdout,
    Boolean(listedFiles.stdoutTruncated),
  )
    .map((entry) => toPosixPath(entry))
    .filter((entry) => entry.length > 0 && !isPathInIgnoredDirectory(entry));
  const filePaths = await filterGitIgnoredPaths(cwd, listedPaths);

  const directorySet = new Set<string>();
  for (const filePath of filePaths) {
    for (const directoryPath of directoryAncestorsOf(filePath)) {
      if (!isPathInIgnoredDirectory(directoryPath)) {
        directorySet.add(directoryPath);
      }
    }
  }

  const directoryEntries: ProjectEntry[] = [...directorySet]
    .toSorted((left, right) => left.localeCompare(right))
    .map((directoryPath) => ({
      path: directoryPath,
      kind: "directory",
      parentPath: parentPathOf(directoryPath),
    }));
  const fileEntries: ProjectEntry[] = [...new Set(filePaths)]
    .toSorted((left, right) => left.localeCompare(right))
    .map((filePath) => ({
      path: filePath,
      kind: "file",
      parentPath: parentPathOf(filePath),
    }));

  const entries = [...directoryEntries, ...fileEntries];
  return {
    scannedAt: Date.now(),
    entries: entries.slice(0, WORKSPACE_INDEX_MAX_ENTRIES),
    truncated: Boolean(listedFiles.stdoutTruncated) || entries.length > WORKSPACE_INDEX_MAX_ENTRIES,
  };
}

async function buildWorkspaceIndex(cwd: string): Promise<WorkspaceIndex> {
  const gitIndexed = await buildWorkspaceIndexFromGit(cwd);
  if (gitIndexed) {
    return gitIndexed;
  }
  const shouldFilterWithGitIgnore = await isInsideGitWorkTree(cwd);

  let pendingDirectories: string[] = [""];
  const entries: ProjectEntry[] = [];
  let truncated = false;

  while (pendingDirectories.length > 0 && !truncated) {
    const currentDirectories = pendingDirectories;
    pendingDirectories = [];
    const directoryEntries = await mapWithConcurrency(
      currentDirectories,
      WORKSPACE_SCAN_READDIR_CONCURRENCY,
      async (relativeDir) => {
        const absoluteDir = relativeDir ? path.join(cwd, relativeDir) : cwd;
        try {
          const dirents = await fs.readdir(absoluteDir, { withFileTypes: true });
          return { relativeDir, dirents };
        } catch (error) {
          if (!relativeDir) {
            throw new Error(
              `Unable to scan workspace entries at '${cwd}': ${error instanceof Error ? error.message : "unknown error"}`,
              { cause: error },
            );
          }
          return { relativeDir, dirents: null };
        }
      },
    );

    const candidateEntriesByDirectory = directoryEntries.map((directoryEntry) => {
      const { relativeDir, dirents } = directoryEntry;
      if (!dirents) return [] as Array<{ dirent: Dirent; relativePath: string }>;

      dirents.sort((left, right) => left.name.localeCompare(right.name));
      const candidates: Array<{ dirent: Dirent; relativePath: string }> = [];
      for (const dirent of dirents) {
        if (!dirent.name || dirent.name === "." || dirent.name === "..") {
          continue;
        }
        if (dirent.isDirectory() && IGNORED_DIRECTORY_NAMES.has(dirent.name)) {
          continue;
        }
        if (!dirent.isDirectory() && !dirent.isFile()) {
          continue;
        }

        const relativePath = toPosixPath(
          relativeDir ? path.join(relativeDir, dirent.name) : dirent.name,
        );
        if (isPathInIgnoredDirectory(relativePath)) {
          continue;
        }
        candidates.push({ dirent, relativePath });
      }
      return candidates;
    });

    const candidatePaths = candidateEntriesByDirectory.flatMap((candidateEntries) =>
      candidateEntries.map((entry) => entry.relativePath),
    );
    const allowedPathSet = shouldFilterWithGitIgnore
      ? new Set(await filterGitIgnoredPaths(cwd, candidatePaths))
      : null;

    for (const candidateEntries of candidateEntriesByDirectory) {
      for (const candidate of candidateEntries) {
        if (allowedPathSet && !allowedPathSet.has(candidate.relativePath)) {
          continue;
        }

        const entry: ProjectEntry = {
          path: candidate.relativePath,
          kind: candidate.dirent.isDirectory() ? "directory" : "file",
          parentPath: parentPathOf(candidate.relativePath),
        };
        entries.push(entry);

        if (candidate.dirent.isDirectory()) {
          pendingDirectories.push(candidate.relativePath);
        }

        if (entries.length >= WORKSPACE_INDEX_MAX_ENTRIES) {
          truncated = true;
          break;
        }
      }

      if (truncated) {
        break;
      }
    }
  }

  return {
    scannedAt: Date.now(),
    entries,
    truncated,
  };
}

async function getWorkspaceIndex(cwd: string): Promise<WorkspaceIndex> {
  const cached = workspaceIndexCache.get(cwd);
  if (cached && Date.now() - cached.scannedAt < WORKSPACE_CACHE_TTL_MS) {
    return cached;
  }

  const inFlight = inFlightWorkspaceIndexBuilds.get(cwd);
  if (inFlight) {
    return inFlight;
  }

  const nextPromise = buildWorkspaceIndex(cwd)
    .then((next) => {
      workspaceIndexCache.set(cwd, next);
      while (workspaceIndexCache.size > WORKSPACE_CACHE_MAX_KEYS) {
        const oldestKey = workspaceIndexCache.keys().next().value;
        if (!oldestKey) break;
        workspaceIndexCache.delete(oldestKey);
      }
      return next;
    })
    .finally(() => {
      inFlightWorkspaceIndexBuilds.delete(cwd);
    });
  inFlightWorkspaceIndexBuilds.set(cwd, nextPromise);
  return nextPromise;
}

export function clearWorkspaceIndexCache(cwd: string): void {
  workspaceIndexCache.delete(cwd);
  inFlightWorkspaceIndexBuilds.delete(cwd);
}

export async function searchWorkspaceEntries(
  input: ProjectSearchEntriesInput,
): Promise<ProjectSearchEntriesResult> {
  const index = await getWorkspaceIndex(input.cwd);
  const normalizedQuery = normalizeQuery(input.query);
  const candidates = normalizedQuery
    ? index.entries.filter((entry) => entry.path.toLowerCase().includes(normalizedQuery))
    : index.entries;

  const ranked = candidates.toSorted((left, right) => {
    const scoreDelta = scoreEntry(left, normalizedQuery) - scoreEntry(right, normalizedQuery);
    if (scoreDelta !== 0) return scoreDelta;
    return left.path.localeCompare(right.path);
  });

  return {
    entries: ranked.slice(0, input.limit),
    truncated: index.truncated || ranked.length > input.limit,
  };
}

function classifyWorkspaceEntry(
  entryPath: string,
): "video" | "audio" | "image" | "subtitle" | "document" | "other" {
  const extension = fileExtensionOf(entryPath);
  if (VIDEO_FILE_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_FILE_EXTENSIONS.has(extension)) return "audio";
  if (IMAGE_FILE_EXTENSIONS.has(extension)) return "image";
  if (SUBTITLE_FILE_EXTENSIONS.has(extension)) return "subtitle";
  if (DOCUMENT_FILE_EXTENSIONS.has(extension)) return "document";
  return "other";
}

function hasExactEntry(
  entries: readonly ProjectEntry[],
  targetPath: string,
  kind?: ProjectEntry["kind"],
) {
  return entries.some(
    (entry) => entry.path === targetPath && (kind === undefined || entry.kind === kind),
  );
}

function collectSamplePaths(
  entries: readonly ProjectEntry[],
  expectedKind: ReturnType<typeof classifyWorkspaceEntry>,
  limit = 3,
): string[] {
  const matches = entries
    .filter((entry) => entry.kind === "file" && classifyWorkspaceEntry(entry.path) === expectedKind)
    .map((entry) => entry.path);
  return matches.slice(0, limit);
}

function compareExportPaths(left: string, right: string): number {
  return right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
}

function isPreviewableVideoPath(entryPath: string): boolean {
  return PREVIEWABLE_VIDEO_FILE_EXTENSIONS.has(fileExtensionOf(entryPath));
}

async function readTextFileIfPresent(filePath: string, maxBytes: number): Promise<string | null> {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.allocUnsafe(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      if (bytesRead <= 0) {
        return "";
      }
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export async function readProjectInstructionExcerpt(
  cwd: string,
  relativePath: string,
  maxBytes: number,
): Promise<string | null> {
  return readTextFileIfPresent(path.join(cwd, relativePath), maxBytes);
}

async function resolveDependencyStatuses(
  cwd: string,
): Promise<ProjectWorkspaceInspectResult["dependencyStatuses"]> {
  const commandExists = async (command: string, args: readonly string[] = ["--version"]) => {
    const result = await runProcess(command, args, {
      cwd,
      allowNonZeroExit: true,
      timeoutMs: 10_000,
      maxBufferBytes: 64 * 1024,
      outputMode: "truncate",
    }).catch((error) => error);
    if (result instanceof Error) {
      return { ok: false as const, detail: result.message };
    }

    const detail = [result.stdout.trim(), result.stderr.trim()].find((value) => value.length > 0);
    if (result.code === 0) {
      return { ok: true as const, detail: detail ?? "Installed" };
    }
    return {
      ok: false as const,
      detail: detail ?? `${command} exited with code ${result.code ?? "null"}`,
    };
  };

  const pipPackageExists = async (command: string, packageName: string) => {
    const result = await runProcess(command, ["-m", "pip", "show", packageName], {
      cwd,
      allowNonZeroExit: true,
      timeoutMs: 10_000,
      maxBufferBytes: 64 * 1024,
      outputMode: "truncate",
    }).catch((error) => error);
    if (result instanceof Error) {
      return { ok: false as const, detail: result.message };
    }

    const output = [result.stdout.trim(), result.stderr.trim()].find((value) => value.length > 0);
    if (result.code === 0) {
      const versionLine = output
        ?.split(/\r?\n/)
        .find((line: string) => line.toLowerCase().startsWith("version:"));
      return { ok: true as const, detail: versionLine ?? "Installed" };
    }
    return {
      ok: false as const,
      detail: output ?? `${packageName} is not installed`,
    };
  };

  const [kdenlive, ffmpeg, python, codex] = await Promise.all([
    commandExists("kdenlive"),
    commandExists("ffmpeg"),
    commandExists("python"),
    commandExists("codex", ["--version"]),
  ]);

  const harnessggKdenlive = python.ok
    ? await pipPackageExists("python", "harnessgg-kdenlive")
    : { ok: false as const, detail: "Python is required before checking harnessgg-kdenlive" };

  return [
    {
      key: "codex",
      label: "Codex CLI",
      status: codex.ok ? "ready" : ("missing" as const),
      detail: codex.detail,
    },
    {
      key: "kdenlive",
      label: "Kdenlive",
      status: kdenlive.ok ? "ready" : ("missing" as const),
      detail: kdenlive.detail,
    },
    {
      key: "ffmpeg",
      label: "FFmpeg",
      status: ffmpeg.ok ? "ready" : ("missing" as const),
      detail: ffmpeg.detail,
    },
    {
      key: "python",
      label: "Python",
      status: python.ok ? "ready" : ("missing" as const),
      detail: python.detail,
    },
    {
      key: "harnessgg-kdenlive",
      label: "harnessgg-kdenlive",
      status: harnessggKdenlive.ok ? "ready" : ("missing" as const),
      detail: harnessggKdenlive.detail,
    },
  ];
}

export async function inspectWorkspace(
  input: ProjectWorkspaceInspectInput,
): Promise<ProjectWorkspaceInspectResult> {
  await ensureHarnessWorkspaceScaffold(input.cwd);
  clearWorkspaceIndexCache(input.cwd);
  const index = await getWorkspaceIndex(input.cwd);
  const entries = index.entries;
  const mediaSummary = {
    videoCount: 0,
    audioCount: 0,
    imageCount: 0,
    subtitleCount: 0,
    documentCount: 0,
    otherCount: 0,
  };

  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue;
    }

    const category = classifyWorkspaceEntry(entry.path);
    switch (category) {
      case "video":
        mediaSummary.videoCount += 1;
        break;
      case "audio":
        mediaSummary.audioCount += 1;
        break;
      case "image":
        mediaSummary.imageCount += 1;
        break;
      case "subtitle":
        mediaSummary.subtitleCount += 1;
        break;
      case "document":
        mediaSummary.documentCount += 1;
        break;
      case "other":
        mediaSummary.otherCount += 1;
        break;
    }
  }

  const hasStyleGuide = hasExactEntry(entries, "STYLE.md", "file");
  const hasHarnessFolder = hasExactEntry(entries, ".harnessgg", "directory");
  const hasExportsFolder = hasExactEntry(entries, ".harnessgg/exports", "directory");
  const exportPaths = entries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        entry.path.startsWith(".harnessgg/exports/") &&
        isPreviewableVideoPath(entry.path),
    )
    .map((entry) => entry.path)
    .toSorted(compareExportPaths);
  const exportCount = entries.filter(
    (entry) => entry.kind === "file" && entry.path.startsWith(".harnessgg/exports/"),
  ).length;
  const mediaEntries = entries
    .filter((entry) => entry.kind === "file")
    .filter((entry) => {
      const category = classifyWorkspaceEntry(entry.path);
      return (
        category === "video" ||
        category === "audio" ||
        category === "image" ||
        category === "subtitle" ||
        category === "document"
      );
    })
    .slice(0, 60);
  const styleGuideExcerpt = hasStyleGuide
    ? await readTextFileIfPresent(path.join(input.cwd, "STYLE.md"), 2_000)
    : null;
  const dependencyStatuses = await resolveDependencyStatuses(input.cwd);

  return {
    cwd: input.cwd,
    hasStyleGuide,
    styleGuidePath: hasStyleGuide ? "STYLE.md" : null,
    hasHarnessFolder,
    harnessFolderPath: hasHarnessFolder ? ".harnessgg" : null,
    hasExportsFolder,
    exportsFolderPath: hasExportsFolder ? ".harnessgg/exports" : null,
    exportCount,
    latestExportPath: exportPaths[0] ?? null,
    exportPaths: exportPaths.slice(0, 8),
    mediaSummary,
    mediaEntries,
    sampleVideoPaths: collectSamplePaths(entries, "video"),
    sampleAudioPaths: collectSamplePaths(entries, "audio"),
    sampleImagePaths: collectSamplePaths(entries, "image"),
    styleGuideExcerpt: styleGuideExcerpt?.trim() || null,
    dependencyStatuses,
  };
}
