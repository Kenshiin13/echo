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
    "!node_modules/uiohook-napi/**",
  ],
  asarUnpack: [
    "node_modules/nodejs-whisper/**",
    "node_modules/koffi/**",
    "node_modules/@nut-tree-fork/**",
  ],
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
