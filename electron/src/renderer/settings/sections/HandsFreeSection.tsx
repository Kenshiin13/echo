import {
  Stack, Select, Switch, Group, Text, ActionIcon, Tooltip, Divider,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Config, SmartTarget } from "@shared/types";
import type { SmartWindow } from "../../../preload/index";
import { InfoHint } from "../components/InfoHint";

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
}

// Each row gets a unique key by index — multiple windows can share a PID
// (Chrome, VS Code, Office…) so PID alone would collide. Identity is still
// stored as the PID (see SmartTarget), this is only the Select's data key.
function keyFor(_w: SmartWindow, index: number): string {
  return `w:${index}`;
}

export function HandsFreeSection({ config, patch }: Props) {
  const [windows, setWindows] = useState<SmartWindow[]>([]);
  const [target, setTarget] = useState<SmartTarget | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshWindows() {
    setLoading(true);
    try {
      setWindows(await window.echo.listSmartWindows());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshWindows();
    window.echo.getSmartTarget().then(setTarget).catch(() => {});
    // Main clears the pin itself when the target process dies — keep our
    // local state in sync so the dropdown doesn't show a stale selection.
    const off = window.echo.onSmartTargetChanged((t) => setTarget(t));
    return off;
  }, []);

  // Map the stored PID to its row in the listed windows (if present). The
  // window can be MISSING from the list for reasons other than "dead":
  // desktopCapturer skips minimized windows, windows on other virtual
  // desktops, etc. So we keep showing the pin as selected in those cases —
  // main clears the pin via `smart:target-changed` only when the actual
  // process dies.
  const pinnedIndex = target ? windows.findIndex((w) => w.pid === target.pid) : -1;
  const pinnedVisible = pinnedIndex >= 0;
  const PINNED_OFFSCREEN_KEY = "__pinned__";

  const data = [
    ...(target && !pinnedVisible
      ? [{ value: PINNED_OFFSCREEN_KEY, label: target.title }]
      : []),
    ...windows.map((w, i) => ({ value: keyFor(w, i), label: w.title })),
  ];
  const currentKey = target
    ? pinnedVisible
      ? keyFor(windows[pinnedIndex], pinnedIndex)
      : PINNED_OFFSCREEN_KEY
    : null;

  async function handleTargetChange(value: string | null) {
    if (!value) {
      await window.echo.setSmartTarget(null);
      setTarget(null);
      return;
    }
    if (value === PINNED_OFFSCREEN_KEY) {
      // Clicking the already-pinned synthetic entry — nothing to change.
      return;
    }
    const picked = windows.find((w, i) => keyFor(w, i) === value);
    if (!picked) return;
    const next: SmartTarget = { pid: picked.pid, title: picked.title };
    await window.echo.setSmartTarget(next);
    setTarget(next);
  }

  return (
    <Stack gap="lg">
      <Group gap={6} align="flex-end" wrap="nowrap">
        <Select
          style={{ flex: 1 }}
          label={
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={500}>Target window</Text>
              <InfoHint>
                Echo focuses this window and pastes there, even if you're using
                another app. Identified by process ID so title changes (Chrome
                tab switches, Notepad edits) don't break the pin. Cleared on
                app restart — pick again next session.
              </InfoHint>
            </Group>
          }
          value={currentKey}
          onChange={handleTargetChange}
          data={data}
          placeholder="None (paste at cursor)"
          searchable
          clearable
          styles={{ label: { marginBottom: 8 } }}
        />
        <Tooltip label="Refresh window list" openDelay={300} withArrow>
          <ActionIcon
            variant="light"
            color="echo"
            size={36}
            radius="sm"
            onClick={refreshWindows}
            loading={loading}
            aria-label="Refresh window list"
          >
            <IconRefresh size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Divider my="sm" />

      <Switch
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Voice activation</Text>
            <InfoHint>
              Hands-free mode using Silero VAD. Disables the push-to-talk hotkey
              and keeps the microphone live, transcribing whenever speech is
              detected. Toggles without a restart.
            </InfoHint>
          </Group>
        }
        checked={config.voiceActivation}
        onChange={(e) => patch("voiceActivation", e.currentTarget.checked)}
        color="echo"
      />

      <Switch
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Auto-paste transcript</Text>
            <InfoHint>
              Off = transcript is copied to the clipboard only, you paste it
              yourself with Ctrl+V.
            </InfoHint>
          </Group>
        }
        checked={config.autoPaste}
        onChange={(e) => patch("autoPaste", e.currentTarget.checked)}
        color="echo"
      />

      <Switch
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Auto-submit</Text>
            <InfoHint>
              Press Enter after pasting. Handy for chat inputs like Claude or
              ChatGPT where you'd otherwise have to reach for the keyboard.
            </InfoHint>
          </Group>
        }
        checked={config.smartAutoSubmit && config.autoPaste}
        onChange={(e) => patch("smartAutoSubmit", e.currentTarget.checked)}
        color="echo"
        disabled={!config.autoPaste}
      />
    </Stack>
  );
}
