import { Tray, Menu, nativeImage, app } from "electron";
import path from "path";
import { ConfigStore } from "./config";
import { WindowManager } from "./windows";

function assetPath(name: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", name);
  }
  // In dev: app root is electron/, assets live one level up at repo root
  return path.join(app.getAppPath(), "../assets", name);
}

export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private config: ConfigStore,
    private windows: WindowManager,
  ) {}

  create(): void {
    const iconPath = assetPath(
      process.platform === "darwin" ? "echo_system_tray_16.png" : "echo_system_tray_32.png",
    );
    const icon = nativeImage.createFromPath(iconPath);

    if (process.platform === "darwin") {
      icon.setTemplateImage(true);
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip("Echo");

    if (process.platform === "darwin") {
      // macOS: click opens menu
      this.tray.on("click", () => this.tray?.popUpContextMenu());
    } else {
      // Windows: double-click opens settings, right-click opens menu
      this.tray.on("double-click", () => this.windows.openSettings());
    }

    this.buildMenu();
  }

  buildMenu(): void {
    if (!this.tray) return;
    const cfg = this.config.get();

    const menu = Menu.buildFromTemplate([
      { label: `Echo (${cfg.modelSize})`, enabled: false },
      { label: `Hotkey: ${cfg.hotkey.toUpperCase()}`, enabled: false },
      { label: `Backend: ${cfg.backend.toUpperCase()}`, enabled: false },
      { type: "separator" },
      {
        label: "Settings...",
        click: () => this.windows.openSettings(),
      },
      { type: "separator" },
      {
        label: "Quit Echo",
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
