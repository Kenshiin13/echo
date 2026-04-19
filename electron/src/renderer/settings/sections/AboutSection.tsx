import { Stack, Group, Badge, Text, Anchor } from "@mantine/core";
import type { SystemInfo } from "@shared/types";

interface Props {
  sysInfo: SystemInfo;
}

export function AboutSection({ sysInfo }: Props) {
  return (
    <Stack gap="md">
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

      <Stack gap={4} mt="sm">
        <Text size="xs" c="dimmed">
          Source:{" "}
          <Anchor
            href="https://github.com/Kenshiin13/echo"
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            c="echo.4"
          >
            github.com/Kenshiin13/echo
          </Anchor>
        </Text>
        <Text size="xs" c="dimmed">
          Issues:{" "}
          <Anchor
            href="https://github.com/Kenshiin13/echo/issues"
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            c="echo.4"
          >
            github.com/Kenshiin13/echo/issues
          </Anchor>
        </Text>
      </Stack>
    </Stack>
  );
}
