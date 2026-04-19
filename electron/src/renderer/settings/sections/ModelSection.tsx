import {
  Stack, Select, Text, Divider,
  Badge, ActionIcon, Modal, Button, Group, Alert,
} from "@mantine/core";
import { IconCpu, IconTrash, IconAlertCircle, IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import type { Config, SystemInfo } from "@shared/types";
import { InfoHint } from "../components/InfoHint";

const MODEL_LABELS: Record<string, string> = {
  tiny:             "Tiny — 75 MB",
  base:             "Base — 142 MB",
  small:            "Small — 488 MB",
  medium:           "Medium — 1.5 GB",
  "large-v3-turbo": "Large v3 Turbo — 1.6 GB",
};

const MODEL_SIZES: Record<string, string> = {
  tiny:             "75 MB",
  base:             "142 MB",
  small:            "488 MB",
  medium:           "1.5 GB",
  "large-v3-turbo": "1.6 GB",
};

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
  sysInfo: SystemInfo;
  downloadedModels: string[];
  onDelete: (modelSize: string) => void | Promise<void>;
  deletingModel: string | null;
}

export function ModelSection({
  config, patch, sysInfo, downloadedModels, onDelete, deletingModel,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<string | null>(null);

  function handleModelChange(v: string | null) {
    if (!v) return;
    if (downloadedModels.includes(v)) {
      patch("modelSize", v as Config["modelSize"]);
    } else {
      setConfirmSwitch(v);
    }
  }

  return (
    <>
      <Stack gap="lg">
        {downloadedModels.length === 0 && (
          <Alert icon={<IconAlertCircle size={14} />} color="yellow" variant="light" radius="md" p="xs">
            <Text size="xs">
              No models downloaded — transcription is disabled. Pick a size below to
              download one.
            </Text>
          </Alert>
        )}

        <Select
          label={
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={500}>Whisper model size</Text>
              <InfoHint>
                Larger models are more accurate but use more RAM and take longer to
                load the first time. Switching is live — no restart needed.
              </InfoHint>
            </Group>
          }
          value={config.modelSize}
          onChange={handleModelChange}
          placeholder="No model selected"
          data={[
            { value: "tiny",           label: "Tiny — 75 MB · fastest" },
            { value: "base",           label: "Base — 142 MB (default)" },
            { value: "small",          label: "Small — 488 MB · good quality" },
            { value: "medium",         label: "Medium — 1.5 GB · great quality" },
            { value: "large-v3-turbo", label: "Large v3 Turbo — 1.6 GB · best" },
          ]}
        />
        <Select
          label={
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={500}>Language</Text>
              <InfoHint>
                Auto-detect is recommended. Pinning a language gives a small speedup
                and lets translation skip when you're already speaking the target.
              </InfoHint>
            </Group>
          }
          value={config.language ?? "auto"}
          onChange={(v) => patch("language", v === "auto" ? null : v)}
          searchable
          data={[
            { value: "auto", label: "Auto-detect" },
            { value: "en", label: "English" },
            { value: "de", label: "German" },
            { value: "fr", label: "French" },
            { value: "es", label: "Spanish" },
            { value: "it", label: "Italian" },
            { value: "pt", label: "Portuguese" },
            { value: "nl", label: "Dutch" },
            { value: "ru", label: "Russian" },
            { value: "zh", label: "Chinese" },
            { value: "ja", label: "Japanese" },
            { value: "ko", label: "Korean" },
            { value: "ar", label: "Arabic" },
          ]}
        />
        <Select
          label="Compute backend"
          description={`Recommended: ${sysInfo.recommendedBackend.toUpperCase()}`}
          value={config.backend}
          onChange={(v) => v && patch("backend", v as Config["backend"])}
          data={[
            { value: "cpu",  label: "CPU" },
            { value: "cuda", label: "CUDA — NVIDIA GPU", disabled: !sysInfo.hasNvidiaGpu },
          ]}
          leftSection={<IconCpu size={14} />}
        />

        <Divider />

        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={500}>Downloaded models</Text>
          <InfoHint>
            Cached at <code>%APPDATA%\Echo\whisper-cpp\models\</code>. Deleting one
            here only frees disk space — your active selection is unchanged.
          </InfoHint>
        </Group>

        {downloadedModels.length === 0 ? (
          <Text size="xs" c="dimmed">
            None yet — pick a size above to download on save.
          </Text>
        ) : (
          <Stack gap="sm">
            {downloadedModels.map((m) => (
              <Group
                key={m}
                justify="space-between"
                wrap="nowrap"
                p="sm"
                style={{
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <Text size="sm">
                  {MODEL_LABELS[m] ?? m}
                  {m === config.modelSize && (
                    <Badge ml={8} size="xs" variant="light" color="echo">active</Badge>
                  )}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={26}
                  radius="sm"
                  loading={deletingModel === m}
                  disabled={deletingModel !== null}
                  onClick={() => setConfirmDelete(m)}
                  aria-label={`Delete ${m} model`}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete model?"
        centered
        radius="md"
        overlayProps={{ backgroundOpacity: 0.5, blur: 3 }}
      >
        <Stack gap="md">
          <Text size="sm">
            Delete{" "}
            <Text span fw={600} c="echo.4">
              {confirmDelete ? (MODEL_LABELS[confirmDelete] ?? confirmDelete) : ""}
            </Text>
            ?
          </Text>
          {confirmDelete === config.modelSize && (
            <Alert icon={<IconAlertCircle size={14} />} color="yellow" variant="light" radius="md" p="xs">
              <Text size="xs">
                {downloadedModels.length > 1
                  ? "This is your active model — Echo will switch to another downloaded model automatically."
                  : "This is your only model — transcription will be disabled until you download one."}
              </Text>
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                const m = confirmDelete;
                setConfirmDelete(null);
                if (m) onDelete(m);
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={confirmSwitch !== null}
        onClose={() => setConfirmSwitch(null)}
        title="Download model?"
        centered
        radius="md"
        overlayProps={{ backgroundOpacity: 0.5, blur: 3 }}
      >
        <Stack gap="md">
          <Text size="sm">
            <Text span fw={600} c="echo.4">
              {confirmSwitch ? (MODEL_LABELS[confirmSwitch] ?? confirmSwitch) : ""}
            </Text>
            {" "}isn't downloaded yet. Switching will download{" "}
            {confirmSwitch ? MODEL_SIZES[confirmSwitch] : ""} in the background.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setConfirmSwitch(null)}>
              Cancel
            </Button>
            <Button
              color="echo"
              leftSection={<IconDownload size={14} />}
              onClick={() => {
                const m = confirmSwitch;
                setConfirmSwitch(null);
                if (m) patch("modelSize", m as Config["modelSize"]);
              }}
            >
              Download & switch
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
