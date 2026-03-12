export const BRAND_ASSET_PATHS = {
  productionMacIconPng: "../harnessgg/public/logo-512.png",
  productionLinuxIconPng: "../harnessgg/public/logo-512.png",
  productionWindowsIconIco: "apps/desktop/resources/icon.ico",
  productionWebFaviconIco: "apps/web/public/favicon.ico",
  productionWebFavicon16Png: "apps/web/public/favicon-32.png",
  productionWebFavicon32Png: "apps/web/public/favicon-32.png",
  productionWebAppleTouchIconPng: "apps/web/public/logo-128.png",
  developmentWindowsIconIco: "apps/desktop/resources/icon.ico",
  developmentWebFaviconIco: "apps/web/public/favicon.ico",
  developmentWebFavicon16Png: "apps/web/public/favicon-32.png",
  developmentWebFavicon32Png: "apps/web/public/favicon-32.png",
  developmentWebAppleTouchIconPng: "apps/web/public/logo-128.png",
} as const;

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

export const DEVELOPMENT_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];

export const PUBLISH_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];
