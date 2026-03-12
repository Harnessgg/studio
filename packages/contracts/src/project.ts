import { Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;

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
