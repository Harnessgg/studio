import type { ProjectEntry } from "@t3tools/contracts";

export type WorkspacePreviewKind = "video" | "audio" | "image" | "document" | "other";

export function buildWorkspaceFileUrl(cwd: string, relativePath: string): string | null {
  const bridgeWsUrl = window.desktopBridge?.getWsUrl?.() ?? null;
  const baseUrl = bridgeWsUrl ? bridgeWsUrl.replace(/^ws/i, "http") : window.location.origin;
  try {
    const url = new URL("/workspace-file", baseUrl);
    url.searchParams.set("cwd", cwd);
    url.searchParams.set("path", relativePath);
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveWorkspaceAbsolutePath(cwd: string, relativePath: string): string {
  const separator = cwd.includes("\\") ? "\\" : "/";
  const normalizedRelativePath = relativePath.replaceAll("/", separator);
  if (cwd.endsWith(separator)) {
    return `${cwd}${normalizedRelativePath}`;
  }
  return `${cwd}${separator}${normalizedRelativePath}`;
}

export function workspaceEntryCategoryLabel(entry: ProjectEntry): string {
  const normalized = entry.path.toLowerCase();
  if (/\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg)$/i.test(normalized)) return "Video";
  if (/\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(normalized)) return "Audio";
  if (/\.(png|jpg|jpeg|gif|webp|svg|psd|tif|tiff)$/i.test(normalized)) return "Image";
  if (/\.(srt|vtt|ass)$/i.test(normalized)) return "Subtitle";
  if (/\.(md|txt|doc|docx|pdf)$/i.test(normalized)) return "Document";
  return "Media";
}

export function classifyWorkspacePreviewKind(relativePath: string): WorkspacePreviewKind {
  const normalized = relativePath.toLowerCase();
  if (/\.(mp4|mov|m4v|webm|ogv)$/i.test(normalized)) return "video";
  if (/\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(normalized)) return "audio";
  if (/\.(png|jpg|jpeg|gif|webp|svg|psd|tif|tiff|heic)$/i.test(normalized)) return "image";
  if (/\.(pdf|txt|md|html?)$/i.test(normalized)) return "document";
  return "other";
}
