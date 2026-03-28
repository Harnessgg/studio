import * as Path from "node:path";

export type StudioDependencyKind = "codex" | "ffmpeg" | "python" | "kdenlive" | "harnessggKdenlive";

export interface StudioDependencyCandidate {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly shell?: boolean;
}

export interface StudioDependencyProbe {
  readonly kind: StudioDependencyKind;
  readonly label: string;
  readonly candidates: ReadonlyArray<StudioDependencyCandidate>;
  readonly missingMessage: string;
}

function windowsKdenliveCandidates(
  env: NodeJS.ProcessEnv,
): ReadonlyArray<StudioDependencyCandidate> {
  const roots = [
    env["ProgramFiles"],
    env["ProgramFiles(x86)"],
    "C:\\Program Files",
    "C:\\Program Files (x86)",
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const seen = new Set<string>();
  const candidates: StudioDependencyCandidate[] = [
    {
      command: "kdenlive",
      args: ["--version"],
    },
  ];

  for (const root of roots) {
    for (const candidatePath of [
      Path.join(root, "kdenlive", "kdenlive.exe"),
      Path.join(root, "kdenlive", "bin", "kdenlive.exe"),
    ]) {
      const normalized = candidatePath.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push({
        command: candidatePath,
        args: ["--version"],
        shell: false,
      });
    }
  }

  return candidates;
}

export function getStudioDependencyProbes(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<StudioDependencyProbe> {
  const pythonCandidates: ReadonlyArray<StudioDependencyCandidate> =
    platform === "win32"
      ? [
          { command: "python", args: ["--version"] },
          { command: "py", args: ["--version"] },
        ]
      : [
          { command: "python3", args: ["--version"] },
          { command: "python", args: ["--version"] },
        ];

  const kdenliveCandidates =
    platform === "win32"
      ? windowsKdenliveCandidates(env)
      : [{ command: "kdenlive", args: ["--version"] }];

  return [
    {
      kind: "codex",
      label: "Codex CLI",
      candidates: [{ command: "codex", args: ["--version"] }],
      missingMessage: "Codex CLI (`codex`) is not installed or not on PATH.",
    },
    {
      kind: "ffmpeg",
      label: "FFmpeg",
      candidates: [{ command: "ffmpeg", args: ["-version"] }],
      missingMessage: "FFmpeg is not installed or not on PATH.",
    },
    {
      kind: "python",
      label: "Python",
      candidates: pythonCandidates,
      missingMessage:
        platform === "win32"
          ? "Python is not installed or not available as `python` or `py`."
          : "Python is not installed or not on PATH.",
    },
    {
      kind: "kdenlive",
      label: "Kdenlive",
      candidates: kdenliveCandidates,
      missingMessage:
        platform === "win32"
          ? "Kdenlive is not installed or was not found on PATH or in the common Program Files install locations."
          : "Kdenlive is not installed or not on PATH.",
    },
    {
      kind: "harnessggKdenlive",
      label: "harnessgg-kdenlive",
      candidates: [{ command: "harnessgg-kdenlive", args: ["--help"] }],
      missingMessage: "The `harnessgg-kdenlive` CLI is not installed or not on PATH.",
    },
  ];
}
