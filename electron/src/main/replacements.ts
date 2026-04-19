import type { Replacement } from "../shared/types";

/**
 * Apply user-configured find/replace rules to a transcript. Case-insensitive,
 * applied sequentially so later rules can match the output of earlier ones.
 * In the replacement string, `\n`, `\t`, and `\\` are interpreted as escapes
 * so users can insert newlines from a single-line input field.
 */
export function applyReplacements(text: string, rules: Replacement[]): string {
  if (!text || !rules || rules.length === 0) return text;
  let out = text;
  for (const rule of rules) {
    if (!rule?.from) continue;
    const replacement = unescape(rule.to ?? "");
    const re = new RegExp(escapeRegExp(rule.from), "gi");
    out = out.replace(re, replacement);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
}
