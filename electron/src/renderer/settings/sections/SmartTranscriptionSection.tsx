import {
  Stack, Select, Switch, Group, Text, ActionIcon, Tooltip, Alert,
} from "@mantine/core";
import { IconRefresh, IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Config, SmartTarget } from "@shared/types";
import type { SmartWindow } from "../../../preload/index";
import { InfoHint } from "../components/InfoHint";

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
}

const NONE_VALUE = "__none__";

// Target keyed by PID when available (distinguishes two Notepads, two Chrome
// windows). When PID is unknown (fallback path), use title so Mantine's
// Select doesn't get duplicate "pid:0" values and render empty.
function keyFor(w: SmartWindow, index: number): string {
  return w.pid ? `pid:${w.pid}` : `t:${index}:${w.title}`;
}

export function SmartTranscriptionSection({ config, patch }: Props) {
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
  }, []);

  const currentKey = target ? `pid:${target.pid}` : NONE_VALUE;
  const pinnedAlive = target ? windows.some((w) => w.pid === target.pid) : false;

  const data = [
    { value: NONE_VALUE, label: "None (paste at cursor)" },
    ...(target && !pinnedAlive
      ? [{ value: currentKey, label: `${target.title} (not open)` }]
      : []),
    ...windows.map((w, i) => ({
      value: keyFor(w, i),
      label: w.title,
    })),
  ];

  async function handleChange(value: string | null) {
    if (!value || value === NONE_VALUE) {
      await window.echo.setSmartTarget(null);
      setTarget(null);
      return;
    }
    const picked = windows.find((w, i) => keyFor(w, i) === value);
    if (!picked) return;
    const next: SmartTarget = {
      pid: picked.pid,
      title: picked.title,
    };
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
          onChange={handleChange}
          data={data}
          searchable
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

      {target && !pinnedAlive && (
        <Alert icon={<IconAlertCircle size={14} />} color="yellow" variant="light" radius="md" p="xs">
          <Text size="xs">
            Pinned window isn't open right now. Transcripts will paste at your
            cursor until it reopens.
          </Text>
        </Alert>
      )}

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
        description="Sends Enter right after the paste keystroke."
        checked={config.smartAutoSubmit}
        onChange={(e) => patch("smartAutoSubmit", e.currentTarget.checked)}
        color="echo"
      />
    </Stack>
  );
}
