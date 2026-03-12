import type { ProjectSearchEntriesResult, ProjectWorkspaceInspectResult } from "@studio/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const projectQueryKeys = {
  all: ["projects"] as const,
  inspectWorkspace: (cwd: string | null) => ["projects", "inspect-workspace", cwd] as const,
  searchEntries: (cwd: string | null, query: string, limit: number) =>
    ["projects", "search-entries", cwd, query, limit] as const,
};

const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
const DEFAULT_INSPECT_WORKSPACE_STALE_TIME = 15_000;
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};
const EMPTY_INSPECT_WORKSPACE_RESULT: ProjectWorkspaceInspectResult = {
  cwd: "",
  hasStyleGuide: false,
  styleGuidePath: null,
  hasHarnessFolder: false,
  harnessFolderPath: null,
  hasExportsFolder: false,
  exportsFolderPath: null,
  exportCount: 0,
  latestExportPath: null,
  exportPaths: [],
  mediaSummary: {
    videoCount: 0,
    audioCount: 0,
    imageCount: 0,
    subtitleCount: 0,
    documentCount: 0,
    otherCount: 0,
  },
  mediaEntries: [],
  sampleVideoPaths: [],
  sampleAudioPaths: [],
  sampleImagePaths: [],
  styleGuideExcerpt: null,
  dependencyStatuses: [],
};

export function projectInspectWorkspaceQueryOptions(input: {
  cwd: string | null;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: projectQueryKeys.inspectWorkspace(input.cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace inspection is unavailable.");
      }
      return api.projects.inspectWorkspace({
        cwd: input.cwd,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: input.staleTime ?? DEFAULT_INSPECT_WORKSPACE_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_INSPECT_WORKSPACE_RESULT,
  });
}

export function projectSearchEntriesQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry search is unavailable.");
      }
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}
