import React, { useEffect, useRef, useState } from "react";
import {
  AppShell, NavLink, Stack, Group, Text, Button, Loader, Alert, Box,
  ScrollArea, Badge,
} from "@mantine/core";
import {
  IconSettings, IconBrain, IconWand, IconHistory, IconHandOff,
  IconInfoCircle, IconCheck, IconAlertCircle, IconRefresh,
} from "@tabler/icons-react";
import type { Config, SystemInfo } from "@shared/types";
import { GeneralSection } from "./sections/GeneralSection";
import { ModelSection } from "./sections/ModelSection";
import { PostProcessingSection } from "./sections/PostProcessingSection";
import { HandsFreeSection } from "./sections/HandsFreeSection";
import { HistorySection } from "./sections/HistorySection";
import { AboutSection } from "./sections/AboutSection";

type SectionId = "general" | "model" | "post-processing" | "hands-free" | "history" | "about";

interface NavItem {
  id: SectionId;
  label: string;
  icon: typeof IconSettings;
}

const NAV: NavItem[] = [
  { id: "general",         label: "General",              icon: IconSettings },
  { id: "model",           label: "Model",                icon: IconBrain },
  { id: "post-processing", label: "Post-processing",      icon: IconWand },
  { id: "hands-free",      label: "Hands-free",           icon: IconHandOff },
  { id: "history",         label: "History",              icon: IconHistory },
  { id: "about",           label: "About",                icon: IconInfoCircle },
];

