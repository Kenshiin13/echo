import React from "react";
import { Text } from "@mantine/core";

interface Props {
  children: React.ReactNode;
}

export function SectionLabel({ children }: Props) {
  return (
    <Text
      size="xs"
      fw={600}
      tt="uppercase"
      ls={1.5}
      c="dimmed"
      style={{ letterSpacing: "0.1em" }}
    >
      {children}
    </Text>
  );
}
