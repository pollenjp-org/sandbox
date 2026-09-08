import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, LEAD_IN, GAP, SCENE_GAP, TAIL, SCENE_LEAD } from "./timeline.mjs";

// audio_query の必要部分だけの合成データ
function q(prePhonemeLength, accentPhrases) {
  return { prePhonemeLength, postPhonemeLength: 0.1, accent_phrases: accentPhrases };
}

const EPS = 1e-9;
const near = (a, b) => Math.abs(a - b) < 1e-6;

test("mouth: モーラから母音区間を作り、N/pau は捨てる", () => {
  const script = {
    title: "t",
    scenes: [{ id: "a", cues: [{ speaker: "zunda", text: "ぱん" }] }],
  };
  const query = q(0.1, [
    {
      moras: [
        { consonant_length: 0.05, vowel: "a", vowel_length: 0.15 },
        { consonant_length: null, vowel: "N", vowel_length: 0.1 },
      ],
      pause_mora: { vowel: "pau", vowel_length: 0.2 },
    },
  ]);
  const tl = buildTimeline(script, [{ wavSec: 1.0, query }]);
  const c = tl.cues[0];
  assert.ok(near(c.startSec, LEAD_IN));
  assert.equal(c.mouth.length, 1);
  const [s, e, v] = c.mouth[0];
  assert.ok(near(s, LEAD_IN + 0.1), `s=${s}`);
  assert.ok(near(e, LEAD_IN + 0.3), `e=${e}`);
  assert.equal(v, "a");
});

test("mouth: 無声化母音 (大文字) は小文字に寄せ、pause_mora の後も積算が合う", () => {
  const script = { title: "t", scenes: [{ id: "a", cues: [{ speaker: "metan", text: "です" }] }] };
  const query = q(0.0, [
    { moras: [{ consonant_length: 0.1, vowel: "U", vowel_length: 0.1 }], pause_mora: { vowel: "pau", vowel_length: 0.3 } },
    { moras: [{ consonant_length: null, vowel: "o", vowel_length: 0.2 }], pause_mora: null },
  ]);
  const tl = buildTimeline(script, [{ wavSec: 1.0, query }]);
  const m = tl.cues[0].mouth;
  assert.equal(m.length, 2);
  assert.equal(m[0][2], "u");
  // 2 モーラ目は 0.2 (モーラ1) + 0.3 (pau) の後
  assert.ok(near(m[1][0], LEAD_IN + 0.5), `got ${m[1][0]}`);
  assert.equal(m[1][2], "o");
});

test("mouth: speedScale はモーラ長にも前後無音にも 1/s で効く", () => {
  const script = { title: "t", scenes: [{ id: "a", cues: [{ speaker: "zunda", text: "ぱ" }] }] };
  const query = {
    ...q(0.1, [{ moras: [{ consonant_length: 0.05, vowel: "a", vowel_length: 0.15 }], pause_mora: null }]),
    speedScale: 2,
  };
  const tl = buildTimeline(script, [{ wavSec: 1.0, query }]);
  const [s, e] = tl.cues[0].mouth[0];
  assert.ok(near(s, LEAD_IN + 0.05), `s=${s}`);
  assert.ok(near(e, LEAD_IN + 0.15), `e=${e}`);
});

test("cue の配置: GAP / SCENE_GAP / pauseAfter / TAIL / scene 境界", () => {
  const script = {
    title: "t",
    scenes: [
      { id: "a", cues: [
        { speaker: "zunda", text: "1", pauseAfter: 0.6 },
        { speaker: "metan", text: "2" },
      ] },
      { id: "b", cues: [{ speaker: "zunda", text: "3", step: "s1" }] },
    ],
  };
  const empty = q(0, []);
  const tl = buildTimeline(script, [
    { wavSec: 1.0, query: empty },
    { wavSec: 2.0, query: empty },
    { wavSec: 0.5, query: empty },
  ]);
  const [c0, c1, c2] = tl.cues;
  assert.ok(near(c0.startSec, LEAD_IN));
  assert.ok(near(c0.endSec, LEAD_IN + 1.0));
  assert.ok(near(c1.startSec, c0.endSec + GAP + 0.6)); // pauseAfter が乗る
  assert.ok(near(c2.startSec, c1.endSec + SCENE_GAP));
  assert.ok(near(tl.totalSec, c2.endSec + TAIL));
  assert.equal(c2.step, "s1");
  assert.equal(c2.scene, "b");
  // scene 境界
  assert.equal(tl.scenes.length, 2);
  assert.ok(near(tl.scenes[0].startSec, 0));
  assert.ok(near(tl.scenes[1].startSec, c2.startSec - SCENE_LEAD));
  assert.ok(near(tl.scenes[0].endSec, tl.scenes[1].startSec));
  assert.ok(near(tl.scenes[1].endSec, tl.totalSec));
});

test("caption 省略時は text を使う", () => {
  const script = { title: "t", scenes: [{ id: "a", cues: [{ speaker: "zunda", text: "こんにちは", caption: "字幕" }, { speaker: "metan", text: "やあ" }] }] };
  const empty = q(0, []);
  const tl = buildTimeline(script, [{ wavSec: 1, query: empty }, { wavSec: 1, query: empty }]);
  assert.equal(tl.cues[0].caption, "字幕");
  assert.equal(tl.cues[1].caption, "やあ");
});

test("バリデーション: 不正 speaker / 空 text / cueData 長さ不一致は throw", () => {
  const empty = q(0, []);
  assert.throws(
    () => buildTimeline({ title: "t", scenes: [{ id: "a", cues: [{ speaker: "dareka", text: "x" }] }] }, [{ wavSec: 1, query: empty }]),
    /speaker/,
  );
  assert.throws(
    () => buildTimeline({ title: "t", scenes: [{ id: "a", cues: [{ speaker: "zunda", text: "" }] }] }, [{ wavSec: 1, query: empty }]),
    /text/,
  );
  assert.throws(
    () => buildTimeline({ title: "t", scenes: [{ id: "a", cues: [{ speaker: "zunda", text: "x" }] }] }, []),
    /cueData/,
  );
});
