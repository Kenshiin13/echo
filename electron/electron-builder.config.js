/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.echo.voicetotext",
  productName: "Echo",
  copyright: "Copyright © 2025",
  // updateInfoBuilder crashes on `publish: null` ("Cannot read properties of null").
  // Give it a real GitHub config; `--publish never` on the CLI prevents upload.
  publish: [
    {
      provider: "github",
      owner: "Kenshiin13",
      repo: "echo",
    },
  ],
  directories: {
    output: "../dist/electron-release",
    buildResources: "build-resources",
  },
  files: [
    "dist/**",
    "!dist/renderer/**/*.map",
    // electron-builder's default patterns are replaced when `files` is set
    // explicitly, so spell out node_modules ourselves. Without this the asar
    // ships with no runtime deps and the app crashes on launch with
    // `Cannot find module 'electron-store'`.
    "node_modules/**/*",
    "package.json",
    "!node_modules/uiohook-napi/**",
    // Trim dev noise without touching directories we need (avoid `*.cpp`
    // because it matches `whisper.cpp/` as a path).
    "!node_modules/**/*.{md,map,ts,tsx}",
    "!node_modules/**/{test,tests,__tests__,example,examples,docs,.github}/**",
    "!node_modules/**/{LICENSE,license,LICENCE,licence,CHANGELOG,changelog,README,readme}{,.md,.txt,.markdown}",
  ],
  asarUnpack: [
    "node_modules/nodejs-whisper/**",
    "node_modules/koffi/**",
    "node_modules/@nut-tree-fork/**",
  ],
  // koffi ships pre-built Electron binaries — no native compilation needed.
  // With npmRebuild left at its default (`true`) electron-builder's rebuild
  // step mangles the dep tree on Windows, leaving electron-store and others
  // out of the asar. This was the v2.0.0 regression.
  npmRebuild: false,
  beforeBuild: async (context) => {
    // uiohook-napi is non-Windows only; scrub it before Electron's build step
    // so its MSVC-requiring gyp scripts don't even try to run.
    const fs = require("fs");
    const path = require("path");
    const p = path.join(context.appDir, "node_modules", "uiohook-napi");
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  },
  extraResources: [
    {
      from: "../assets",
      to: "assets",
      filter: ["**/*"],
    },
  ],
  win: {
    icon: "../assets/echo_windows_multi_size.ico",
    target: [{ target: "nsis", arch: ["x64"] }],
    requestedExecutionLevel: "requireAdministrator",
    sign: null,
    signingHashAlgorithms: null,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: "../assets/echo_windows_multi_size.ico",
    uninstallerIcon: "../assets/echo_windows_multi_size.ico",
    installerHeader: "../assets/echo_header_top_left_256x96.png",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    include: "build-resources/installer.nsh",
  },
};
