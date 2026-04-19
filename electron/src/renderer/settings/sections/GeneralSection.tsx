import { Stack, Switch, Divider, Group, Text, Select } from "@mantine/core";
import { useEffect, useState } from "react";
import type { Config } from "@shared/types";
import { KeybindInput } from "../components/KeybindInput";
import { InfoHint } from "../components/InfoHint";

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
}

// Windows' MediaDevices includes pseudo-devices "default" and "communications"
// that share IDs with real devices. We surface only real physical inputs and
// render our own "System default" entry on top.
const PSEUDO_IDS = new Set(["default", "communications", ""]);

async function listAudioInputs(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  async function enumerate() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput" && !PSEUDO_IDS.has(d.deviceId));
  }
  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await enumerate();
    // Labels are empty until the tab has held a mic stream at least once.
    // Briefly grab one so users actually see device names.
    if (devices.length > 0 && devices.every((d) => !d.label)) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        devices = await enumerate();
      } catch {
        // Permission denied — keep the label-less list.
      }
    }
  } catch (err) {
    console.warn("enumerateDevices failed:", err);
  }
  // Guard against any lingering duplicate deviceIds from pseudo-device aliases.
  const seen = new Set<string>();
  return devices
    .map((d) => ({ id: d.deviceId, label: d.label || "Microphone" }))
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

export function GeneralSection({ config, patch }: Props) {
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    listAudioInputs().then(setInputs).catch(() => setInputs([]));
  }, []);

  return (
    <Stack gap="lg">
      <KeybindInput
        label="Push-to-talk hotkey"
        description="Hold to record."
        value={config.hotkey}
        onChange={(v) => patch("hotkey", v)}
      />
      <KeybindInput
        label="Exit shortcut"
        description="Quit Echo."
        value={config.exitKey}
        onChange={(v) => patch("exitKey", v)}
      />
      <Select
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Microphone</Text>
            <InfoHint>
              Falls back to the OS default if the selected device is unplugged.
            </InfoHint>
          </Group>
        }
        value={config.audioInputDeviceId ?? "__default__"}
        onChange={(v) => patch("audioInputDeviceId", !v || v === "__default__" ? null : v)}
        data={[
          { value: "__default__", label: "System default" },
          ...inputs.map((d) => ({ value: d.id, label: d.label })),
        ]}
      />
      <Switch
        label="Auto-paste transcript"
        description="Off = clipboard only."
        checked={config.autoPaste}
        onChange={(e) => patch("autoPaste", e.currentTarget.checked)}
        color="echo"
      />
      <Switch
        label="Start at login"
        checked={config.autostart}
        onChange={(e) => patch("autostart", e.currentTarget.checked)}
        color="echo"
      />

      <Divider />

      <Switch
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Voice activation</Text>
            <InfoHint>
              Hands-free mode using Silero VAD. Disables the push-to-talk hotkey and
              keeps the microphone live, transcribing whenever speech is detected.
              Toggles without a restart.
            </InfoHint>
          </Group>
        }
        checked={config.voiceActivation}
        onChange={(e) => patch("voiceActivation", e.currentTarget.checked)}
        color="echo"
      />
    </Stack>
  );
}
