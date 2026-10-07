# pi-gemini-multimodal

Multimodal perception for **Pi**: image / audio / video / document understanding, transcription, and image generation — delegated to **Gemini**.

[English](README.md) · [中文](README.zh.md)

## Two providers (pick one)

| provider | needs | when |
|---|---|---|
| `gemini_api` | Gemini API key from **aistudio.google.com** (`AIza...` / `AQ.`) | default; direct REST, fast |
| `antigravity_cli` | local [`agy`](https://antigravity.google) CLI, signed in | no key to manage |

## Install

```sh
pi pkg install pi-gemini-multimodal
```

Create `~/.pi/agent/extensions/pi-gemini-multimodal/config.json`:

```json
{
  "provider": "gemini_api",
  "apiKey": "<your gemini key>",
  "outputDir": "/path/for/images"
}
```

**Key:** `aistudio.google.com` → sign in → **Get API key** → Create API key. Free tier: understanding is generous, image generation is rate-limited (429s possible).

## Tools

| tool | does |
|---|---|
| `media_understand` | analyze image/audio/video/URL (OCR, charts, UI, speech) |
| `media_transcribe` | audio/video → verbatim text with timestamps |
| `image_generate` | prompt → PNG saved to outputDir (low free-tier quota) |
| `read_document` | summarize / answer over PDF, Office, text |

## Security (antigravity_cli)

Headless `agy -p` cannot prompt, so the plugin passes `--dangerously-skip-permissions` by default. Set `"skipPermissions": false` and add allow-rules in `~/.gemini/antigravity-cli/settings.json` to tighten. Prefer `gemini_api` for a narrower trust boundary.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT

## Changelog

- **0.1.1** — bump for CI publish validation; zero-config default provider (antigravity_cli).
- **0.1.0** — initial release: dual providers, 4 multimodal tools.
