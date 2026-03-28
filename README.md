# Studio by HarnessGG

Studio by HarnessGG is a desktop app for AI-assisted video editing with Codex.

It gives the agent a local project workspace, a structured project scaffold, and a visual control surface for reviewing media, previewing exports, leaving timestamped feedback, and iterating on the same edit thread. Timeline work is handled locally through `harnessgg-kdenlive` and Kdenlive.

## What it does

- Chat with Codex about a video edit in plain English
- Inspect local media, outputs, and project instructions from the app
- Preview the latest export or any selected source clip
- Leave timeline comments tied to file paths and timestamps
- Keep editing state, exports, logs, and temp files inside the project folder

## Project layout

Studio expects a local project folder that looks like this:

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

`STYLE.md` holds project-specific editing defaults. `AGENTS.md` defines the run contract and workspace rules for Codex. `.harnessgg/exports` stores finished outputs, `.harnessgg/logs` stores run logs, and `.harnessgg/tmp` is reserved for intermediate files.

## How to use

1. Install the local dependencies listed below.
2. Start the desktop app.
3. Open or create a Studio project folder.
4. Add media files to the project workspace.
5. Ask Codex to assemble or revise the edit.
6. Review the preview, leave timeline comments, and send feedback back to the agent.

## Prerequisites

For real editing runs, install these locally:

- Codex CLI
- Kdenlive
- FFmpeg
- Python
- `harnessgg-kdenlive`

On Windows, Kdenlive may not be on `PATH`. If needed, point the tooling at an installed location such as `C:\Program Files\kdenlive\`.

## Easy install

For Windows users, the intended one-command install path is:

```bash
npx @harnessgg/studio@latest
```

That command downloads the latest signed desktop installer from GitHub Releases, runs it locally, and then checks whether the external editing tools are present. Studio still requires local installs of Codex CLI, Kdenlive, FFmpeg, Python, and `harnessgg-kdenlive` for real editing runs.

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

Before shipping changes, run:

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

## Release builds

Build local desktop artifacts with:

```bash
bun run dist:desktop:artifact
bun run dist:desktop:win
bun run dist:desktop:dmg
bun run dist:desktop:linux
```

GitHub Actions handles CI validation and desktop release packaging on tagged versions.

## Some notes

- This repo is still early-stage and Codex-first.
- The server runs `codex app-server` per provider session and streams structured events into the desktop UI over WebSocket.
- `packages/contracts` stays schema-only.
- `packages/shared` is for shared runtime logic used by both server and web.
- Predictable behavior under reconnects, partial streams, and failed runs matters more than short-term convenience.

## Architecture

- `apps/desktop`: Electron shell, preload bridge, desktop boot flow
- `apps/server`: local orchestration server, Codex app-server integration, workspace inspection
- `apps/web`: React UI for chat, preview, timeline comments, and project controls
- `packages/contracts`: shared schemas and protocol contracts
- `packages/shared`: shared runtime utilities
- `scripts`: build, release, and local development helpers

## Contributing

This codebase is moving quickly, so pragmatic structural improvements are welcome. If you add functionality, prefer extracting shared logic instead of duplicating local behavior in multiple surfaces.

Before opening a change, make sure formatting, linting, and typechecking all pass locally.

## Related links

- [HarnessGG](https://harness.gg/)
- [HarnessGG on GitHub](https://github.com/harnessgg)

## License

MIT
