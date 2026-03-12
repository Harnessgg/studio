export type CodexStudioResult =
  | {
      status: "done";
      relativePath: string | null;
    }
  | {
      status: "error";
      errorMessage: string | null;
    };

const STUDIO_RESULT_LINE_REGEX = /^STUDIO_RESULT:\s*(DONE|ERROR)\s*$/gim;
const WINDOWS_ABSOLUTE_PATH_REGEX = /^(?:[A-Za-z]:[\\/]|\\\\)/;
const URI_SCHEME_REGEX = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function normalizeStudioRelativePath(rawValue: string): string | null {
  let value = rawValue.trim();
  if (value.length === 0) {
    return null;
  }

  const markdownLinkMatch = value.match(/\[[^\]]*]\((.+?)\)/);
  if (markdownLinkMatch?.[1]) {
    value = markdownLinkMatch[1].trim();
  }

  if (
    (value.startsWith("`") && value.endsWith("`")) ||
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  value = value.replaceAll("\\", "/");
  while (value.startsWith("./")) {
    value = value.slice(2);
  }

  if (
    value.length === 0 ||
    value.startsWith("/") ||
    WINDOWS_ABSOLUTE_PATH_REGEX.test(value) ||
    URI_SCHEME_REGEX.test(value)
  ) {
    return null;
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  return value;
}

export function parseCodexStudioResult(messageText: string): CodexStudioResult | null {
  const normalizedText = messageText.replace(/\r\n/g, "\n");
  const matches = [...normalizedText.matchAll(STUDIO_RESULT_LINE_REGEX)];
  const lastMatch = matches.at(-1);
  const rawStatus = lastMatch?.[1]?.toUpperCase();
  if (!lastMatch || (rawStatus !== "DONE" && rawStatus !== "ERROR")) {
    return null;
  }

  const trailerText = normalizedText.slice(lastMatch.index ?? 0);
  if (rawStatus === "DONE") {
    const fileLine = trailerText.match(/^STUDIO_FILE:\s*(.+)$/im)?.[1] ?? null;
    return {
      status: "done",
      relativePath: fileLine ? normalizeStudioRelativePath(fileLine) : null,
    };
  }

  const errorLine = trailerText.match(/^STUDIO_ERROR:\s*(.+)$/im)?.[1]?.trim() ?? null;
  return {
    status: "error",
    errorMessage: errorLine && errorLine.length > 0 ? errorLine : null,
  };
}
