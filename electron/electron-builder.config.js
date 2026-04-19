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
  // Include the built output + runtime deps. electron-builder's default
  // patterns get replaced when `files` is set explicitly, so we list what
  // we need. Native .node binaries land where npm puts them under
  // node_modules/<pkg>/... and stay unpacked via `asarUnpack` below.
  files: [
    "dist/**",
    "!dist/renderer/**/*.map",
    "node_modules/**/*",
    "package.json",
    // uiohook-napi is macOS/Linux only — skip on Windows builds.
    ...(process.platform === "win32" ? ["!node_modules/uiohook-napi/**"] : []),
    // Dev-only noise — keep slim but don't over-filter.
    "!node_modules/**/*.{md,map,ts,tsx}",
    "!node_modules/**/{test,tests,__tests__,example,examples,docs,.github}/**",
    "!node_modules/**/{LICENSE,license,LICENCE,licence,CHANGELOG,changelog,README,readme}{,.md,.txt,.markdown}",
  ],
  // Native modules loaded via require() must sit on the real filesystem,
  // not inside app.asar. All three are standard prebuilt-.node packages.
  asarUnpack: [
    "node_modules/onnxruntime-node/**",
    "node_modules/koffi/**",
    "node_modules/@nut-tree-fork/**",
    "node_modules/uiohook-napi/**",
  ],
  // Native modules need an Electron ABI rebuild on macOS/Linux. Windows
  // ships prebuilts for all of them; skip rebuild to save a CI step.
  npmRebuild: process.platform !== "win32",
  beforeBuild: async (context) => {
    if (context.platform.name === "windows") {
      const fs = require("fs");
      const path = require("path");
      const p = path.join(context.appDir, "node_modules", "uiohook-napi");
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    }
  },
  // Ad-hoc signs the macOS .app (no paid Apple Developer ID).
  // No-op on Windows/Linux.
  afterPack: "./scripts/mac-afterpack.js",
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
  mac: {
    icon: "../assets/echo_macos_app_icon.icns",
    category: "public.app-category.productivity",
    // Apple Silicon only (M1/M2/M3/M4). Intel Macs are not supported.
    target: [
      { target: "dmg", arch: ["arm64"] },
    ],
    // Unsigned — we don't have a paid Apple Developer ID. afterPack does
    // an ad-hoc signing pass so Gatekeeper treats this as "unidentified
    // developer" rather than "damaged" (right-click → Open to bypass).
    identity: null,
  },
  dmg: {
    contents: [
      { x: 410, y: 150, type: "link", path: "/Applications" },
      { x: 130, y: 150, type: "file" },
    ],
  },
  linux: {
    target: ["AppImage"],
    icon: "../assets/echo_executable_256.png",
    category: "Utility",
  },
};
