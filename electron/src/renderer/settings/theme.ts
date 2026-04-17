import { createTheme, rem } from "@mantine/core";

export const echoTheme = createTheme({
  primaryColor: "echo",
  colors: {
    echo: [
      "#e8f4fc", "#c5e3f5", "#9fd0ec", "#74bce3",
      "#54acd9", "#3FA8E0", "#2e96cf", "#1d7fb5",
      "#0d6899", "#00527e",
    ],
    dark: [
      "#E8EDF5", "#c1cce0", "#96a8c4", "#6B7A99",
      "#3d4f6e", "#1e2d45", "#111827", "#0d1520",
      "#0B1220", "#080e18",
    ],
  },
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radius: { sm: rem(6), md: rem(8), lg: rem(12) },
  components: {
    Select: {
      defaultProps: { variant: "filled" },
    },
    TextInput: {
      defaultProps: { variant: "filled" },
    },
    Switch: {
      styles: {
        track: { cursor: "pointer" },
        label: { cursor: "pointer" },
      },
    },
  },
});
