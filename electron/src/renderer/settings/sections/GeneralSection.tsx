import { Stack, Switch, Divider, Group, Text } from "@mantine/core";
import type { Config } from "@shared/types";
import { KeybindInput } from "../components/KeybindInput";
import { InfoHint } from "../components/InfoHint";

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
}

export function GeneralSection({ config, patch }: Props) {
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
