import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  type ProjectGenerateStyleGuideInput,
  PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES,
  type ProjectGenerateStyleGuideResult,
  type ProjectStyleGuideSourceSummary,
} from "@studio/contracts";
import { Schema } from "effect";

import { buildDefaultProjectStyleGuide } from "./harnessProjectTemplates";
import { parseBase64DataUrl } from "./imageMime";
import { runProcess } from "./processRunner";
import { ensureHarnessWorkspaceScaffold, readProjectInstructionExcerpt } from "./workspaceEntries";

const CODEX_MODEL = "gpt-5.3-codex";
const CODEX_REASONING_EFFORT = "low";
const CODEX_TIMEOUT_MS = 180_000;
const URL_FETCH_TIMEOUT_MS = 60_000;
const FRAME_CAPTURE_COUNT = 4;
const FFPROBE_TIMEOUT_MS = 30_000;
const FFMPEG_TIMEOUT_MS = 60_000;
const SAFE_VIDEO_EXTENSIONS = new Set([
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
const SAFE_VIDEO_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
  "video/x-msvideo": ".avi",
  "video/x-ms-wmv": ".wmv",
  "video/mpeg": ".mpeg",
  "video/ogg": ".ogv",
  "video/3gpp": ".3gp",
  "video/3gpp2": ".3g2",
  "video/x-matroska": ".mkv",
};

type CodexStyleGuideResponse = {
  markdown: string;
  warnings: readonly string[];
};

type VideoProbeResult = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  containerFormat: string | null;
  bitRate: string | null;
};

function parsePositiveNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return input;
  }
  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function sanitizeFileSegment(input: string): string {
  const normalized = input
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return normalized.length > 0 ? normalized : "reference";
}

