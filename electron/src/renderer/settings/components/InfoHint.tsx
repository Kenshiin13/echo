import { HoverCard, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  width?: number;
}

export function InfoHint({ children, width = 300 }: Props) {
  return (
    <HoverCard width={width} shadow="md" withArrow openDelay={100} closeDelay={200}>
      <HoverCard.Target>
        <IconInfoCircle
          size={13}
          style={{ cursor: "help", color: "var(--muted)", flexShrink: 0 }}
        />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        {typeof children === "string"
          ? <Text size="xs">{children}</Text>
          : children}
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
