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
    // uiohook-napi is macOS/Linux only — exclude it from Windows builds
    ...(process.platform === "win32" ? ["!node_modules/uiohook-napi/**"] : []),
  ],
  asarUnpack: [
    "node_modules/nodejs-whisper/**",
    "node_modules/koffi/**",
    "node_modules/@nut-tree-fork/**",
  ],
  // koffi ships pre-built Electron binaries — no native compilation needed.
  // uiohook-napi requires MSVC and is not used on Windows; skip it via beforeBuild.
  npmRebuild: process.platform !== "win32",
  beforeBuild: async (context) => {
    if (context.platform.name === "windows") {
      const fs = require("fs");
      const path = require("path");
      const p = path.join(context.appDir, "node_modules", "uiohook-napi");
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    }
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
  mac: {
    icon: "../assets/echo_macos_app_icon.icns",
    category: "public.app-category.productivity",
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "dmg", arch: ["x64"] },
    ],
    entitlements: "build-resources/entitlements.mac.plist",
    entitlementsInherit: "build-resources/entitlements.mac.plist",
    hardenedRuntime: true,
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