function assetUrl(sysInfo: SystemInfo, name: string): string {
  return `${sysInfo.assetsUrl}/${name}`;
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [active, setActive] = useState<SectionId>("general");
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const didFireReady = useRef(false);
  const skipFirstAutoSave = useRef(true);

  useEffect(() => {
    Promise.all([
      window.echo.getConfig(),
      window.echo.getSystemInfo(),
      window.echo.listModels(),
    ]).then(([cfg, info, models]) => {
      setConfig(cfg);
      setSysInfo(info);
      setDownloadedModels(models);
    });
  }, []);

  useEffect(() => {
    if (config && sysInfo && !didFireReady.current) {
      didFireReady.current = true;
      window.dispatchEvent(new Event("echo:ready"));
    }
  }, [config, sysInfo]);

  useEffect(() => {
    return window.echo.onModelDownloaded(async () => {
      const models = await window.echo.listModels();
      setDownloadedModels(models);
    });
  }, []);

  // Debounced auto-save. Skips the first render (initial config load from disk).
  useEffect(() => {
    if (!config) return;
    if (skipFirstAutoSave.current) {
      skipFirstAutoSave.current = false;
      return;
    }
    setError(null);
    const t = setTimeout(async () => {
      setSaving(true);
      const result = await window.echo.saveConfig(config);
      setSaving(false);
      if (result.ok) {
        setSaved(true);
        const models = await window.echo.listModels();
        setDownloadedModels(models);
        setTimeout(() => setSaved(false), 1200);
      } else {
        setError(result.error ?? "Save failed");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [config]);

  function patch<K extends keyof Config>(key: K, val: Config[K]) {
    setConfig((c) => (c ? { ...c, [key]: val } : c));
    const restartKeys: (keyof Config)[] = ["exitKey", "backend"];
    if (restartKeys.includes(key)) setNeedsRestart(true);
  }

  async function handleDeleteModel(modelSize: string) {
    setDeletingModel(modelSize);
    await window.echo.deleteModel(modelSize);
    const models = await window.echo.listModels();
    setDownloadedModels(models);
    setDeletingModel(null);
    // If the user just nuked the active model, auto-switch to another downloaded
    // one so transcription keeps working without a re-download. If nothing
    // remains, set modelSize to null — the UI banner prompts the user to pick
    // one, and the Select dropdown clears so re-picking the same size retriggers
    // the download confirm modal.
    if (config && modelSize === config.modelSize) {
      patch("modelSize", (models[0] ?? null) as Config["modelSize"]);
    }
  }

  if (!config || !sysInfo) {
    return (
      <Box style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <Loader color="echo" size="sm" />
      </Box>
    );
  }

  const logoUrl = assetUrl(sysInfo, "echo_header_top_left_256x96.png");
  const activeItem = NAV.find((n) => n.id === active)!;
  const showFooter = !!error || needsRestart;

  return (
    <AppShell
      padding={0}
      header={{ height: 52 }}
      navbar={{ width: 200, breakpoint: 0 }}
      styles={{
        root: { background: "var(--bg)", height: "100%" },
        main: { background: "var(--bg)", display: "flex", flexDirection: "column", height: "calc(100vh - 52px)" },
        header: { background: "var(--bg)", borderBottom: "1px solid var(--border)" },
        navbar: { background: "var(--surface)", borderRight: "1px solid var(--border)" },
      }}
    >
      <AppShell.Header style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <Group h="100%" px="md" gap="xs" align="center" justify="space-between" wrap="nowrap">
          {/* Logo asset already contains the ECHO wordmark — no separate text
              needed. Height bumped so it's actually readable. */}
          <img src={logoUrl} alt="Echo" height={34} style={{ objectFit: "contain", display: "block" }} />
          <SaveIndicator saving={saving} saved={saved} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap={2}>
          {NAV.map((item) => (
            <NavLink
              key={item.id}
              active={active === item.id}
              label={item.label}
              leftSection={<item.icon size={15} />}
              onClick={() => setActive(item.id)}
              color="echo"
              variant="light"
              styles={{
                root: { borderRadius: 8, padding: "8px 10px", transition: "background 0.15s" },
                label: { fontSize: "var(--mantine-font-size-sm)" },
              }}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <ScrollArea style={{ flex: 1 }} scrollbarSize={5}>
          <Box
            key={active}
            p="xl"
            style={{ animation: "fadeIn 0.18s ease-out both" }}
          >
            <Text size="md" fw={600} c="white" mb="lg">
              {activeItem.title}
            </Text>

            <SectionBoundary sectionId={active}>
              {active === "general" && (
                <GeneralSection config={config} patch={patch} />
              )}
              {active === "model" && (
                <ModelSection
                  config={config}
                  patch={patch}
                  sysInfo={sysInfo}
                  downloadedModels={downloadedModels}
                  onDelete={handleDeleteModel}
                  deletingModel={deletingModel}
                />
              )}
              {active === "post-processing" && (
                <PostProcessingSection config={config} patch={patch} />
              )}
              {active === "hands-free" && (
                <HandsFreeSection config={config} patch={patch} />
              )}
              {active === "history" && (
                <HistorySection config={config} patch={patch} />
              )}
              {active === "about" && (
                <AboutSection sysInfo={sysInfo} config={config} patch={patch} />
              )}
            </SectionBoundary>
          </Box>
        </ScrollArea>

        {showFooter && (
          <Box
            px="xl"
            py="sm"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--surface)",
              flexShrink: 0,
            }}
          >
            <Stack gap={8}>
              {error && (
                <Alert icon={<IconAlertCircle size={14} />} color="red" variant="light" radius="md" p="xs">
                  {error}
                </Alert>
              )}
              {needsRestart && (
                <Alert icon={<IconRefresh size={14} />} color="echo" variant="light" radius="md" p="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="xs">Restart required for some changes.</Text>
                    <Button
                      size="xs"
                      variant="light"
                      color="echo"
                      onClick={() => window.echo.restart()}
                      leftSection={<IconRefresh size={12} />}
                    >
                      Restart
                    </Button>
                  </Group>
                </Alert>
              )}
            </Stack>
          </Box>
        )}
      </AppShell.Main>
    </AppShell>
  );
}

function SaveIndicator({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <Group gap={6} style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <Loader color="echo" size={12} />
        <Text size="xs" c="dimmed">Saving…</Text>
      </Group>
    );
  }
  if (saved) {
    return (
      <Group gap={4} style={{ animation: "fadeUp 0.2s ease-out", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <IconCheck size={13} color="var(--mantine-color-green-5)" />
        <Text size="xs" c="green.5">Saved</Text>
      </Group>
    );
  }
  return null;
}

void Badge;

// Catches render-time crashes in any section so the whole settings window
// doesn't go blank. Resets whenever the active tab changes so fixing a
// section re-mounts cleanly on next nav.
class SectionBoundary extends React.Component<
  { sectionId: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[settings] section render crashed:", error, info);
  }
  componentDidUpdate(prev: { sectionId: string }) {
    if (prev.sectionId !== this.props.sectionId && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <Alert icon={<IconAlertCircle size={14} />} color="red" variant="light" radius="md">
          <Stack gap={6}>
            <Text size="sm" fw={600}>Render crashed in this section</Text>
            <Text
              size="xs"
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "Consolas, monospace",
              }}
            >
              {this.state.error.stack ?? this.state.error.message}
            </Text>
          </Stack>
        </Alert>
      );
    }
    return this.props.children;
  }
}
