import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWav, buildWav, silenceSamples } from "./wav.mjs";

const SR = 24000;

function sine(sec, sr) {
  const n = Math.round(sec * sr);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 12000);
  }
  return pcm;
}

test("buildWav → parseWav で往復できる", () => {
  const pcm = sine(0.5, SR);
  const buf = buildWav(pcm, SR);
  const parsed = parseWav(buf);
  assert.equal(parsed.sampleRate, SR);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.bitsPerSample, 16);
  assert.equal(parsed.pcm.length, pcm.length);
  assert.ok(Math.abs(parsed.durationSec - 0.5) < 1e-6);
  assert.deepEqual([...parsed.pcm.slice(0, 10)], [...pcm.slice(0, 10)]);
});

test("data の前に未知チャンク (LIST) があっても parse できる", () => {
  const pcm = sine(0.1, SR);
  const clean = buildWav(pcm, SR);
  // fmt チャンク直後 (offset 36) に 10 byte の LIST チャンクを差し込む
  const listBody = Buffer.from("INFOxx", "ascii");
  const list = Buffer.concat([
    Buffer.from("LIST", "ascii"),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(listBody.length, 0);
      return b;
    })(),
    listBody,
  ]);
  const injected = Buffer.concat([clean.subarray(0, 36), list, clean.subarray(36)]);
  injected.writeUInt32LE(injected.length - 8, 4); // RIFF サイズを直す
  const parsed = parseWav(injected);
  assert.equal(parsed.pcm.length, pcm.length);
});

test("mono 16bit 以外は throw する", () => {
  const pcm = sine(0.1, SR);
  const buf = buildWav(pcm, SR);
  buf.writeUInt16LE(2, 22); // channels = 2 に書き換え
  assert.throws(() => parseWav(buf), /mono/);
});

test("silenceSamples は秒→サンプル数 (round)", () => {
  assert.equal(silenceSamples(0.5, SR), 12000);
  assert.equal(silenceSamples(0.0001, SR), 2); // 2.4 → 2
});
