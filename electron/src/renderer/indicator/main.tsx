import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { IndicatorState } from "@shared/types";
import "./indicator.css";

const LABELS: Record<IndicatorState, string> = {
  idle: "",
  recording: "Recording",
  transcribing: "Transcribing",
  done: "Done",
  error: "Error",
  downloading: "Downloading",
};

const COLORS: Record<IndicatorState, string> = {
  idle: "transparent",
  recording: "#E05555",
  transcribing: "#3FA8E0",
  done: "#4CAF50",
  error: "#E07755",
  downloading: "#A855F7",
};

// Per-bar multipliers so the waveform looks organic rather than uniform
const BAR_SCALES = [0.7, 1.1, 1.4, 1.1, 0.7];

function Indicator() {
  const [state, setState] = useState<IndicatorState>("idle");
  const [visible, setVisible] = useState(false);
  const [level, setLevel] = useState(0);
  const [downloadPct, setDownloadPct] = useState(0);

  useEffect(() => {
    const unsub = window.echo.onIndicatorState((s) => {
      setState(s);
      setVisible(s !== "idle");
      if (s !== "recording") setLevel(0);
      if (s !== "downloading") setDownloadPct(0);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.echo.onAudioLevel((rms) => {
      setLevel(rms);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.echo.onDownloadProgress((pct) => {
      setDownloadPct(pct);
    });
    return unsub;
  }, []);

  if (!visible) return null;

  const color = COLORS[state];
  const label = state === "downloading"
    ? `Model ${downloadPct}%`
    : LABELS[state];

  return (
    <div
      className="indicator"
      style={{ "--accent": color } as React.CSSProperties}
    >
      {state === "recording" ? (
        <div className="indicator-wave">
          {BAR_SCALES.map((scale, i) => {
            const h = Math.min(95, 10 + Math.sqrt(level) * scale * 420);
            return <span key={i} style={{ height: `${h}%` }} />;
          })}
        </div>
      ) : state === "transcribing" ? (
        <div className="indicator-dots">
          <span /><span /><span />
        </div>
      ) : state === "downloading" ? (
        <div className="indicator-progress">
          <div className="indicator-progress-fill" style={{ width: `${downloadPct}%` }} />
        </div>
      ) : (
        <span className="indicator-dot" />
      )}

      <span className="indicator-label">{label}</span>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Indicator />);
