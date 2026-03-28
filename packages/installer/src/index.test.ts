import { describe, expect, it } from "vitest";
import {
  findInstalledStudioExecutable,
  parseInstallerArgs,
  parseWindowsReleaseManifest,
  resolveWindowsReleaseDownload,
  type GitHubRelease,
} from "./index";

describe("studio installer", () => {
  it("parses supported CLI flags", () => {
    expect(
      parseInstallerArgs([
        "--channel=stable",
        "--download-dir",
        "C:\\temp",
        "--no-launch",
        "--verbose",
      ]),
    ).toEqual({
      channel: "stable",
      downloadDir: "C:\\temp",
      launchAfterInstall: false,
      verbose: true,
    });
  });

  it("rejects unsupported channels", () => {
    expect(() => parseInstallerArgs(["--channel=beta"])).toThrow(
      "Only --channel=stable is currently supported.",
    );
  });

  it("parses the Windows latest.yml manifest", () => {
    expect(
      parseWindowsReleaseManifest(
        `version: 0.1.1
path: Studio-by-HarnessGG-0.1.1-x64.exe
sha512: abc123
releaseDate: '2026-03-26T00:00:00.000Z'
`,
      ),
    ).toEqual({
      path: "Studio-by-HarnessGG-0.1.1-x64.exe",
      sha512: "abc123",
    });
  });

  it("resolves the Windows installer asset from a release", () => {
    const release: GitHubRelease = {
      tag_name: "v0.1.1",
      name: "Studio by HarnessGG v0.1.1",
      html_url: "https://github.com/harnessgg/studio/releases/tag/v0.1.1",
      draft: false,
      prerelease: false,
      assets: [
        {
          name: "latest.yml",
          browser_download_url: "https://example.com/latest.yml",
        },
        {
          name: "Studio-by-HarnessGG-0.1.1-x64.exe",
          browser_download_url: "https://example.com/Studio-by-HarnessGG-0.1.1-x64.exe",
        },
      ],
    };

    expect(
      resolveWindowsReleaseDownload(release, {
        path: "Studio-by-HarnessGG-0.1.1-x64.exe",
        sha512: "abc123",
      }),
    ).toEqual({
      manifestAsset: release.assets[0],
      installerAsset: release.assets[1],
    });
  });

  it("returns null when common Studio install locations are unavailable", () => {
    expect(
      findInstalledStudioExecutable({
        LOCALAPPDATA: "Z:\\definitely-not-installed\\Local",
        ProgramFiles: "Z:\\definitely-not-installed\\Program Files",
        "ProgramFiles(x86)": "Z:\\definitely-not-installed\\Program Files (x86)",
      }),
    ).toBeNull();
  });
});
