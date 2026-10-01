// pi-gemini-multimodal — Pi extension.
//
// Multimodal perception for Pi (the harness model is text-only): delegate
// seeing/hearing to Gemini. Two providers:
//   - gemini_api      : direct Gemini REST, needs an API key from
//                       aistudio.google.com (AIza... or AQ. keys both work)
//   - antigravity_cli : local `agy` CLI on PATH (Google account sign-in)
//
// Config file: ~/.pi/agent/extensions/pi-gemini-multimodal/config.json
//   { "provider": "gemini_api", "apiKey": "...", "outputDir": "/path" }
//
// Tools: media_understand / media_transcribe / image_generate / read_document

import { detectSupportedImageMimeTypeFromFile, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawn } from "node:child_process";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "extensions", "pi-gemini-multimodal", "config.json");

interface AppConfig {
  provider?: "gemini_api" | "antigravity_cli";
  apiKey?: string;
  outputDir?: string;
  skipPermissions?: boolean;
}

function loadConfig(): AppConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

const config: AppConfig = loadConfig();
const PROVIDER = config.provider ?? "antigravity_cli"; // zero-config: local agy, no key
const API_KEY = config.apiKey ?? "";
const OUTPUT_DIR = config.outputDir ?? join(tmpdir(), "pi-gemini-multimodal");
const SKIP_PERMISSIONS = config.skipPermissions !== false;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const TIMEOUT_MS = 120_000;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", flac: "audio/flac",
  ogg: "audio/ogg", opus: "audio/opus", pdf: "application/pdf",
};

export function guessMime(pathOrUrl: string): string {
  const clean = pathOrUrl.split("?")[0];
  return MIME_BY_EXT[extname(clean).slice(1).toLowerCase()] ?? "application/octet-stream";
}

// Sniff local files by content instead of trusting the extension; the helper only
// resolves image types, so everything else (video/audio/pdf/URLs) keeps the ext map.
export async function detectMime(source: string): Promise<string> {
  if (!/^https?:\/\//i.test(source)) {
    const detected = await detectSupportedImageMimeTypeFromFile(source).catch(() => null);
    if (detected) return detected;
  }
  return guessMime(source);
}

async function loadBytes(source: string, signal?: AbortSignal): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { signal });
    if (!res.ok) throw new Error(`failed to download ${source}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(readFileSync(source));
}

async function geminiCall(parts: unknown[], model: string, signal?: AbortSignal): Promise<{ text: string; image?: Uint8Array }> {
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({ contents: [{ parts }] }),
    signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const msg = detail.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? detail;
    const hint = res.status === 429 ? " (quota — image gen free tier is low)" : "";
    throw new Error(`Gemini HTTP ${res.status}: ${msg}${hint}`);
  }
  const data = await res.json();
  const parts0 = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts0.map((p: { text?: string }) => p.text ?? "").join("");
  const inline = parts0.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  return { text, image: inline?.inlineData?.data ? Uint8Array.from(Buffer.from(inline.inlineData.data, "base64")) : undefined };
}

function geminiUnderstand(source: string, question: string, signal?: AbortSignal): Promise<string> {
  return loadBytes(source, signal).then(async (bytes) => {
    const { text } = await geminiCall(
      [
        { inlineData: { mimeType: await detectMime(source), data: Buffer.from(bytes).toString("base64") } },
        { text: question || "Describe this media in detail." },
      ],
      DEFAULT_MODEL,
      signal,
    );
    return text;
  });
}

function geminiTranscribe(source: string, signal?: AbortSignal): Promise<string> {
  return loadBytes(source, signal).then(async (bytes) => {
    const { text } = await geminiCall(
      [
        { inlineData: { mimeType: await detectMime(source), data: Buffer.from(bytes).toString("base64") } },
        { text: "Transcribe this audio/video to text verbatim, with timestamps where useful." },
      ],
      DEFAULT_MODEL,
      signal,
    );
    return text;
  });
}

function geminiReadDocument(path: string, question: string, signal?: AbortSignal): Promise<string> {
  return loadBytes(path, signal).then(async (bytes) => {
    const { text } = await geminiCall(
      [
        { inlineData: { mimeType: await detectMime(path), data: Buffer.from(bytes).toString("base64") } },
        { text: question || "Summarize this document: main points and anything actionable." },
      ],
      DEFAULT_MODEL,
      signal,
    );
    return text;
  });
}

async function geminiGenerateImage(prompt: string, signal?: AbortSignal): Promise<string> {
  const { image } = await geminiCall([{ text: prompt }], IMAGE_MODEL, signal);
  if (!image) throw new Error("no image returned by the model");
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = join(OUTPUT_DIR, `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  writeFileSync(file, image);
  return file;
}

// --- antigravity_cli ---

function runAgy(prompt: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt];
    if (SKIP_PERMISSIONS) args.push("--dangerously-skip-permissions");
    const child = spawn("agy", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS + 30_000);
    const done = (fn: () => void) => { clearTimeout(timer); fn(); };
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (err += String(d)));
    child.on("error", () => done(() => reject(new Error("agy not found on PATH. Install: curl -fsSL https://antigravity.google/cli/install.sh | bash, then run `agy` once and sign in. Or set provider: gemini_api + apiKey (aistudio.google.com)."))));
    child.on("close", (code) => done(() => {
      const text = out.trim();
      if (!text) reject(new Error(err.trim() || `agy exited with code ${code}`));
      else resolve(text);
    }));
  });
}

