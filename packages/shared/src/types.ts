export type DependencyStatus = "ok" | "missing" | "warning";
export type SessionStatus = "idle" | "starting" | "ready" | "running" | "error" | "closed";
export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface DependencyCheck {
  key: "kdenlive" | "codex" | "ffmpeg" | "python" | "harnessgg-kdenlive" | "whisper";
  label: string;
  status: DependencyStatus;
  detail: string;
  version?: string;
  installUrl?: string;
  checkedAt: string;
}

export interface ExportRecord {
  id: string;
  fileName: string;
  absolutePath: string;
  createdAt: string;
  sourceRunId?: string;
}

export interface AgentEvent {
  id: string;
  createdAt: string;
  level: "info" | "warning" | "error";
  phase: "session" | "plan" | "tool" | "progress" | "result";
  message: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
  runId?: string;
}

export interface AgentRunRecord {
  id: string;
  prompt: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  queuedCount: number;
  events: AgentEvent[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  thumbnailPath?: string;
  styleGuidePath?: string;
  sessionStatus: SessionStatus;
  latestExportId?: string;
}

export interface MediaFileEntry {
  name: string;
  relativePath: string;
  absolutePath: string;
  kind: "video" | "audio" | "image" | "document" | "folder" | "other";
}

export interface ProjectDetail extends ProjectRecord {
  dependencies: DependencyCheck[];
  exports: ExportRecord[];
  messages: ChatMessage[];
  runs: AgentRunRecord[];
  mediaFiles: MediaFileEntry[];
}

export interface AppSnapshot {
  projects: ProjectRecord[];
  selectedProjectId?: string;
}

export interface AppStateFile {
  projects: ProjectDetail[];
  selectedProjectId?: string;
}

export type ClientRequest =
  | { id: string; type: "app.getSnapshot" }
  | { id: string; type: "project.create"; workspaceRoot: string }
  | { id: string; type: "project.select"; projectId: string }
  | { id: string; type: "project.get"; projectId: string }
  | { id: string; type: "project.recheckDependencies"; projectId: string }
  | { id: string; type: "project.submitPrompt"; projectId: string; prompt: string }
  | { id: string; type: "project.retryRun"; projectId: string; runId: string };

export type ServerResponse =
  | { id: string; ok: true; result: AppSnapshot | ProjectDetail | AgentRunRecord | null }
  | { id: string; ok: false; error: string };

export type ServerPushEvent =
  | { channel: "snapshot.updated"; payload: AppSnapshot }
  | { channel: "project.updated"; payload: ProjectDetail }
  | { channel: "run.updated"; payload: { projectId: string; run: AgentRunRecord } };
