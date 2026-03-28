import path from "node:path";

export const DEFAULT_PROJECT_AGENTS_MD = `# HarnessGG Studio Agent Guide

## Purpose
- This project is edited through Studio by HarnessGG.
- Use HarnessGG tools and local project files to complete video-editing requests.
- Use Motion Canvas when the user asks for scripted motion graphics, browser-style UI animations, animated cursors, explainers, or stylized overlays that are easier to generate than to record live.

## Required Tooling
- Before starting any edit task, verify that \`harnessgg-kdenlive\`, Kdenlive, FFmpeg, Python, Node.js, npm, and Codex CLI are available and on PATH.
- The video-editing CLI is always invoked as \`harnessgg-kdenlive\`. Do not use \`python -m\` or other entry points.
- If any dependency is missing or broken, stop and report the error. Do not attempt to install or repair global tooling. Workspace-local npm installs and local Motion Canvas project setup are allowed when required for the requested output.
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

## Motion Canvas Workflow
- Use Motion Canvas for scripted animation work, not as a replacement for Kdenlive timeline editing.
- Prefer an isolated local project directory such as \`motion-canvas/\` in the workspace or \`.harnessgg/tmp/motion-canvas/\`. Keep reusable templates and scratch clones out of the project root when possible.
- If a lightweight local Motion Canvas scaffold is enough, create that first. Clone the upstream Motion Canvas repo only when you need examples, source references, or a fuller template than the local scaffold provides.
- If cloning is needed, keep the clone inside \`.harnessgg/tmp/\` or another clearly isolated workspace subdirectory. Do not modify Studio's own app repo as part of a project edit.
- Keep Motion Canvas package versions pinned and consistent within the local project. Prefer current stable published versions instead of mixing arbitrary tags or Git refs.
- Never set a command's working directory to a path that does not already exist. Create bootstrap folders like \`.harnessgg/tmp/mcpack\` from an existing parent directory first, then run follow-up commands inside them only after verifying the directory exists.
- For Motion Canvas scaffolding, npm bootstrap, and \`npm pack\` flows, prefer the project root or an existing \`.harnessgg/tmp/\` parent as \`cwd\` for the directory-creation step. Do not launch a process with \`cwd\` already pointing at the not-yet-created target folder.
- Put source screenshots, reference stills, and animation assets in a predictable project folder before scripting imports.
- Render final deliverables into \`.harnessgg/exports/\`. Put temporary renders, frame dumps, and verification screenshots in \`.harnessgg/tmp/\`.
- For existing videos, prefer rendering Motion Canvas overlays and compositing them over footage in Kdenlive or FFmpeg unless a single-pass Motion Canvas render is clearly simpler.
- For browser or app UI animation requests, a screenshot-based recreation is acceptable and often preferred. Animate cursor movement, hover states, click feedback, typed text, and controlled transitions on top of the screenshot.
- Use real browser automation only when the user explicitly needs a live browser recording or true page behavior. Motion Canvas is better for polished, deterministic UI animation than for automating a real browser session.
- Verify the render path before doing long animation work: install local npm dependencies if needed, confirm the render script works, and confirm the output video lands in the expected export path.
- When rendering headlessly, verify that a supported browser executable is available. If not, stop and report the exact missing dependency.

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
- Motion Canvas is best for deterministic, scripted animation. Kdenlive is best for assembling and revising longer editorial timelines.
- When animating an existing page or product UI from a screenshot, match layout and typography first, then add motion. Do not overcomplicate the scene with unnecessary live-browser behavior.
- When animating over an existing video, prefer a transparent or clean-background overlay workflow that is easy to composite and revise.
- Keep Motion Canvas scenes short and modular. Small composable scenes are easier to re-render and safer to revise than one large monolithic animation file.

## Working Rules
- Respect the project's \`STYLE.md\` for subtitles, transitions, color, audio, and export naming.
- Preserve previous renders. Create new exports instead of overwriting older successful outputs unless the user explicitly asks for replacement.
- Prefer deterministic edits with explicit files, clip names, and time ranges when available.
- If a request is ambiguous, inspect the available project media before making assumptions.
- When using \`harnessgg-kdenlive\`, prefer documented recipes and behavioral notes over trial-and-error.
- Read behavioral notes for commands like \`add-text\`, \`apply-transition\`, and \`add-track\` so you follow what the commands actually do, not just their flags.
- Before declaring success, verify the finished artifact itself instead of relying only on command success, logs, or intermediate previews. For videos, scrub or sample the final export; for images or documents, inspect the final file directly.
- If reference media or screenshots were provided, compare the finished artifact against them during the final verification pass and fix visible mismatches before finalizing.
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
- For Motion Canvas work, keep the project scaffold repeatable and minimal. Do not re-invent boilerplate on every request if a local template already exists.
- For animation requests based on screenshots, treat the screenshot as a design reference or background asset and keep interaction timing readable and intentional.
- For animation requests based on video footage, decide early whether the right solution is a Motion Canvas render, a Motion Canvas overlay, or a direct Kdenlive edit.
- Prefer quick verification renders before committing to a final full-resolution export.
- During final verification, look for user-visible defects such as clipped text, overlapping elements, broken timing, missing assets, or layout drift from the reference. Revise and re-export when those issues are present.
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