function inferVideoExtension(input: {
  mimeType?: string;
  fileName?: string;
  url?: string;
}): string {
  const mimeType = input.mimeType?.toLowerCase();
  const fromMimeType = mimeType ? SAFE_VIDEO_EXTENSION_BY_MIME_TYPE[mimeType] : undefined;
  if (fromMimeType) {
    return fromMimeType;
  }

  const candidates = [input.fileName, input.url];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const extension = path.extname(candidate).toLowerCase();
    if (SAFE_VIDEO_EXTENSIONS.has(extension)) {
      return extension;
    }
  }

  return ".mp4";
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds === null) {
    return "unknown";
  }
  if (durationSeconds < 1) {
    return `${durationSeconds.toFixed(2)}s`;
  }
  if (durationSeconds < 60) {
    return `${durationSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

function computeFrameCaptureTimes(durationSeconds: number | null): number[] {
  if (durationSeconds === null || durationSeconds <= 0.25) {
    return [0];
  }

  const positions = [0.1, 0.35, 0.6, 0.85];
  return [
    ...new Set(
      positions
        .slice(0, FRAME_CAPTURE_COUNT)
        .map((position) =>
          Number(
            Math.max(0, Math.min(durationSeconds - 0.1, durationSeconds * position)).toFixed(3),
          ),
        ),
    ),
  ];
}

function toCodexOutputJsonSchema(schema: Schema.Top): unknown {
  const document = Schema.toJsonSchemaDocument(schema);
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    return {
      ...document.schema,
      $defs: document.definitions,
    };
  }
  return document.schema;
}

function normalizeCodexError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      error.message.includes("Command not found: codex") ||
      lower.includes("spawn codex") ||
      lower.includes("enoent")
    ) {
      return new Error("Codex CLI (`codex`) is required but not available on PATH.");
    }
    return new Error(`${fallback}: ${error.message}`);
  }
  return new Error(fallback);
}

async function runCodexStructuredStyleGuide(input: {
  cwd: string;
  prompt: string;
  imagePaths: readonly string[];
  tempDir: string;
}): Promise<CodexStyleGuideResponse> {
  const schemaPath = path.join(input.tempDir, `style-guide-schema-${randomUUID()}.json`);
  const outputPath = path.join(input.tempDir, `style-guide-output-${randomUUID()}.json`);
  const outputSchema = Schema.Struct({
    markdown: Schema.String,
    warnings: Schema.Array(Schema.String),
  });

  await fs.writeFile(schemaPath, JSON.stringify(toCodexOutputJsonSchema(outputSchema)), "utf8");
  await fs.writeFile(outputPath, "", "utf8");

  try {
    await runProcess(
      "codex",
      [
        "exec",
        "--ephemeral",
        "-s",
        "read-only",
        "--model",
        CODEX_MODEL,
        "--config",
        `model_reasoning_effort="${CODEX_REASONING_EFFORT}"`,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        ...input.imagePaths.flatMap((imagePath) => ["--image", imagePath]),
        "-",
      ],
      {
        cwd: input.cwd,
        stdin: input.prompt,
        timeoutMs: CODEX_TIMEOUT_MS,
      },
    );

    const raw = await fs.readFile(outputPath, "utf8");
    let decoded: CodexStyleGuideResponse;
    try {
      decoded = Schema.decodeUnknownSync(outputSchema)(JSON.parse(raw) as unknown);
    } catch (error) {
      throw new Error("Codex returned invalid structured output.", { cause: error });
    }
    const markdown = decoded.markdown.trim();
    if (markdown.length === 0) {
      throw new Error("Codex returned an empty style guide.");
    }
    return {
      markdown,
      warnings: decoded.warnings
        .map((warning) => warning.trim())
        .filter((warning) => warning.length > 0),
    };
  } catch (error) {
    throw normalizeCodexError(error, "Failed to generate style guide with Codex");
  } finally {
    await Promise.allSettled([
      fs.rm(schemaPath, { force: true }),
      fs.rm(outputPath, { force: true }),
    ]);
  }
}

async function probeVideo(videoPath: string): Promise<VideoProbeResult> {
  let parsed: Record<string, unknown>;
  try {
    const result = await runProcess(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", videoPath],
      {
        timeoutMs: FFPROBE_TIMEOUT_MS,
      },
    );
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Command not found: ffprobe")) {
      throw new Error("FFprobe is required but not available on PATH.", { cause: error });
    }
    throw new Error(
      error instanceof Error
        ? `Failed to inspect video: ${error.message}`
        : "Failed to inspect video.",
      { cause: error },
    );
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const format = parsed.format && typeof parsed.format === "object" ? parsed.format : null;
  const videoStream =
    streams.find(
      (stream) =>
        stream &&
        typeof stream === "object" &&
        "codec_type" in stream &&
        (stream as Record<string, unknown>).codec_type === "video",
    ) ?? null;
  const audioStream =
    streams.find(
      (stream) =>
        stream &&
        typeof stream === "object" &&
        "codec_type" in stream &&
        (stream as Record<string, unknown>).codec_type === "audio",
    ) ?? null;

  const videoStreamRecord =
    videoStream && typeof videoStream === "object"
      ? (videoStream as Record<string, unknown>)
      : null;
  const audioStreamRecord =
    audioStream && typeof audioStream === "object"
      ? (audioStream as Record<string, unknown>)
      : null;
  const formatRecord =
    format && typeof format === "object" ? (format as Record<string, unknown>) : null;

  return {
    durationSeconds:
      parsePositiveNumber(formatRecord?.duration) ??
      parsePositiveNumber(videoStreamRecord?.duration),
    width:
      typeof videoStreamRecord?.width === "number" && Number.isFinite(videoStreamRecord.width)
        ? videoStreamRecord.width
        : null,
    height:
      typeof videoStreamRecord?.height === "number" && Number.isFinite(videoStreamRecord.height)
        ? videoStreamRecord.height
        : null,
    frameRate:
      typeof videoStreamRecord?.avg_frame_rate === "string" &&
      videoStreamRecord.avg_frame_rate !== "0/0"
        ? videoStreamRecord.avg_frame_rate
        : null,
    videoCodec:
      typeof videoStreamRecord?.codec_name === "string" ? videoStreamRecord.codec_name : null,
    audioCodec:
      typeof audioStreamRecord?.codec_name === "string" ? audioStreamRecord.codec_name : null,
    containerFormat:
      typeof formatRecord?.format_name === "string" ? formatRecord.format_name : null,
    bitRate: typeof formatRecord?.bit_rate === "string" ? formatRecord.bit_rate : null,
  };
}

async function extractFrames(input: {
  videoPath: string;
  tempDir: string;
  durationSeconds: number | null;
}): Promise<string[]> {
  const captureTimes = computeFrameCaptureTimes(input.durationSeconds);
  const framePaths: string[] = [];

  for (const [index, captureTime] of captureTimes.entries()) {
    const framePath = path.join(input.tempDir, `style-guide-frame-${index + 1}.png`);
    try {
      await runProcess(
        "ffmpeg",
        [
          "-loglevel",
          "error",
          "-y",
          "-ss",
          String(captureTime),
          "-i",
          input.videoPath,
          "-frames:v",
          "1",
          framePath,
        ],
        {
          timeoutMs: FFMPEG_TIMEOUT_MS,
        },
      );
      framePaths.push(framePath);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Command not found: ffmpeg")) {
        throw new Error("FFmpeg is required but not available on PATH.", { cause: error });
      }
      throw new Error(
        error instanceof Error
          ? `Failed to extract reference frames: ${error.message}`
          : "Failed to extract reference frames.",
        { cause: error },
      );
    }
  }

  if (framePaths.length === 0) {
    throw new Error("Could not extract any reference frames from the video.");
  }

  return framePaths;
}

async function writeUploadedSource(input: {
  source: Extract<ProjectGenerateStyleGuideInput["source"], { type: "upload" }>;
  tempDir: string;
}): Promise<{ videoPath: string; displayName: string; warnings: string[] }> {
  const parsed = parseBase64DataUrl(input.source.dataUrl);
  if (!parsed || !parsed.mimeType.startsWith("video/")) {
    throw new Error(`Invalid uploaded video payload for '${input.source.name}'.`);
  }

  const bytes = Buffer.from(parsed.base64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES) {
    throw new Error(
      `Uploaded video '${input.source.name}' is empty or exceeds the ${Math.floor(PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  const extension = inferVideoExtension({
    mimeType: parsed.mimeType,
    fileName: input.source.name,
  });
  const fileName = `${sanitizeFileSegment(path.basename(input.source.name, path.extname(input.source.name)))}${extension}`;
  const videoPath = path.join(input.tempDir, fileName);
  await fs.writeFile(videoPath, bytes);

  const warnings: string[] = [];
  if (input.source.mimeType.toLowerCase() !== parsed.mimeType.toLowerCase()) {
    warnings.push(
      `Uploaded MIME type was normalized from ${input.source.mimeType} to ${parsed.mimeType}.`,
    );
  }

  return {
    videoPath,
    displayName: input.source.name,
    warnings,
  };
}

async function downloadUrlSource(input: {
  source: Extract<ProjectGenerateStyleGuideInput["source"], { type: "url" }>;
  tempDir: string;
}): Promise<{ videoPath: string; displayName: string; warnings: string[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(input.source.url, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Remote fetch failed with HTTP ${response.status}.`);
    }

    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;
    if (
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES
    ) {
      throw new Error(
        `Remote video exceeds the ${Math.floor(PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES / (1024 * 1024))} MB limit.`,
      );
    }

    const resolvedUrl = response.url || input.source.url;
    const extension = inferVideoExtension({
      mimeType: contentType,
      url: resolvedUrl,
    });
    const urlObject = new URL(resolvedUrl);
    const displayName = path.basename(urlObject.pathname) || urlObject.hostname;
    const videoPath = path.join(
      input.tempDir,
      `${sanitizeFileSegment(path.basename(displayName, path.extname(displayName)))}${extension}`,
    );

    if (!response.body) {
      throw new Error("Remote response did not include a readable body.");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES) {
        throw new Error(
          `Remote video exceeds the ${Math.floor(PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES / (1024 * 1024))} MB limit.`,
        );
      }
      chunks.push(buffer);
    }

    if (totalBytes === 0) {
      throw new Error("Remote video response was empty.");
    }

    const looksLikeVideo =
      contentType.startsWith("video/") ||
      contentType === "application/octet-stream" ||
      SAFE_VIDEO_EXTENSIONS.has(extension);
    if (!looksLikeVideo) {
      throw new Error(
        "The URL did not resolve to a direct video file. Use a public direct media URL.",
      );
    }

    await fs.writeFile(videoPath, Buffer.concat(chunks));
    return {
      videoPath,
      displayName,
      warnings:
        !contentType.startsWith("video/") && contentType.length > 0
          ? [`Remote content type '${contentType}' was accepted based on the file extension.`]
          : [],
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Timed out while downloading the remote video.", { cause: error });
    }
    throw new Error(error instanceof Error ? error.message : "Failed to download remote video.", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildStyleGuidePrompt(input: {
  cwd: string;
  sourceSummary: ProjectStyleGuideSourceSummary;
  probe: VideoProbeResult;
  existingStyleGuideExcerpt: string | null;
}): string {
  const desiredTemplate = buildDefaultProjectStyleGuide(input.cwd);
  const metadataLines = [
    `Source: ${input.sourceSummary.displayName}`,
    `Duration: ${formatDuration(input.probe.durationSeconds)}`,
    `Resolution: ${input.probe.width && input.probe.height ? `${input.probe.width}x${input.probe.height}` : "unknown"}`,
    `Frame rate: ${input.probe.frameRate ?? "unknown"}`,
    `Container: ${input.probe.containerFormat ?? "unknown"}`,
    `Video codec: ${input.probe.videoCodec ?? "unknown"}`,
    `Audio codec: ${input.probe.audioCodec ?? "unknown"}`,
    `Bitrate: ${input.probe.bitRate ?? "unknown"}`,
    `Reference frames attached: ${input.sourceSummary.frameCount}`,
  ];

  return [
    "You create project STYLE.md files for Studio by HarnessGG.",
    "Analyze the attached reference frames and metadata from the provided video.",
    "Return a JSON object with keys `markdown` and `warnings`.",
    "Rules:",
    "- `markdown` must be valid STYLE.md content only, with no code fences and no prose before or after the document.",
    "- Keep the document concise, practical, and reusable across the project.",
    "- Infer tone, subtitle styling, transitions, color treatment, audio treatment, and export defaults from the reference.",
    "- Use clear, concrete defaults instead of hedging language.",
    "- If the signal is weak or incomplete, choose conservative defaults and explain that in `warnings`, not inside `markdown`.",
    "- Preserve the general section structure of the provided template unless the reference strongly suggests a better version.",
    "",
    "Project root:",
    input.cwd,
    "",
    "Reference metadata:",
    ...metadataLines,
    "",
    "Existing STYLE.md excerpt:",
    input.existingStyleGuideExcerpt ?? "(none)",
    "",
    "Desired template shape:",
    desiredTemplate,
  ].join("\n");
}

export async function generateProjectStyleGuide(
  input: ProjectGenerateStyleGuideInput,
): Promise<ProjectGenerateStyleGuideResult> {
  await ensureHarnessWorkspaceScaffold(input.cwd);

  const tempDir = path.join(input.cwd, ".harnessgg", "tmp", `style-guide-${randomUUID()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const stagedSource =
      input.source.type === "upload"
        ? await writeUploadedSource({ source: input.source, tempDir })
        : await downloadUrlSource({ source: input.source, tempDir });
    const probe = await probeVideo(stagedSource.videoPath);
    const framePaths = await extractFrames({
      videoPath: stagedSource.videoPath,
      tempDir,
      durationSeconds: probe.durationSeconds,
    });
    const existingStyleGuideExcerpt = await readProjectInstructionExcerpt(
      input.cwd,
      "STYLE.md",
      4_000,
    );
    const sourceSummary: ProjectStyleGuideSourceSummary = {
      sourceType: input.source.type,
      displayName: stagedSource.displayName,
      resolvedPath: null,
      resolvedUrl: input.source.type === "url" ? input.source.url : null,
      frameCount: framePaths.length,
      warnings: stagedSource.warnings,
    };
    const codexResult = await runCodexStructuredStyleGuide({
      cwd: input.cwd,
      prompt: buildStyleGuidePrompt({
        cwd: input.cwd,
        sourceSummary,
        probe,
        existingStyleGuideExcerpt,
      }),
      imagePaths: framePaths,
      tempDir,
    });

    return {
      markdown: codexResult.markdown.trim(),
      sourceSummary: {
        ...sourceSummary,
        warnings: [...sourceSummary.warnings, ...codexResult.warnings],
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
