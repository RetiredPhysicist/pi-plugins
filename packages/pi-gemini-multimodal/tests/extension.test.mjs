// Unit tests for pi-gemini-multimodal helpers (no network, no real agy).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guessMime, detectMime } from '../extensions/index.ts'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('guessMime', () => {
  it('maps common extensions', () => {
    assert.equal(guessMime('a.png'), 'image/png')
    assert.equal(guessMime('clip.mp4'), 'video/mp4')
    assert.equal(guessMime('voice.m4a'), 'audio/mp4')
    assert.equal(guessMime('doc.pdf'), 'application/pdf')
    assert.equal(guessMime('https://x.com/a.webp?q=1'), 'image/webp')
  })

  it('falls back to octet-stream', () => {
    assert.equal(guessMime('noext'), 'application/octet-stream')
  })
})

describe('detectMime', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-gemini-'))

  it('sniffs content over a wrong extension', async () => {
    const file = join(dir, 'notes.txt')
    writeFileSync(file, PNG)
    assert.equal(await detectMime(file), 'image/png')
  })

  it('sniffs extensionless image files', async () => {
    const file = join(dir, 'screenshot')
    writeFileSync(file, PNG)
    assert.equal(await detectMime(file), 'image/png')
  })

  it('falls back to the extension map for non-images', async () => {
    const file = join(dir, 'clip.mp4')
    writeFileSync(file, Buffer.from('not really a video'))
    assert.equal(await detectMime(file), 'video/mp4')
  })

  it('falls back to the extension map when the file is missing', async () => {
    assert.equal(await detectMime(join(dir, 'gone.png')), 'image/png')
  })

  it('keeps guessing by extension for URLs', async () => {
    assert.equal(await detectMime('https://x.com/a.webp?q=1'), 'image/webp')
  })
})
