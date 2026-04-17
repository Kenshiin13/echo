import React, { useEffect, useRef, useState } from "react";
import {
  Stack, Group, Text, Button, Select, Switch,
  Badge, Loader, Alert, Box, ScrollArea, ActionIcon,
  PasswordInput, HoverCard, Anchor,
} from "@mantine/core";
import {
  IconAlertCircle, IconCheck, IconRefresh,
  IconMicrophone, IconCpu, IconBrain,
  IconBolt, IconInfoCircle, IconX, IconTrash,
  IconLanguage, IconCloudUpload,
} from "@tabler/icons-react";
import type { Config, SystemInfo } from "@shared/types";
import { SectionLabel } from "./components/SectionLabel";
import { KeybindInput } from "./components/KeybindInput";

// ── helpers ──────────────────────────────────────────────────────────────────

function assetUrl(sysInfo: SystemInfo, name: string): string {
  return `${sysInfo.assetsUrl}/${name}`;
}

// ── section card wrapper ──────────────────────────────────────────────────────

function Card({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Box
      className="echo-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Box>
  );
}

// ── branded header (replaces TitleBar + old static header) ───────────────────

function BrandedHeader({
  isMac,
  logoUrl,
  loading = false,
}: {
  isMac: boolean;
  logoUrl: string | null;
  loading?: boolean;
}) {
  return (
    <Box
      style={{
        flexShrink: 0,
        background: "linear-gradient(160deg, #0d1b30 0%, #0B1220 100%)",
        borderBottom: "1px solid var(--border)",
        padding: isMac ? "20px 24px 16px 80px" : "18px 24px 16px",
        position: "relative",
        overflow: "hidden",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Accent glow */}
      <Box
        style={{
          position: "absolute",
          top: -50, left: -30,
          width: 260, height: 260,
          background: "radial-gradient(circle, rgba(63,168,224,0.09) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Close button — Windows only */}
      {!isMac && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size={28}
          radius="sm"
          onClick={() => window.echo.closeSettings()}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            WebkitAppRegion: "no-drag",
            color: "var(--muted)",
            zIndex: 2,
          } as React.CSSProperties}
          aria-label="Close settings"
        >
          <IconX size={14} stroke={2} />
        </ActionIcon>
      )}

      {logoUrl ? (
        <>
          <img
            src={logoUrl}
            alt="Echo"
            style={{
              height: 42,
              objectFit: "contain",
              position: "relative",
              zIndex: 1,
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              const sib = img.nextElementSibling as HTMLElement | null;
              if (sib) sib.style.display = "block";
            }}
          />
          <Text
            fw={700} size="xl" c="echo.5"
            style={{ display: "none", letterSpacing: "0.2em", textTransform: "uppercase" }}
          >
            ECHO
          </Text>
        </>
      ) : (
        <Text fw={700} size="xl" c="echo.5" style={{ letterSpacing: "0.2em", textTransform: "uppercase" }}>
          ECHO
        </Text>
      )}

      {!loading && (
        <Text size="xs" c="dimmed" mt={4} style={{ position: "relative", zIndex: 1 }}>
          Voice-to-text · Powered by Whisper
        </Text>
      )}
    </Box>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const MODEL_LABELS: Record<string, string> = {
  tiny:            "Tiny — 75 MB",
  base:            "Base — 142 MB",
  small:           "Small — 488 MB",
  medium:          "Medium — 1.5 GB",
  "large-v3-turbo":"Large v3 Turbo — 1.6 GB",
};

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const didFireReady = useRef(false);

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

  async function handleDeleteModel(modelSize: string) {
    setDeletingModel(modelSize);
    await window.echo.deleteModel(modelSize);
    const models = await window.echo.listModels();
    setDownloadedModels(models);
    setDeletingModel(null);
  }

  // Dismiss preloader once data is loaded
  useEffect(() => {
    if (config && sysInfo && !didFireReady.current) {
      didFireReady.current = true;
      window.dispatchEvent(new Event("echo:ready"));
    }
  }, [config, sysInfo]);

  function patch<K extends keyof Config>(key: K, val: Config[K]) {
    setConfig((c) => (c ? { ...c, [key]: val } : c));
    const restartKeys: (keyof Config)[] = ["hotkey", "exitKey", "modelSize", "language", "backend"];
    if (restartKeys.includes(key)) setNeedsRestart(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    const result = await window.echo.saveConfig(config);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(result.error ?? "Save failed");
    }
  }

  const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");

  // Loading state — preloader visible until dismissed via echo:ready
  if (!config || !sysInfo) {
    return (
      <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <BrandedHeader isMac={isMac} logoUrl={null} loading />
        <Stack align="center" justify="center" style={{ flex: 1 }}>
          <Loader color="echo" size="sm" />
        </Stack>
      </Box>
    );
  }

  const logoUrl = assetUrl(sysInfo, "echo_header_top_left_256x96.png");

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <BrandedHeader isMac={isMac} logoUrl={logoUrl} />

      {/* ── Scrollable content ── */}
      <ScrollArea style={{ flex: 1 }} scrollbarSize={5}>
        <Stack gap={10} p="md">

          {/* Input */}
          <Card delay={0}>
            <Stack gap={14}>
              <Group gap={8}>
                <IconMicrophone size={14} color="var(--accent)" />
                <SectionLabel>Input</SectionLabel>
              </Group>
              <KeybindInput
                label="Push-to-talk hotkey"
                description="Hold to record. Works globally across all windows."
                value={config.hotkey}
                onChange={(v) => patch("hotkey", v)}
              />
              <KeybindInput
                label="Exit shortcut"
                description="Quit Echo from anywhere."
                value={config.exitKey}
                onChange={(v) => patch("exitKey", v)}
              />
            </Stack>
          </Card>

          {/* Model */}
          <Card delay={60}>
            <Stack gap={14}>
              <Group gap={8}>
                <IconBrain size={14} color="var(--accent)" />
                <SectionLabel>Model</SectionLabel>
              </Group>
              <Select
                label="Whisper model size"
                description="Larger = higher accuracy, more RAM, slower first load"
                value={config.modelSize}
                onChange={(v) => v && patch("modelSize", v as Config["modelSize"])}
                data={[
                  { value: "tiny",          label: "Tiny — 75 MB · fastest" },
                  { value: "base",          label: "Base — 142 MB (default)" },
                  { value: "small",         label: "Small — 488 MB · good quality" },
                  { value: "medium",        label: "Medium — 1.5 GB · great quality" },
                  { value: "large-v3-turbo",label: "Large v3 Turbo — 1.6 GB · best" },
                ]}
              />
              <Select
                label="Language"
                description="Auto-detect is recommended unless accuracy is poor"
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
                  { value: "cpu",  label: "CPU — int8, works everywhere" },
                  { value: "cuda", label: "CUDA — NVIDIA GPU", disabled: !sysInfo.hasNvidiaGpu },
                  { value: "mlx",  label: "MLX — Apple Silicon", disabled: !sysInfo.isAppleSilicon },
                ]}
                leftSection={<IconCpu size={14} />}
              />
            </Stack>
          </Card>

          {/* Downloaded Models */}
          {downloadedModels.length > 0 && (
            <Card delay={90}>
              <Stack gap={10}>
                <Group gap={8}>
                  <IconBrain size={14} color="var(--accent)" />
                  <SectionLabel>Downloaded Models</SectionLabel>
                </Group>
                {downloadedModels.map((m) => (
                  <Group key={m} justify="space-between" wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      {MODEL_LABELS[m] ?? m}
                      {m === config?.modelSize && (
                        <Badge ml={6} size="xs" variant="light" color="echo">active</Badge>
                      )}
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size={24}
                      radius="sm"
                      loading={deletingModel === m}
                      disabled={deletingModel !== null}
                      onClick={() => handleDeleteModel(m)}
                      aria-label={`Delete ${m} model`}
                    >
                      <IconTrash size={13} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </Card>
          )}

          {/* Translation */}
          <Card delay={110}>
            <Stack gap={14}>
              <Group gap={8}>
                <IconLanguage size={14} color="var(--accent)" />
                <SectionLabel>Translation</SectionLabel>
              </Group>
              <Select
                label="Translate transcription to"
                description="Automatically translate your transcript into this language via DeepL. Skipped if you're already speaking it."
                value={config.translateTo ?? "off"}
                onChange={(v) => patch("translateTo", v === "off" || !v ? null : v)}
                data={[
                  { value: "off", label: "Off — transcribe only" },
                  { value: "EN", label: "English" },
                  { value: "DE", label: "German" },
                  { value: "FR", label: "French" },
                  { value: "ES", label: "Spanish" },
                  { value: "IT", label: "Italian" },
                  { value: "PT", label: "Portuguese" },
                  { value: "NL", label: "Dutch" },
                  { value: "PL", label: "Polish" },
                  { value: "RU", label: "Russian" },
                  { value: "UK", label: "Ukrainian" },
                  { value: "ZH", label: "Chinese" },
                  { value: "JA", label: "Japanese" },
                  { value: "KO", label: "Korean" },
                  { value: "TR", label: "Turkish" },
                  { value: "SV", label: "Swedish" },
                  { value: "DA", label: "Danish" },
                  { value: "FI", label: "Finnish" },
                  { value: "NB", label: "Norwegian" },
                  { value: "CS", label: "Czech" },
                  { value: "EL", label: "Greek" },
                  { value: "HU", label: "Hungarian" },
                  { value: "RO", label: "Romanian" },
                  { value: "BG", label: "Bulgarian" },
                  { value: "SK", label: "Slovak" },
                  { value: "SL", label: "Slovenian" },
                  { value: "LT", label: "Lithuanian" },
                  { value: "LV", label: "Latvian" },
                  { value: "ET", label: "Estonian" },
                  { value: "ID", label: "Indonesian" },
                ]}
              />

              {config.translateTo && (
                <Alert
                  icon={<IconCloudUpload size={14} />}
                  color="yellow"
                  variant="light"
                  radius="md"
                  p="xs"
                >
                  <Text size="xs">
                    Translation mode sends your transcript to DeepL's servers. Your audio stays
                    local — only the text leaves your machine, and only when the detected
                    language differs from the target.
                  </Text>
                </Alert>
              )}

              <PasswordInput
                label={
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={500}>DeepL API key</Text>
                    <HoverCard width={300} shadow="md" withArrow openDelay={100} closeDelay={200}>
                      <HoverCard.Target>
                        <IconInfoCircle size={13} style={{ cursor: "help", color: "var(--muted)" }} />
                      </HoverCard.Target>
                      <HoverCard.Dropdown>
                        <Text size="xs">
                          Create a free DeepL account, then copy your API key from the
                          "Account" tab. Free keys end in <code>:fx</code> and include
                          500,000 characters/month.
                        </Text>
                        <Anchor
                          href="https://www.deepl.com/your-account/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          size="xs"
                          c="echo.4"
                          mt={6}
                          style={{ display: "inline-block" }}
                        >
                          Open DeepL API keys page →
                        </Anchor>
                      </HoverCard.Dropdown>
                    </HoverCard>
                  </Group>
                }
                description={
                  config.translateTo && !config.deeplApiKey.trim()
                    ? "Required to enable translation."
                    : "Stored locally. Free keys end in :fx."
                }
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                value={config.deeplApiKey}
                onChange={(e) => patch("deeplApiKey", e.currentTarget.value)}
                error={
                  config.translateTo && !config.deeplApiKey.trim()
                    ? "API key required for translation"
                    : undefined
                }
              />
            </Stack>
          </Card>

          {/* Behaviour */}
          <Card delay={120}>
            <Stack gap={14}>
              <Group gap={8}>
                <IconBolt size={14} color="var(--accent)" />
                <SectionLabel>Behaviour</SectionLabel>
              </Group>
              <Switch
                label="Auto-paste transcript"
                description="Paste at cursor immediately after transcription"
                checked={config.autoPaste}
                onChange={(e) => patch("autoPaste", e.currentTarget.checked)}
                color="echo"
              />
              <Switch
                label="Voice activation"
                description="Always listen and transcribe automatically when speech is detected (disables push-to-talk hotkey; mic stays on)"
                checked={config.voiceActivation}
                onChange={(e) => patch("voiceActivation", e.currentTarget.checked)}
                color="echo"
              />
              <Switch
                label="Start at login"
                description="Launch Echo automatically when you log in"
                checked={config.autostart}
                onChange={(e) => patch("autostart", e.currentTarget.checked)}
                color="echo"
              />
            </Stack>
          </Card>

          {/* System info */}
          <Card delay={180}>
            <Stack gap={10}>
              <Group gap={8}>
                <IconInfoCircle size={14} color="var(--accent)" />
                <SectionLabel>System</SectionLabel>
              </Group>
              <Group gap={6} wrap="wrap">
                <Badge variant="outline" color="dark.3" size="sm" radius="sm">
                  {sysInfo.platform}
                </Badge>
                {sysInfo.hasNvidiaGpu && (
                  <Badge variant="light" color="echo" size="sm" radius="sm">
                    NVIDIA GPU
                  </Badge>
                )}
                {sysInfo.isAppleSilicon && (
                  <Badge variant="light" color="echo" size="sm" radius="sm">
                    Apple Silicon
                  </Badge>
                )}
                <Badge variant="outline" color="dark.3" size="sm" radius="sm">
                  v{sysInfo.appVersion}
                </Badge>
              </Group>
            </Stack>
          </Card>

        </Stack>
      </ScrollArea>

      {/* ── Footer ── */}
      <Box
        px="md"
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
          {needsRestart && saved && (
            <Alert
              icon={<IconRefresh size={14} />}
              color="echo"
              variant="light"
              radius="md"
              p="xs"
              withCloseButton={false}
            >
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
          <Group justify="flex-end" gap="sm" align="center">
            {saved && !saving && (
              <Group gap={5} style={{ animation: "fadeUp 0.2s ease-out" }}>
                <IconCheck size={14} color="var(--mantine-color-green-5)" />
                <Text size="sm" c="green.5" fw={500}>Saved</Text>
              </Group>
            )}
            <Button
              onClick={handleSave}
              loading={saving}
              color={saved ? "green" : "echo"}
              radius="md"
              style={{
                transition: "background-color 0.25s, box-shadow 0.25s",
                boxShadow: saved ? "0 0 14px rgba(74,175,80,0.35)" : undefined,
              }}
              leftSection={saving ? undefined : <IconCheck size={14} />}
            >
              {saved ? "Saved" : "Save changes"}
            </Button>
          </Group>
        </Stack>
      </Box>
    </Box>
  );
}
