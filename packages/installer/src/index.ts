import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { spawn, spawnSync } from "node:child_process";
import {
  getStudioDependencyProbes,
  type StudioDependencyCandidate,
} from "../../shared/src/studioDependencies";

export interface GitHubReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

export interface GitHubRelease {
  readonly tag_name: string;
  readonly name: string;
  readonly html_url: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly assets: ReadonlyArray<GitHubReleaseAsset>;
}

export interface WindowsReleaseManifest {
  readonly path: string;
  readonly sha512: string;
}

export interface InstallerCliOptions {
  readonly channel: "stable";
  readonly downloadDir: string | null;
  readonly launchAfterInstall: boolean;
  readonly verbose: boolean;
}

export interface StudioDependencyCheckResult {
  readonly kind: string;
  readonly label: string;
  readonly status: "ready" | "warning" | "error";
  readonly message?: string;
}

export interface InstallStudioResult {
  readonly release: GitHubRelease;
  readonly installerPath: string;
  readonly launched: boolean;
  readonly dependencyChecks: ReadonlyArray<StudioDependencyCheckResult>;
}

interface InstallerRuntime {
  readonly fetchImpl: typeof fetch;
  readonly log: (message: string) => void;
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
}

const DEFAULT_RELEASE_API_URL = "https://api.github.com/repos/harnessgg/studio/releases/latest";

function trimQuotes(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseInstallerArgs(argv: ReadonlyArray<string>): InstallerCliOptions {
  let channel = "stable" as const;
  let downloadDir: string | null = null;
  let launchAfterInstall = true;
  let verbose = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--no-launch") {
      launchAfterInstall = false;
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
      continue;
    }
    if (arg === "--channel=stable") {
      channel = "stable";
      continue;
    }
    if (arg.startsWith("--channel=")) {
      throw new Error("Only --channel=stable is currently supported.");
    }
    if (arg === "--download-dir") {
      downloadDir = argv[index + 1] ?? null;
      if (!downloadDir) {
        throw new Error("Missing value for --download-dir.");
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--download-dir=")) {
      downloadDir = arg.slice("--download-dir=".length) || null;
      if (!downloadDir) {
        throw new Error("Missing value for --download-dir.");
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    channel,
    downloadDir,
    launchAfterInstall,
    verbose,
  };
}

export function parseWindowsReleaseManifest(input: string): WindowsReleaseManifest {
  let path: string | null = null;
  let sha512: string | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("path:")) {
      path = trimQuotes(line.slice("path:".length).trim());
      continue;
    }
    if (line.startsWith("sha512:")) {
      sha512 = trimQuotes(line.slice("sha512:".length).trim());
    }
  }

  if (!path || !sha512) {
    throw new Error("Windows update manifest is missing required path/sha512 fields.");
  }

  return { path, sha512 };
}

export function resolveWindowsReleaseDownload(
  release: GitHubRelease,
  manifest: WindowsReleaseManifest,
) {
  const manifestAsset = release.assets.find((asset) => asset.name === "latest.yml");
  const installerAsset = release.assets.find(
    (asset) => asset.name === Path.basename(manifest.path),
  );

  if (!manifestAsset) {
    throw new Error("Release is missing the Windows latest.yml manifest asset.");
  }
  if (!installerAsset) {
    throw new Error(`Release is missing the Windows installer asset '${manifest.path}'.`);
  }

  return {
    manifestAsset,
    installerAsset,
  };
}

function createDefaultRuntime(): InstallerRuntime {
  return {
    fetchImpl: fetch,
    log: (message) => console.log(message),
    platform: process.platform,
    env: process.env,
  };
}

async function fetchLatestStableRelease(fetchImpl: typeof fetch): Promise<GitHubRelease> {
  const response = await fetchImpl(DEFAULT_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "@harnessgg/studio",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve latest Studio release (${response.status} ${response.statusText}).`,
    );
  }
  const release = (await response.json()) as GitHubRelease;
  if (release.draft || release.prerelease) {
    throw new Error("Latest GitHub release is not a stable release.");
  }
  return release;
}

async function fetchText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/octet-stream, text/plain;q=0.9",
      "User-Agent": "@harnessgg/studio",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status} ${response.statusText}).`);
  }
  return await response.text();
}

