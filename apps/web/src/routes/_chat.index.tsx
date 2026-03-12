import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import { SidebarTrigger } from "../components/ui/sidebar";

function ChatIndexRouteView() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
      {!isElectron && (
        <header className="border-b border-border px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">Edit Sessions</span>
          </div>
        </header>
      )}

      {isElectron && (
        <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
          <span className="text-xs text-muted-foreground/50">No active edit session</span>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-2xl px-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-cyan-500/80">
            Studio by HarnessGG
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-foreground">
            Turn a local folder into an AI-assisted video project
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Start by adding a folder with clips, audio, and optional project notes like
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              STYLE.md
            </code>
            . Then open an edit session and describe changes like subtitle generation, trims, fades,
            and background music.
          </p>
          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">1</p>
              <p className="mt-2 text-sm text-foreground">
                Add a video project folder from the left sidebar.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">2</p>
              <p className="mt-2 text-sm text-foreground">
                Create an edit session for that project.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">3</p>
              <p className="mt-2 text-sm text-foreground">
                Describe the video edit you want in plain English.
              </p>
            </div>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Before you start, make sure Codex CLI, Kdenlive, FFmpeg, Python, and
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              harnessgg-kdenlive
            </code>
            are installed.
          </p>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
