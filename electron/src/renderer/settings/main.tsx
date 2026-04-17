import React from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";
import { App } from "./App";
import { echoTheme } from "./theme";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={echoTheme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);

// Listen for the app-ready event fired by App.tsx once data is loaded
window.addEventListener("echo:ready", () => {
  const el = document.getElementById("preloader");
  if (!el) return;
  el.classList.add("out");
  setTimeout(() => el.remove(), 380);
}, { once: true });