async function downloadFileWithSha512(
  fetchImpl: typeof fetch,
  url: string,
  destinationPath: string,
) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "@harnessgg/studio",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download installer (${response.status} ${response.statusText}).`);
  }
  if (!response.body) {
    throw new Error("Installer download returned an empty response body.");
  }

  await mkdir(Path.dirname(destinationPath), { recursive: true });
  const destination = createWriteStream(destinationPath, { flags: "w" });
  const sha512 = createHash("sha512");
  const source = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      sha512.update(chunk);
      callback(null, chunk);
    },
  });

  await pipeline(source, hasher, destination);
  return sha512.digest("base64");
}

function runDependencyCandidate(candidate: StudioDependencyCandidate) {
  return spawnSync(candidate.command, [...candidate.args], {
    encoding: "utf8",
    shell: candidate.shell ?? process.platform === "win32",
    stdio: "pipe",
  });
}

function checkDependency(candidateSet: ReadonlyArray<StudioDependencyCandidate>) {
  for (const candidate of candidateSet) {
    const result = runDependencyCandidate(candidate);
    if (result.error) {
      const lower = result.error.message.toLowerCase();
      if (lower.includes("enoent") || lower.includes("notfound")) {
        continue;
      }
      return {
        status: "warning" as const,
        message: `${candidate.command} failed to run: ${result.error.message}`,
      };
    }
    if (result.status === 0) {
      return { status: "ready" as const };
    }
    return {
      status: "warning" as const,
      message: (
        result.stderr ||
        result.stdout ||
        `Command exited with code ${result.status}.`
      ).trim(),
    };
  }

  return null;
}

export function checkStudioDependencies(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<StudioDependencyCheckResult> {
  return getStudioDependencyProbes(platform, env).map((probe) => {
    const result = checkDependency(probe.candidates);
    if (result === null) {
      return {
        kind: probe.kind,
        label: probe.label,
        status: "error",
        message: probe.missingMessage,
      } satisfies StudioDependencyCheckResult;
    }
    if (result.status === "ready") {
      return {
        kind: probe.kind,
        label: probe.label,
        status: "ready",
      } satisfies StudioDependencyCheckResult;
    }
    return {
      kind: probe.kind,
      label: probe.label,
      status: result.status,
      message: `${probe.label} was found but is not ready. ${result.message}`,
    } satisfies StudioDependencyCheckResult;
  });
}

export function findInstalledStudioExecutable(env: NodeJS.ProcessEnv = process.env): string | null {
  const localAppData = env["LOCALAPPDATA"];
  const programFiles = env["ProgramFiles"];
  const programFilesX86 = env["ProgramFiles(x86)"];

  const candidates = [
    localAppData
      ? Path.join(localAppData, "Programs", "Studio by HarnessGG", "Studio by HarnessGG.exe")
      : null,
    programFiles ? Path.join(programFiles, "Studio by HarnessGG", "Studio by HarnessGG.exe") : null,
    programFilesX86
      ? Path.join(programFilesX86, "Studio by HarnessGG", "Studio by HarnessGG.exe")
      : null,
  ].filter((value): value is string => typeof value === "string");

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function launchInstalledStudio(env: NodeJS.ProcessEnv): Promise<boolean> {
  const executablePath = findInstalledStudioExecutable(env);
  if (!executablePath) {
    return false;
  }

  const child = spawn(executablePath, [], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return true;
}

export async function installStudio(
  options: InstallerCliOptions,
  runtime: Partial<InstallerRuntime> = {},
): Promise<InstallStudioResult> {
  const mergedRuntime = { ...createDefaultRuntime(), ...runtime } satisfies InstallerRuntime;

  if (mergedRuntime.platform !== "win32") {
    throw new Error("The bootstrap installer currently supports Windows only.");
  }

  const release = await fetchLatestStableRelease(mergedRuntime.fetchImpl);
  const manifestAsset = release.assets.find((asset) => asset.name === "latest.yml");
  if (!manifestAsset) {
    throw new Error("Release is missing the Windows latest.yml manifest asset.");
  }
  const manifest = parseWindowsReleaseManifest(
    await fetchText(mergedRuntime.fetchImpl, manifestAsset.browser_download_url),
  );
  const { installerAsset } = resolveWindowsReleaseDownload(release, manifest);

  const targetDirectory = Path.resolve(
    options.downloadDir ?? Path.join(tmpdir(), "studio-installer"),
  );
  const installerPath = Path.join(targetDirectory, installerAsset.name);

  if (options.verbose) {
    mergedRuntime.log(`Resolving Studio release ${release.tag_name} from ${release.html_url}`);
    mergedRuntime.log(`Downloading ${installerAsset.name} to ${installerPath}`);
  }

  const actualSha512 = await downloadFileWithSha512(
    mergedRuntime.fetchImpl,
    installerAsset.browser_download_url,
    installerPath,
  );
  if (actualSha512 !== manifest.sha512) {
    await rm(installerPath, { force: true });
    throw new Error("Installer checksum verification failed.");
  }

  const installResult = spawnSync(installerPath, [], {
    stdio: "inherit",
  });
  if (installResult.error) {
    throw new Error(`Installer failed to start: ${installResult.error.message}`);
  }
  if ((installResult.status ?? 0) !== 0) {
    throw new Error(`Installer exited with code ${installResult.status}.`);
  }

  const dependencyChecks = checkStudioDependencies(mergedRuntime.platform, mergedRuntime.env);
  const launched = options.launchAfterInstall
    ? await launchInstalledStudio(mergedRuntime.env)
    : false;

  return {
    release,
    installerPath,
    launched,
    dependencyChecks,
  };
}

export async function main(argv: ReadonlyArray<string>): Promise<void> {
  const options = parseInstallerArgs(argv);
  const runtime = createDefaultRuntime();
  const result = await installStudio(options, runtime);

  runtime.log(`Installed Studio by HarnessGG ${result.release.tag_name}.`);
  if (result.launched) {
    runtime.log("Launched Studio by HarnessGG.");
  } else if (options.launchAfterInstall) {
    runtime.log(
      "Studio installed, but the launcher could not find the installed app automatically.",
    );
  }

  const unresolvedDependencies = result.dependencyChecks.filter(
    (check) => check.status !== "ready",
  );
  if (unresolvedDependencies.length === 0) {
    runtime.log("All required editing tools appear to be installed.");
    return;
  }

  runtime.log("");
  runtime.log("Studio installed, but some editing tools still need setup:");
  for (const dependency of unresolvedDependencies) {
    runtime.log(`- ${dependency.message ?? `${dependency.label} is not ready.`}`);
  }
  runtime.log("");
  runtime.log("You can also open Studio and review the setup banner for the same guidance.");
}
