import path from "node:path";

export const DEFAULT_PROJECT_AGENTS_MD = `# HarnessGG Studio Agent Guide

## Purpose
- This project is edited through Studio by HarnessGG.
- Use HarnessGG tools and local project files to complete video-editing requests.

## Required Tooling
- Before starting any edit task, verify that \`harnessgg-kdenlive\`, Kdenlive, FFmpeg, Python, and Codex CLI are available and on PATH.
- The video-editing CLI is always invoked as \`harnessgg-kdenlive\`. Do not use \`python -m\` or other entry points.
- If any dependency is missing or broken, stop and report the error. Do not attempt to install or repair tooling.
- Use \`harnessgg-kdenlive\` for Kdenlive and timeline operations.
- Do not assume \`kdenlive\` is available as a PATH command on Windows. If it is not on PATH, look for the installed app in common locations such as \`C:\\Program Files\\kdenlive\\\`, \`C:\\Program Files (x86)\\kdenlive\\\`, or other Studio-provided install paths before declaring it missing.
- If Kdenlive is found outside PATH, use the discovered executable path consistently for subsequent checks and operations.
- Start with \`harnessgg-kdenlive bridge start\`, then run \`harnessgg-kdenlive bridge status\` before edit commands.
- Prefer \`batch\` when chaining 3 or more commands. If the docs expose a batch JSON schema, use it so complex edits happen in one round-trip.
- Run \`recalc-bounds\` and \`validate\` before rendering, especially after multi-track edits.
- After adding a video track with \`add-track\`, confirm a composite transition exists between tracks. If missing, apply one with \`apply-transition --service composite\`.
- Verify that fonts listed in \`STYLE.md\` are available before generating text overlays.
- Poll long renders with \`render-status\` or \`render-wait\`.
- Keep all exports in \`.harnessgg/exports/\`.
- Keep logs and debug traces in \`.harnessgg/logs/\` when applicable.
- Put intermediate, scratch, and temporary files in \`.harnessgg/tmp/\` instead of the project root.
- Before editing, gather Studio pre-flight context: bridge health, font availability, and any other environment checks surfaced by Studio.

## Embedded Quickstart
- Standard startup sequence:
  - \`harnessgg-kdenlive bridge start\`
  - \`harnessgg-kdenlive bridge status\`
  - \`harnessgg-kdenlive capabilities\`
  - \`harnessgg-kdenlive inspect <project.kdenlive>\`
  - \`harnessgg-kdenlive validate <project.kdenlive>\`
- For bridge stability checks when behavior looks inconsistent:
  - \`harnessgg-kdenlive bridge verify --iterations 25\`
  - \`harnessgg-kdenlive bridge soak --iterations 100 --duration-seconds 5\`
- Multi-track overlay recipe:
  - add the extra video track with \`harnessgg-kdenlive add-track <project> --track-type video\`
  - place the overlay/title/foreground clip on the new track
  - run \`harnessgg-kdenlive list-transitions <project>\` to confirm a composite transition exists between the stacked tracks
  - if missing, apply one with \`harnessgg-kdenlive apply-transition <project> --service composite\`
  - always run \`harnessgg-kdenlive recalc-bounds <project>\` and \`harnessgg-kdenlive validate <project>\` before rendering multi-track projects
- Basic timeline recipe:
  - \`harnessgg-kdenlive create-project edited.kdenlive --title "Agent Edit" --overwrite\`
  - \`harnessgg-kdenlive import-asset edited.kdenlive C:\\path\\to\\clip.mp4 --producer-id clip1\`
  - \`harnessgg-kdenlive add-text edited.kdenlive "Opening Title" --duration-frames 75 --track-id playlist0 --position 0\`
  - \`harnessgg-kdenlive stitch-clips edited.kdenlive playlist0 clip1 clip1 --position 75 --gap 10\`
- Confirm changes with:
  - \`harnessgg-kdenlive inspect <project>\`
  - \`harnessgg-kdenlive validate <project> --no-check-files\`
  - \`harnessgg-kdenlive preview-frame <project> preview.png --frame 30\`
  - \`harnessgg-kdenlive render-project <project> output.mp4\`
  - \`harnessgg-kdenlive render-status <job_id>\`

## Embedded Batch Pattern
- Prefer \`batch\` when chaining 3 or more related edits.
- Batch command shape:
  - \`harnessgg-kdenlive batch "<json>"\`
- Use a JSON array of step objects. Each step should name a command and its arguments/options explicitly.
- Example batch pattern:
\`\`\`json
[
  {
    "command": "import-asset",
    "args": ["edited.kdenlive", "C:\\\\media\\\\clip.mp4"],
    "options": { "producer-id": "clip1" }
  },
  {
    "command": "add-track",
    "args": ["edited.kdenlive"],
    "options": { "track-type": "video", "name": "overlay" }
  },
  {
    "command": "add-text",
    "args": ["edited.kdenlive", "Opening Title"],
    "options": {
      "track-id": "overlay",
      "position": 0,
      "duration-frames": 75,
      "font": "Montserrat Bold"
    }
  },
  {
    "command": "apply-transition",
    "args": ["edited.kdenlive"],
    "options": { "service": "composite" }
  },
  {
    "command": "recalc-bounds",
    "args": ["edited.kdenlive"]
  },
  {
    "command": "validate",
    "args": ["edited.kdenlive"]
  }
]
\`\`\`

## Embedded Behavioral Notes
- \`add-text\` may fall back to subtitle-sidecar mode when local MLT \`qtext\` is unavailable. Do not assume text overlays failed just because native text producers are missing.
- \`apply-transition\` is not just cosmetic. For stacked video tracks, use \`--service composite\` to create the actual video compositor between tracks. \`mix\` is typically audio-oriented and will not solve overlay compositing.
- \`add-track\` only adds the track. It does not guarantee the needed compositor exists. After adding a video track, check transitions and explicitly add a composite transition if required.
- \`recalc-bounds\` is mandatory after structural multi-track changes. If a render comes back unexpectedly short or truncated, run \`recalc-bounds\` before assuming the edit graph is correct.
- \`render-project\` may internally burn harness text overlays with \`ffmpeg\` when local MLT text producers are unavailable or unreliable.
- Successful project mutations maintain a handoff mirror at \`.harness_handoff/<project-stem>.handoff.kdenlive\`.
- \`export-kdenlive\` can recalculate bounds and validate before writing the handoff file.

## Working Rules
- Respect the project's \`STYLE.md\` for subtitles, transitions, color, audio, and export naming.
- Preserve previous renders. Create new exports instead of overwriting older successful outputs unless the user explicitly asks for replacement.
- Prefer deterministic edits with explicit files, clip names, and time ranges when available.
- If a request is ambiguous, inspect the available project media before making assumptions.
- When using \`harnessgg-kdenlive\`, prefer documented recipes and behavioral notes over trial-and-error.
- Read behavioral notes for commands like \`add-text\`, \`apply-transition\`, and \`add-track\` so you follow what the commands actually do, not just their flags.
- End every final response with a machine-readable Studio result trailer so the UI can parse the outcome.
- Use exactly one of these trailers at the end of the response:
  - \`STUDIO_RESULT: DONE\`
    \`STUDIO_FILE: [relative/path/to/file.ext](relative/path/to/file.ext)\`
  - \`STUDIO_RESULT: ERROR\`
    \`STUDIO_ERROR: short reason\`
- When the result is \`DONE\`, the linked file must be the primary finished artifact relative to the project root.

## Best Practices
- Confirm source files exist before editing.
- Keep edits non-destructive when possible.
- Use clear export filenames and increment versions.
- Surface failures clearly if Kdenlive, FFmpeg, or HarnessGG tooling is unavailable.
- Avoid introducing files outside the project root.
`;

export function buildDefaultProjectStyleGuide(workspaceRoot: string): string {
  const projectName = path.basename(workspaceRoot) || "project";
  return `# ${projectName} Style Guide

This file controls the default creative direction for this project.
Update it with the project's design choices before running major edits.

## Creative Direction
- Tone: Clean, modern, and creator-friendly
- Pace: Snappy, minimal dead air
- Framing: Keep important subjects centered and readable on mobile

## Subtitles
- Font: Montserrat Bold
- Size: 48px for 1080p exports
- Color: White with subtle dark outline
- Placement: Bottom-center with safe-area padding
- Max 2 lines at a time

## Transitions
- Default transition: 0.5s dissolve
- Avoid flashy wipes unless explicitly requested

## Color
- Preserve natural skin tones
- Prefer warm, balanced contrast unless the footage suggests a different look

## Audio
- Prioritize speech clarity
- Duck background music under dialogue
- Smooth fades at track starts and ends

## Export
- Format: H.264 MP4
- Resolution: 1080p
- Frame rate: Match source unless the user specifies otherwise
- Naming: ${projectName}_[date]_[version].mp4
`;
}
