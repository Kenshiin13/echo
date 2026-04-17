import React from "react";
import { Group, Text, ActionIcon } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

export function TitleBar() {
  const isMac = navigator.userAgent.includes("Macintosh");

  return (
    <Group
      px="lg"
      style={{
        height: 48,
        flexShrink: 0,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        WebkitAppRegion: "drag",
        paddingLeft: isMac ? 80 : "var(--mantine-spacing-lg)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      } as React.CSSProperties}
    >
      <Text
        size="sm"
        fw={600}
        c="echo.5"
        style={{ WebkitAppRegion: "no-drag", letterSpacing: "0.02em" } as React.CSSProperties}
      >
        Echo
      </Text>

      {!isMac && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size={28}
          radius="sm"
          onClick={() => window.echo.closeSettings()}
          style={{
            WebkitAppRegion: "no-drag",
            color: "var(--muted)",
            transition: "background 0.15s, color 0.15s",
          } as React.CSSProperties}
          aria-label="Close settings"
        >
          <IconX size={14} stroke={2} />
        </ActionIcon>
      )}
    </Group>
  );
}
