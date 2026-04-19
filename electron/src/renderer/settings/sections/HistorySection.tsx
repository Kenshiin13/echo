import {
  Stack, Group, Text, Switch, Button, ActionIcon, Tooltip, Modal, Alert,
} from "@mantine/core";
import { IconCopy, IconTrash, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Config, HistoryEntry } from "@shared/types";

interface Props {
  config: Config;
  patch: <K extends keyof Config>(key: K, val: Config[K]) => void;
}

export function HistorySection({ config, patch }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    window.echo.listHistory().then(setEntries).catch(() => setEntries([]));
    return window.echo.onHistoryUpdated(() => {
      window.echo.listHistory().then(setEntries).catch(() => {});
    });
  }, []);

  async function handleCopy(entry: HistoryEntry) {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1200);
    } catch {
      // clipboard denied — unlikely in Electron
    }
  }

  async function handleDelete(id: string) {
    await window.echo.deleteHistoryEntry(id);
    setEntries((list) => list.filter((e) => e.id !== id));
  }

  async function handleClear() {
    setConfirmClear(false);
    await window.echo.clearHistory();
    setEntries([]);
  }

  return (
    <>
      <Stack gap="lg">
        <Switch
          label="Save history"
          description="Keeps the last 50 transcripts so you can copy them again later."
          checked={config.historyEnabled}
          onChange={(e) => patch("historyEnabled", e.currentTarget.checked)}
          color="echo"
        />

        {!config.historyEnabled && entries.length > 0 && (
          <Alert icon={<IconAlertCircle size={14} />} color="yellow" variant="light" radius="md" p="xs">
            <Text size="xs">
              History is off — existing entries are kept but new transcripts won't be saved.
            </Text>
          </Alert>
        )}

        {entries.length > 0 && (
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </Text>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={12} />}
              onClick={() => setConfirmClear(true)}
            >
              Clear all
            </Button>
          </Group>
        )}

        {entries.length === 0 ? (
          <Text size="xs" c="dimmed">
            No transcripts yet. {config.historyEnabled ? "Your last 50 recordings will show up here." : "Turn on saving to start building your history."}
          </Text>
        ) : (
          <Stack gap="sm">
            {entries.map((e) => (
              <HistoryRow
                key={e.id}
                entry={e}
                copied={copiedId === e.id}
                onCopy={() => handleCopy(e)}
                onDelete={() => handleDelete(e.id)}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all history?"
        centered
        radius="md"
        overlayProps={{ backgroundOpacity: 0.5, blur: 3 }}
      >
        <Stack gap="md">
          <Text size="sm">
            All {entries.length} saved {entries.length === 1 ? "transcript" : "transcripts"} will be deleted. This can't be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button color="red" leftSection={<IconTrash size={14} />} onClick={handleClear}>
              Delete all
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function HistoryRow({
  entry,
  copied,
  onCopy,
  onDelete,
}: {
  entry: HistoryEntry;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <Group
      wrap="nowrap"
      align="flex-start"
      p="sm"
      gap="sm"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Tooltip label={new Date(entry.timestamp).toLocaleString()} openDelay={300} withArrow>
          <Text size="xs" c="dimmed" w="fit-content">{relativeTime(entry.timestamp)}</Text>
        </Tooltip>
        <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {entry.text}
        </Text>
      </Stack>
      <Group gap={4} wrap="nowrap">
        <Tooltip label={copied ? "Copied" : "Copy"} openDelay={300} withArrow>
          <ActionIcon
            variant="subtle"
            color={copied ? "green" : "echo"}
            size={26}
            radius="sm"
            onClick={onCopy}
            aria-label="Copy transcript"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete" openDelay={300} withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size={26}
            radius="sm"
            onClick={onDelete}
            aria-label="Delete transcript"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
