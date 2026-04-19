import { Stack, Group, Badge, Text, Anchor, Button, Progress, Alert, Divider, Loader } from "@mantine/core";
import { IconRefresh, IconDownload, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { SystemInfo, UpdateState } from "@shared/types";

interface Props {
  sysInfo: SystemInfo;
}

interface ReleaseEntry {
  tag: string;
  name: string;
  date: string;
  url: string;
}

export function AboutSection({ sysInfo }: Props) {
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle" });
  const [releases, setReleases] = useState<ReleaseEntry[] | null>(null);
  const [releasesError, setReleasesError] = useState<string | null>(null);

  useEffect(() => {
    window.echo.getUpdateState().then(setUpdate).catch(() => {});
    const off = window.echo.onUpdateState(setUpdate);
    return off;
  }, []);

  useEffect(() => {
    fetch("https://api.github.com/repos/Kenshiin13/echo/releases?per_page=15")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Array<{ tag_name: string; name: string; published_at: string; html_url: string }>) => {
        setReleases(
          data.map((r) => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            date: r.published_at,
            url: r.html_url,
          })),
        );
      })
      .catch((err) => setReleasesError(err.message));
  }, []);

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Text size="sm" fw={500}>Echo</Text>
        <Text size="xs" c="dimmed">Local push-to-talk voice-to-text for Windows.</Text>
      </Stack>

      <Group gap={6} wrap="wrap">
        <Badge variant="outline" color="dark.3" size="sm" radius="sm">
          v{sysInfo.appVersion}
        </Badge>
        <Badge variant="outline" color="dark.3" size="sm" radius="sm">
          {sysInfo.platform}
        </Badge>
        {sysInfo.hasNvidiaGpu && (
          <Badge variant="light" color="echo" size="sm" radius="sm">
            NVIDIA GPU
          </Badge>
        )}
      </Group>

      <UpdateStatus state={update} />

      <Stack gap={4} mt="sm">
        <Text size="xs" c="dimmed">
          Source:{" "}
          <Anchor href="https://github.com/Kenshiin13/echo" target="_blank" rel="noopener noreferrer" size="xs" c="echo.4">
            github.com/Kenshiin13/echo
          </Anchor>
        </Text>
        <Text size="xs" c="dimmed">
          Issues:{" "}
          <Anchor href="https://github.com/Kenshiin13/echo/issues" target="_blank" rel="noopener noreferrer" size="xs" c="echo.4">
            github.com/Kenshiin13/echo/issues
          </Anchor>
        </Text>
      </Stack>

      <Divider />

      <Text size="sm" fw={500}>What's new</Text>
      {releases === null && !releasesError && (
        <Group gap={6}><Loader color="echo" size={12} /><Text size="xs" c="dimmed">Loading release notes…</Text></Group>
      )}
      {releasesError && (
        <Text size="xs" c="dimmed">Couldn't load release notes ({releasesError}).</Text>
      )}
      {releases && releases.length === 0 && (
        <Text size="xs" c="dimmed">No releases published yet.</Text>
      )}
      {releases && releases.length > 0 && (
        <Stack gap="md">
          {releases.map((r, i) => (
            <ReleaseCard
              key={r.tag}
              release={r}
              prevTag={releases[i + 1]?.tag}
              currentVersion={sysInfo.appVersion}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function UpdateStatus({ state }: { state: UpdateState }) {
  if (state.phase === "idle") {
    return (
      <Group justify="flex-start">
        <Button
          size="xs"
          variant="light"
          color="echo"
          leftSection={<IconRefresh size={13} />}
          onClick={() => window.echo.checkForUpdates()}
        >
          Check for updates
        </Button>
      </Group>
    );
  }
  if (state.phase === "checking") {
    return (
      <Group gap={8}>
        <Loader color="echo" size={12} />
        <Text size="xs" c="dimmed">Checking for updates…</Text>
      </Group>
    );
  }
  if (state.phase === "not-available") {
    return (
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6}>
          <IconCheck size={14} color="var(--mantine-color-green-5)" />
          <Text size="xs" c="dimmed">You're on the latest version.</Text>
        </Group>
        <Button
          size="xs"
          variant="subtle"
          color="echo"
          leftSection={<IconRefresh size={12} />}
          onClick={() => window.echo.checkForUpdates()}
        >
          Check again
        </Button>
      </Group>
    );
  }
  if (state.phase === "available") {
    return (
      <Alert icon={<IconDownload size={14} />} color="echo" variant="light" radius="md" p="xs">
        <Text size="xs">Update v{state.version} found — starting download…</Text>
      </Alert>
    );
  }
  if (state.phase === "downloading") {
    return (
      <Stack gap={6}>
        <Text size="xs" c="dimmed">Downloading v{state.version} — {state.percent}%</Text>
        <Progress value={state.percent} color="echo" size="sm" radius="sm" animated />
      </Stack>
    );
  }
  if (state.phase === "downloaded") {
    return (
      <Alert icon={<IconCheck size={14} />} color="echo" variant="light" radius="md" p="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs">v{state.version} ready to install.</Text>
          <Button
            size="xs"
            color="echo"
            leftSection={<IconRefresh size={12} />}
            onClick={() => window.echo.installUpdate()}
          >
            Restart &amp; install
          </Button>
        </Group>
      </Alert>
    );
  }
  return (
    <Alert icon={<IconAlertCircle size={14} />} color="red" variant="light" radius="md" p="xs">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs">Update check failed: {state.message}</Text>
        <Button size="xs" variant="subtle" color="red" onClick={() => window.echo.checkForUpdates()}>
          Retry
        </Button>
      </Group>
    </Alert>
  );
}

function ReleaseCard({
  release,
  prevTag,
  currentVersion,
}: {
  release: ReleaseEntry;
  prevTag: string | undefined;
  currentVersion: string;
}) {
  const tagTrim = release.tag.replace(/^v/, "");
  const isCurrent = tagTrim === currentVersion;
  // Prefer the compare-view so users see the actual diff between versions.
  // For the oldest entry (no predecessor) fall back to the release page itself.
  const headerHref = prevTag
    ? `https://github.com/Kenshiin13/echo/compare/${prevTag}...${release.tag}`
    : release.url;
  return (
    <Stack
      gap={4}
      p="sm"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} wrap="nowrap">
          <Anchor
            href={headerHref}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            fw={600}
            c="echo.4"
          >
            {release.name}
          </Anchor>
          {isCurrent && (
            <Badge size="xs" variant="light" color="echo" radius="sm">current</Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {new Date(release.date).toLocaleDateString()}
        </Text>
      </Group>
    </Stack>
  );
}
