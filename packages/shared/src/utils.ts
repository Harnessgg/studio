import crypto from "node:crypto";
import path from "node:path";

export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function titleFromPath(workspaceRoot: string): string {
  return path.basename(workspaceRoot) || "Untitled Project";
}

export function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}
