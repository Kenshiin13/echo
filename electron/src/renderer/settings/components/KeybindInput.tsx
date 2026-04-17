import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Group, Text, UnstyledButton } from "@mantine/core";

interface Props {
  value: string;
  onChange: (val: string) => void;
  label: string;
  description?: string;
}

const MODIFIER_NAMES = new Set(["ctrl", "alt", "shift", "win", "cmd"]);
const MODIFIER_ORDER = ["ctrl", "alt", "shift", "win", "cmd"];

function keyEventToName(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === "Control") return "ctrl";
  if (k === "Alt") return "alt";
  if (k === "Shift") return "shift";
  if (k === "Meta") return "win";
  if (k === " " || k === "Spacebar") return "space";
  if (k === "Escape") return "escape";
  if (k === "Insert") return "insert";
  if (k === "Delete") return "delete";
  if (k === "Home") return "home";
  if (k === "End") return "end";
  if (k === "PageUp") return "page_up";
  if (k === "PageDown") return "page_down";
  if (k === "CapsLock") return "caps_lock";
  if (k === "ScrollLock") return "scroll_lock";
  if (k === "Pause") return "pause";
  if (k === "NumLock") return "num_lock";
  if (/^F\d+$/.test(k)) return k.toLowerCase();
  if (k.length === 1) return k.toLowerCase();
  return null;
}

function keyDisplay(k: string): string {
  const MAP: Record<string, string> = {
    ctrl: "Ctrl", alt: "Alt", shift: "Shift", win: "Win", cmd: "⌘",
    space: "Space", delete: "Del", insert: "Ins",
    page_up: "PgUp", page_down: "PgDn",
    caps_lock: "Caps", scroll_lock: "ScrLk",
    num_lock: "NumLk", pause: "Pause",
    home: "Home", end: "End",
    escape: "Esc",
  };
  if (k in MAP) return MAP[k];
  if (/^f\d+$/.test(k)) return k.toUpperCase();
  return k.toUpperCase();
}

function parseCombo(value: string): string[] {
  return value.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
}

function KeyChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        background: active ? "rgba(63,168,224,0.12)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${active ? "rgba(63,168,224,0.4)" : "var(--border)"}`,
        borderBottom: `2px solid ${active ? "rgba(63,168,224,0.6)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        color: active ? "var(--accent)" : "var(--text)",
        fontFamily: "'Menlo', 'Consolas', monospace",
        letterSpacing: "0.03em",
        transition: "all 0.12s ease",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
}

export function KeybindInput({ value, onChange, label, description }: Props) {
  const [recording, setRecording] = useState(false);
  const [liveKeys, setLiveKeys] = useState<string[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const parts = parseCombo(value);

  const startRecording = useCallback(() => {
    setRecording(true);
    setLiveKeys([]);
    buttonRef.current?.focus();
  }, []);

  const commit = useCallback(
    (keys: string[]) => {
      const mods = MODIFIER_ORDER.filter((m) => keys.includes(m));
      const main = keys.find((k) => !MODIFIER_NAMES.has(k));
      if (!main) return; // only modifiers held — wait
      onChange([...mods, main].join("+"));
      setRecording(false);
      setLiveKeys([]);
    },
    [onChange],
  );

  useEffect(() => {
    if (!recording) return;

    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setLiveKeys([]);
        return;
      }
      const name = keyEventToName(e);
      if (!name) return;
      setLiveKeys((prev) => (prev.includes(name) ? prev : [...prev, name]));
    };

    const onUp = (e: KeyboardEvent) => {
      e.preventDefault();
      const name = keyEventToName(e);
      if (!name) return;
      if (!MODIFIER_NAMES.has(name)) {
        // Non-modifier released — commit whatever is held plus this key
        setLiveKeys((prev) => {
          const full = prev.includes(name) ? prev : [...prev, name];
          commit(full);
          return [];
        });
      } else {
        setLiveKeys((prev) => prev.filter((k) => k !== name));
      }
    };

    window.addEventListener("keydown", onDown, { capture: true });
    window.addEventListener("keyup", onUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onDown, { capture: true });
      window.removeEventListener("keyup", onUp, { capture: true });
    };
  }, [recording, commit]);

  const displayParts = recording && liveKeys.length > 0 ? liveKeys : parts;

  return (
    <Box>
      <Text size="sm" fw={500} c="var(--text)" mb={4} style={{ letterSpacing: "0.01em" }}>
        {label}
      </Text>
      {description && (
        <Text size="xs" c="var(--muted)" mb={8} lh={1.5}>
          {description}
        </Text>
      )}

      <UnstyledButton
        ref={buttonRef as React.Ref<HTMLButtonElement>}
        tabIndex={0}
        onClick={startRecording}
        onBlur={() => recording && setRecording(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "0 12px",
          background: recording
            ? "rgba(63,168,224,0.06)"
            : "rgba(255,255,255,0.03)",
          border: `1px solid ${recording ? "rgba(63,168,224,0.45)" : "var(--border)"}`,
          borderRadius: 8,
          cursor: "pointer",
          height: 40,
          width: "100%",
          outline: "none",
          transition: "border-color 0.15s, background 0.15s",
          boxShadow: recording ? "0 0 0 3px rgba(63,168,224,0.08)" : "none",
        }}
      >
        <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {recording && liveKeys.length === 0 ? (
            <Text size="xs" c="echo.5" style={{ letterSpacing: "0.04em", opacity: 0.9 }}>
              Press keys…
            </Text>
          ) : displayParts.length === 0 ? (
            <Text size="xs" c="var(--muted)">Click to set</Text>
          ) : (
            displayParts.map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 && (
                  <Text size="xs" c="var(--muted)" style={{ lineHeight: 1, opacity: 0.6 }}>
                    +
                  </Text>
                )}
                <KeyChip label={keyDisplay(k)} active={recording} />
              </React.Fragment>
            ))
          )}
        </Group>

        {recording ? (
          <Text size="xs" c="dimmed" style={{ opacity: 0.5, flexShrink: 0, fontSize: 10 }}>
            Esc to cancel
          </Text>
        ) : (
          <Text size="xs" c="dimmed" style={{ opacity: 0.35, flexShrink: 0, fontSize: 10 }}>
            Click to change
          </Text>
        )}
      </UnstyledButton>
    </Box>
  );
}