function agyUnderstand(source: string, question: string): Promise<string> {
  return runAgy(`Analyze this media (${source}) and answer: ${question || "describe its content in detail."}`);
}

function agyTranscribe(source: string): Promise<string> {
  return runAgy(`Transcribe this media file (${source}) to text verbatim, with timestamps where useful.`);
}

function agyReadDocument(path: string, question: string): Promise<string> {
  return runAgy(`Read the document at ${path} and ${question ? `answer: ${question}` : "summarize its main points."}`);
}

async function agyGenerateImage(prompt: string): Promise<string> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const text = await runAgy(`Generate an image of: ${prompt}. Save it as a PNG inside ${OUTPUT_DIR} and reply with the full saved file path only.`);
  const m = text.match(/([\w./~-]+\.png)/i);
  if (!m) throw new Error(`could not determine saved image path from agy output: ${text.slice(0, 200)}`);
  return m[1];
}

// --- dispatch ---

function dispatch(action: string, arg: { source?: string; question?: string; prompt?: string }, signal?: AbortSignal): Promise<string> {
  if (PROVIDER === "gemini_api") {
    if (!API_KEY) throw new Error("provider gemini_api needs apiKey - get one at aistudio.google.com, or switch to antigravity_cli (local agy, no key).");
    switch (action) {
      case "understand": return geminiUnderstand(arg.source!, arg.question ?? "", signal);
      case "transcribe": return geminiTranscribe(arg.source!, signal);
      case "read_document": return geminiReadDocument(arg.source!, arg.question ?? "", signal);
      case "image_generate": return geminiGenerateImage(arg.prompt!, signal);
    }
  }
  switch (action) {
    case "understand": return agyUnderstand(arg.source!, arg.question ?? "");
    case "transcribe": return agyTranscribe(arg.source!);
    case "read_document": return agyReadDocument(arg.source!, arg.question ?? "");
    case "image_generate": return agyGenerateImage(arg.prompt!);
  }
  throw new Error(`unknown action: ${action}`);
}

// --- tool registration ---

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "media_understand",
    label: "Media Understand",
    description:
      "Understand an image/audio/video/URL via Gemini (OCR, charts, UI, spoken words). Returns text analysis.",
    promptGuidelines: ["Use when the task needs to see an image, listen to audio, or watch a video."],
    parameters: Type.Object({ source: Type.String(), question: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "👁 Analyzing..." }], details: { phase: "analyzing" } });
      try {
        const text = await dispatch("understand", params, signal);
        return { content: [{ type: "text", text }], details: { ok: true, text } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], details: { error: msg } };
      }
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("👁 Media")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const d = result.details as { error?: string } | undefined;
      if (d?.error) return new Text(theme.fg("error", "❌ failed"), 0, 0);
      return new Text(theme.fg("success", "✓ analyzed"), 0, 0);
    },
  });

  pi.registerTool({
    name: "media_transcribe",
    label: "Media Transcribe",
    description: "Transcribe audio/video to verbatim text with timestamps where useful.",
    promptGuidelines: ["Use when the task needs the spoken words of an audio or video file."],
    parameters: Type.Object({ source: Type.String() }),
    async execute(_toolCallId, params, signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "🎧 Transcribing..." }], details: { phase: "transcribing" } });
      try {
        const text = await dispatch("transcribe", params, signal);
        return { content: [{ type: "text", text }], details: { ok: true, text } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], details: { error: msg } };
      }
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("🎧 Media")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const d = result.details as { error?: string } | undefined;
      if (d?.error) return new Text(theme.fg("error", "❌ failed"), 0, 0);
      return new Text(theme.fg("success", "✓ transcribed"), 0, 0);
    },
  });

  pi.registerTool({
    name: "image_generate",
    label: "Image Generate",
    description:
      "Generate an image from a text prompt via Gemini; saves a PNG locally and returns the path. Free-tier image quota is low (429s common).",
    promptGuidelines: ["Use when the task needs to create an image."],
    parameters: Type.Object({ prompt: Type.String() }),
    async execute(_toolCallId, params, signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "🎨 Generating..." }], details: { phase: "generating" } });
      try {
        const path = await dispatch("image_generate", params, signal);
        return { content: [{ type: "text", text: `Image saved to ${path}` }], details: { ok: true, text: path } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], details: { error: msg } };
      }
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("🎨 Image")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const d = result.details as { error?: string } | undefined;
      if (d?.error) return new Text(theme.fg("error", "❌ failed"), 0, 0);
      return new Text(theme.fg("success", "✓ image saved"), 0, 0);
    },
  });

  pi.registerTool({
    name: "read_document",
    label: "Read Document",
    description: "Summarize or answer questions about a PDF/Office/text document via Gemini.",
    promptGuidelines: ["Use when the task needs to read a PDF or document file."],
    parameters: Type.Object({ source: Type.String(), question: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "📄 Reading..." }], details: { phase: "reading" } });
      try {
        const text = await dispatch("read_document", params, signal);
        return { content: [{ type: "text", text }], details: { ok: true, text } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], details: { error: msg } };
      }
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("📄 Doc")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const d = result.details as { error?: string } | undefined;
      if (d?.error) return new Text(theme.fg("error", "❌ failed"), 0, 0);
      return new Text(theme.fg("success", "✓ read"), 0, 0);
    },
  });
}
