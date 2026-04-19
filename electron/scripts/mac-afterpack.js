// Ad-hoc codesigns the packaged macOS .app.
//
// We ship unsigned (no paid Apple Developer ID) — `electron-builder.config.js`
// sets `mac.identity: null` to skip electron-builder's own signing. That
// leaves the Electron helper .app bundles, framework dylibs, and any native
// .node modules completely unsigned, which on Apple Silicon is killed by the
// kernel at exec() and on older Macs shows "damaged" via Gatekeeper.
//
// Ad-hoc signing (identity "-") produces a structurally valid, empty-identity
// signature that Gatekeeper accepts. We sign bottom-up: every .dylib and
// .node first, then every framework/helper-app bundle, then the outer .app.
//
// Unlike the old whisper-server setup, we no longer need to sign any external
// binaries — onnxruntime-node is loaded as a regular .node module alongside
// koffi/uiohook-napi, so the existing list of known Mach-O extensions covers
// it fully.
//
// No-op on non-mac builds.
const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function walk(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let stat;
    try { stat = fs.lstatSync(p); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(p, predicate, acc);
    else if (predicate(p, stat)) acc.push(p);
  }
  return acc;
}

function isMachO(filePath) {
  try {
    const out = execSync(`file -b ${JSON.stringify(filePath)}`, { encoding: "utf8" });
    return /Mach-O/.test(out);
  } catch {
    return false;
  }
}

function codesign(target) {
  execFileSync(
    "codesign",
    ["--force", "--timestamp=none", "--sign", "-", target],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
}

// Skip framework main binaries. Signing <X>.framework/Versions/<ver>/<X>
// directly triggers framework-version validation which demands pre-signed
// subcomponents. Signing the framework *bundle* path handles this correctly.
function isFrameworkMainBinary(p) {
  const parts = p.split(path.sep);
  if (parts.length < 4) return false;
  const file = parts[parts.length - 1];
  const ver = parts[parts.length - 2];
  const versions = parts[parts.length - 3];
  const fwk = parts[parts.length - 4];
  if (versions !== "Versions" || !ver) return false;
  if (!fwk || !fwk.endsWith(".framework")) return false;
  return fwk.slice(0, -".framework".length) === file;
}

/** @type {import("electron-builder").AfterPackContext} */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  const unpacked = path.join(appPath, "Contents", "Resources", "app.asar.unpacked");
  const frameworks = path.join(appPath, "Contents", "Frameworks");

  console.log(`[afterPack] ad-hoc signing ${appPath}`);

  // 1. chmod +x nested .node modules — electron-builder's copy can drop the bit
  const execBits = walk(unpacked, (p) => p.endsWith(".node"));
  for (const f of execBits) {
    try { fs.chmodSync(f, 0o755); } catch { /* non-fatal */ }
  }

  // 2. sign every dylib under Contents/
  const dylibs = walk(path.join(appPath, "Contents"), (p) => p.endsWith(".dylib"));
  for (const d of dylibs) codesign(d);
  console.log(`[afterPack] signed ${dylibs.length} dylib(s)`);

  // 3. sign every .node module under app.asar.unpacked
  const nodes = walk(unpacked, (p) => p.endsWith(".node"));
  for (const n of nodes) codesign(n);
  console.log(`[afterPack] signed ${nodes.length} .node module(s)`);

  // 4. sign frameworks + helper .apps bottom-up
  if (fs.existsSync(frameworks)) {
    const bundles = fs.readdirSync(frameworks)
      .filter((n) => n.endsWith(".framework") || n.endsWith(".app"))
      .map((n) => path.join(frameworks, n));

    for (const b of bundles) {
      const nested = walk(b, (p, stat) => {
        if (!stat.isFile()) return false;
        if (isFrameworkMainBinary(p)) return false;
        if (p.endsWith(".dylib")) return true;
        if ((stat.mode & 0o111) === 0) return false;
        if (/\.(js|json|plist|md|txt|html|css|png|jpg|svg|ico|car|nib|strings|sh|py|pl|rb)$/i.test(p)) return false;
        return isMachO(p);
      });
      nested.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
      for (const n of nested) codesign(n);
    }
    for (const b of bundles) codesign(b);
    console.log(`[afterPack] signed ${bundles.length} framework/helper bundle(s)`);
  }

  // 5. sign the outer .app
  codesign(appPath);

  // 6. verify — fail the build if anything is still unsigned
  try {
    execFileSync(
      "codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", appPath],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    console.log("[afterPack] codesign --verify --deep --strict OK");
  } catch (err) {
    throw new Error(
      `[afterPack] codesign verification failed on ${appPath}: ${err.message}\n` +
      `The build will be rejected by Gatekeeper — do not ship it.`
    );
  }
};
