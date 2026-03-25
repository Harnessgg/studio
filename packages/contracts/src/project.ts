import { Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
export const PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const PROJECT_STYLE_GUIDE_MAX_VIDEO_DATA_URL_CHARS = 45_000_000;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literals(["file", "directory"]);

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;

export const ProjectStyleGuideUploadedVideoSource = Schema.Struct({
  type: Schema.Literal("upload"),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100), Schema.isPattern(/^video\//i)),
  sizeBytes: NonNegativeInt.check(Schema.isLessThanOrEqualTo(PROJECT_STYLE_GUIDE_MAX_VIDEO_BYTES)),
  dataUrl: TrimmedNonEmptyString.check(
    Schema.isMaxLength(PROJECT_STYLE_GUIDE_MAX_VIDEO_DATA_URL_CHARS),
  ),
});
export type ProjectStyleGuideUploadedVideoSource = typeof ProjectStyleGuideUploadedVideoSource.Type;

export const ProjectStyleGuideUrlSource = Schema.Struct({
  type: Schema.Literal("url"),
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(2_048), Schema.isPattern(/^https?:\/\//i)),
});
export type ProjectStyleGuideUrlSource = typeof ProjectStyleGuideUrlSource.Type;

export const ProjectStyleGuideSource = Schema.Union([
  ProjectStyleGuideUploadedVideoSource,
  ProjectStyleGuideUrlSource,
]);
export type ProjectStyleGuideSource = typeof ProjectStyleGuideSource.Type;

export const ProjectGenerateStyleGuideInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  source: ProjectStyleGuideSource,
});
export type ProjectGenerateStyleGuideInput = typeof ProjectGenerateStyleGuideInput.Type;

export const ProjectStyleGuideSourceSummary = Schema.Struct({
  sourceType: Schema.Literals(["upload", "url"]),
  displayName: TrimmedNonEmptyString,
  resolvedPath: Schema.NullOr(TrimmedNonEmptyString),
  resolvedUrl: Schema.NullOr(TrimmedNonEmptyString),
  frameCount: NonNegativeInt,
  warnings: Schema.Array(TrimmedNonEmptyString),
});
export type ProjectStyleGuideSourceSummary = typeof ProjectStyleGuideSourceSummary.Type;

export const ProjectGenerateStyleGuideResult = Schema.Struct({
  markdown: TrimmedNonEmptyString,
  sourceSummary: ProjectStyleGuideSourceSummary,
});
export type ProjectGenerateStyleGuideResult = typeof ProjectGenerateStyleGuideResult.Type;

export const ProjectWorkspaceInspectInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type ProjectWorkspaceInspectInput = typeof ProjectWorkspaceInspectInput.Type;

export const ProjectWorkspaceMediaSummary = Schema.Struct({
  videoCount: NonNegativeInt,
  audioCount: NonNegativeInt,
  imageCount: NonNegativeInt,
  subtitleCount: NonNegativeInt,
  documentCount: NonNegativeInt,
  otherCount: NonNegativeInt,
});
export type ProjectWorkspaceMediaSummary = typeof ProjectWorkspaceMediaSummary.Type;

export const ProjectWorkspaceDependencyStatusState = Schema.Literals(["ready", "missing", "error"]);
export type ProjectWorkspaceDependencyStatusState =
  typeof ProjectWorkspaceDependencyStatusState.Type;

export const ProjectWorkspaceDependencyStatus = Schema.Struct({
  key: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  status: ProjectWorkspaceDependencyStatusState,
  detail: TrimmedNonEmptyString,
});
export type ProjectWorkspaceDependencyStatus = typeof ProjectWorkspaceDependencyStatus.Type;

export const ProjectWorkspaceInspectResult = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  hasStyleGuide: Schema.Boolean,
  styleGuidePath: Schema.NullOr(TrimmedNonEmptyString),
  hasHarnessFolder: Schema.Boolean,
  harnessFolderPath: Schema.NullOr(TrimmedNonEmptyString),
  hasExportsFolder: Schema.Boolean,
  exportsFolderPath: Schema.NullOr(TrimmedNonEmptyString),
  exportCount: NonNegativeInt,
  latestExportPath: Schema.NullOr(TrimmedNonEmptyString),
  exportPaths: Schema.Array(TrimmedNonEmptyString),
  mediaSummary: ProjectWorkspaceMediaSummary,
  mediaEntries: Schema.Array(ProjectEntry),
  sampleVideoPaths: Schema.Array(TrimmedNonEmptyString),
  sampleAudioPaths: Schema.Array(TrimmedNonEmptyString),
  sampleImagePaths: Schema.Array(TrimmedNonEmptyString),
  styleGuideExcerpt: Schema.NullOr(Schema.String),
  dependencyStatuses: Schema.Array(ProjectWorkspaceDependencyStatus),
});
export type ProjectWorkspaceInspectResult = typeof ProjectWorkspaceInspectResult.Type;
