import {
  Stack, Text, Group, TextInput, ActionIcon, Button, Divider,
  Select, Alert, PasswordInput, Anchor, Textarea,
} from "@mantine/core";
import { IconX, IconPlus, IconCloudUpload } from "@tabler/icons-react";
import type { Config, Replacement } from "@shared/types";
import { InfoHint } from "../components/InfoHint";

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
}

export function PostProcessingSection({ config, patch }: Props) {
  return (
    <Stack gap="lg">
      <Textarea
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Initial prompt</Text>
            <InfoHint width={340}>
              <Text size="xs">
                Whisper treats this as a <b>fake previous transcript</b> and continues in
                the same style — it doesn't follow instructions. Only the <i>shape</i> of
                your prompt matters (capitalization, punctuation, tone), not its meaning.
                Limit: ~224 tokens.
              </Text>
              <Text size="xs" mt={6} c="dimmed">
                ✅ Works — custom vocabulary:
                <br /><i>"Kubernetes, Postgres, TanStack, tRPC"</i>
              </Text>
              <Text size="xs" mt={4} c="dimmed">
                ✅ Works — make the prompt LOOK how you want output:
                <br /><i>"so yeah i was thinking we could maybe try it"</i>
              </Text>
              <Text size="xs" mt={4} c="dimmed">
                ❌ Doesn't work — English instructions:
                <br /><i>"No punctuation. Casual. All lowercase."</i>
              </Text>
            </InfoHint>
          </Group>
        }
        placeholder="e.g. Kubernetes, Postgres, TanStack, tRPC"
        value={config.prompt}
        onChange={(e) => patch("prompt", e.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={5}
      />

      <Divider />

      <Select
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>Translate to</Text>
            <InfoHint>
              Via DeepL. Skipped automatically when the detected language already
              matches the target.
            </InfoHint>
          </Group>
        }
        value={config.translateTo ?? "off"}
        onChange={(v) => patch("translateTo", v === "off" || !v ? null : v)}
        data={[
          { value: "off", label: "Off" },
          { value: "EN", label: "English" },
          { value: "DE", label: "German" },
          { value: "FR", label: "French" },
          { value: "ES", label: "Spanish" },
          { value: "IT", label: "Italian" },
          { value: "PT", label: "Portuguese" },
          { value: "NL", label: "Dutch" },
          { value: "PL", label: "Polish" },
          { value: "RU", label: "Russian" },
          { value: "UK", label: "Ukrainian" },
          { value: "ZH", label: "Chinese" },
          { value: "JA", label: "Japanese" },
          { value: "KO", label: "Korean" },
          { value: "TR", label: "Turkish" },
          { value: "SV", label: "Swedish" },
          { value: "DA", label: "Danish" },
          { value: "FI", label: "Finnish" },
          { value: "NB", label: "Norwegian" },
          { value: "CS", label: "Czech" },
          { value: "EL", label: "Greek" },
          { value: "HU", label: "Hungarian" },
          { value: "RO", label: "Romanian" },
          { value: "BG", label: "Bulgarian" },
          { value: "SK", label: "Slovak" },
          { value: "SL", label: "Slovenian" },
          { value: "LT", label: "Lithuanian" },
          { value: "LV", label: "Latvian" },
          { value: "ET", label: "Estonian" },
          { value: "ID", label: "Indonesian" },
        ]}
      />

      {config.translateTo && (
        <Alert icon={<IconCloudUpload size={14} />} color="yellow" variant="light" radius="md" p="xs">
          <Text size="xs">
            Transcript text is sent to DeepL. Audio stays local.
          </Text>
        </Alert>
      )}

      <PasswordInput
        label={
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500}>DeepL API key</Text>
            <InfoHint>
              <Text size="xs">
                Free keys end in <code>:fx</code> and include 500,000 characters/month.
              </Text>
              <Anchor
                href="https://www.deepl.com/your-account/keys"
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                c="echo.4"
                mt={6}
                style={{ display: "inline-block" }}
              >
                Get a DeepL API key →
              </Anchor>
            </InfoHint>
          </Group>
        }
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
        value={config.deeplApiKey}
        onChange={(e) => patch("deeplApiKey", e.currentTarget.value)}
        error={
          config.translateTo && !config.deeplApiKey.trim()
            ? "Required for translation"
            : undefined
        }
      />

      <Divider />

      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={500}>Find &amp; Replace</Text>
        <InfoHint>
          Case-insensitive, run in order, applied last — after Whisper and any
          translation. Use <code>\n</code> to insert a newline.
        </InfoHint>
      </Group>

      {config.replacements.length > 0 && (
        <Stack gap={6}>
          {config.replacements.map((rule, i) => (
            <Group key={i} gap={6} wrap="nowrap" align="center">
              <TextInput
                placeholder="find"
                value={rule.from}
                onChange={(e) => {
                  const next: Replacement[] = config.replacements.map((r, j) =>
                    j === i ? { ...r, from: e.currentTarget.value } : r,
                  );
                  patch("replacements", next);
                }}
                style={{ flex: 1 }}
                size="xs"
              />
              <Text size="sm" c="dimmed">→</Text>
              <TextInput
                placeholder="replace with"
                value={rule.to}
                onChange={(e) => {
                  const next: Replacement[] = config.replacements.map((r, j) =>
                    j === i ? { ...r, to: e.currentTarget.value } : r,
                  );
                  patch("replacements", next);
                }}
                style={{ flex: 1 }}
                size="xs"
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size={24}
                radius="sm"
                onClick={() => {
                  const next = config.replacements.filter((_, j) => j !== i);
                  patch("replacements", next);
                }}
                aria-label="Remove rule"
              >
                <IconX size={13} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}

      <Button
        variant="light"
        color="echo"
        size="xs"
        leftSection={<IconPlus size={13} />}
        onClick={() =>
          patch("replacements", [...config.replacements, { from: "", to: "" }])
        }
        style={{ alignSelf: "flex-start" }}
      >
        Add rule
      </Button>
    </Stack>
  );
}
