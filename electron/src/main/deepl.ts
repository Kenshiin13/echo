import { log } from "./logger";

// DeepL target language codes. Most are ISO 639-1; a few are regional variants
// (e.g. EN-US, PT-BR). For auto-translation we only need the "base" target,
// but the UI can expose regional variants too if we want them later.
export const DEEPL_TARGETS = [
  "BG", "CS", "DA", "DE", "EL", "EN", "ES", "ET", "FI", "FR", "HU", "ID", "IT",
  "JA", "KO", "LT", "LV", "NB", "NL", "PL", "PT", "RO", "RU", "SK", "SL", "SV",
  "TR", "UK", "ZH",
] as const;

export type DeepLTarget = (typeof DEEPL_TARGETS)[number];

interface DeepLResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

/**
 * Translates `text` via DeepL. Returns the original text on any failure so the
 * paste pipeline never loses the user's words.
 * Keys ending in ":fx" hit the free endpoint; everything else hits pro.
 */
export async function translateViaDeepL(
  text: string,
  target: string,
  apiKey: string,
): Promise<string> {
  if (!text.trim() || !apiKey.trim()) return text;

  const isFree = apiKey.trim().endsWith(":fx");
  const host = isFree ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const url = `${host}/v2/translate`;

  try {
    const body = new URLSearchParams();
    body.append("text", text);
    body.append("target_lang", target.toUpperCase());

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey.trim()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.error(`DeepL HTTP ${res.status}: ${detail.slice(0, 200)}`);
      return text;
    }

    const json = (await res.json()) as DeepLResponse;
    const out = json.translations?.[0]?.text;
    if (!out) {
      log.error("DeepL returned empty translations array");
      return text;
    }
    return out;
  } catch (err) {
    log.error(`DeepL request failed: ${err}`);
    return text;
  }
}
