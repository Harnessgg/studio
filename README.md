# Studio by HarnessGG

Studio by HarnessGG is a local desktop app for AI-assisted video editing.

It gives Codex a project workspace for assembling edits, reviewing cuts, and rendering output, while `harnessgg-kdenlive` and Kdenlive do the actual timeline work underneath.

## What it is

- Desktop shell: Electron
- App UI: React
- Runtime: local Node/Bun server plus WebSocket-backed desktop bridge
- Editing engine: `harnessgg-kdenlive`
- Primary use case: natural-language video editing against a local project folder

Studio is built on top of the same HarnessGG tooling stack documented at `harness.gg`. The UI is a visual control surface for local creative workflows, not a separate cloud editing backend.

## Current scope

The app is focused on a local-first editing flow:

- add or open a local project folder
- chat with Codex about the edit you want
- inspect project media and `STYLE.md`
- preview outputs and iterate on the same thread

Project folders are expected to use the Studio scaffold:

```text
my-project/
  STYLE.md
  AGENTS.md
  .harnessgg/
    config.json
    exports/
    logs/
    tmp/
```

## Prerequisites

For real editing runs, install these locally:

- Codex CLI
- Kdenlive
- FFmpeg
- Python
- `harnessgg-kdenlive`

On Windows, do not assume Kdenlive is on `PATH`. Studio and the agent may need to resolve it from an installed location such as `C:\Program Files\kdenlive\`.

## Development

Install dependencies:

```bash
bun install
```

Run the desktop app in development:

```bash
bun run dev:desktop
```

Run the built desktop app:

```bash
bun run start:desktop
```

Build the desktop pipeline:

```bash
bun run build:desktop
```

## Quality checks

Before shipping or committing changes, this repo expects:

```bash
bun fmt
bun lint
bun typecheck
```

Additional useful commands:

```bash
bun run test
bun run test:desktop-smoke
```

## Release flow

Local artifact builds:

```bash
bun run dist:desktop:artifact
bun run dist:desktop:win
bun run dist:desktop:dmg
bun run dist:desktop:linux
```

GitHub Actions:

- `CI` runs format, lint, typecheck, tests, browser tests, and desktop build verification
- `Release Desktop` publishes signed or unsigned desktop artifacts on version tags like `v1.2.3`

## Architecture

Top-level packages:

- `apps/desktop`
  - Electron main process, preload bridge, desktop launch scripts
- `apps/server`
  - local orchestration server, Codex app-server integration, workspace inspection, persistence
- `apps/web`
  - Studio UI, thread view, preview surface, media browser, chat experience
- `packages/contracts`
  - shared schemas and protocol contracts
- `packages/shared`
  - shared runtime utilities

## Studio-specific behavior

- Every project gets a default `STYLE.md` and `AGENTS.md`
- Studio scaffolds `.harnessgg/exports`, `.harnessgg/logs`, and `.harnessgg/tmp`
- The agent receives project context, style-guide guidance, and embedded HarnessGG editing rules
- The UI keeps editing local to the machine and project folder

## Related HarnessGG docs

- `https://harness.gg/studio`
- `https://harness.gg/kdenlive`
- `https://github.com/harnessgg`

## License

MIT
