import { test } from "node:test";
import assert from "node:assert/strict";
import { mixPcm } from "./mix.mjs";

const SR = 24000;

test("mixPcm: cue を開始サンプルに配置し、他は無音", () => {
  const a = new Int16Array(Math.round(0.5 * SR)).fill(1000);
  const b = new Int16Array(Math.round(0.5 * SR)).fill(-2000);
  const timeline = {
    sampleRate: SR,
    totalSec: 3.0,
    cues: [
      { startSec: 0.5, endSec: 1.0 },
      { startSec: 2.0, endSec: 2.5 },
    ],
  };
  const out = mixPcm(timeline, [a, b]);
  assert.equal(out.length, Math.round(3.0 * SR));
  assert.equal(out[0], 0); // 冒頭は無音
  assert.equal(out[Math.round(0.5 * SR)], 1000); // a の先頭
  assert.equal(out[Math.round(1.0 * SR)], 0); // a の直後は無音
  assert.equal(out[Math.round(2.0 * SR)], -2000); // b の先頭
  assert.equal(out[out.length - 1], 0); // 末尾 (TAIL) は無音
});

test("mixPcm: 数が合わなければ throw", () => {
  assert.throws(() => mixPcm({ sampleRate: SR, totalSec: 1, cues: [{ startSec: 0 }] }, []), /pcm/);
});
