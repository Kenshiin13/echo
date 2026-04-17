import { app } from "electron";

export class SingleInstance {
  acquire(): boolean {
    return app.requestSingleInstanceLock();
  }

  release(): void {
    app.releaseSingleInstanceLock();
  }
}
