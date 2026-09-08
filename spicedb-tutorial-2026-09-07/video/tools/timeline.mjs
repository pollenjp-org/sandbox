// 台本 (script.json) と合成結果 (wav 長 + audio_query) から、
// 映像・音声・口パクの共通タイムラインを作る。
// mix.mjs (音声配置) と page/ (描画) と render.mjs (フレーム数) は
// すべてこの出力 (build/timeline.json / timeline.js) だけを見る。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseWav } from "./wav.mjs";

// タイミング定数 (秒)。変えたら docs/superpowers/plans の値も直すこと。
export const LEAD_IN = 0.6; // 冒頭の無音
export const GAP = 0.35; // セリフ間
export const SCENE_GAP = 1.0; // シーンを跨ぐセリフ間
export const TAIL = 3.0; // 最終セリフ後のホールド
export const SCENE_LEAD = 0.5; // シーン開始はセリフより少し先行して切り替わる
export const FPS = 30;

// speaker キー → VOICEVOX の話者/スタイル名 (id は起動時に /speakers から解決)
export const SPEAKERS = {
  zunda: { vvSpeaker: "ずんだもん", vvStyle: "ノーマル" },
  metan: { vvSpeaker: "四国めたん", vvStyle: "ノーマル" },
};

/** script.json の構造チェック。synth と CLI の両方が使う */
export function validateScript(script) {
  if (!script || !Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("script.scenes が空");
  }
  const ids = new Set();
  for (const scene of script.scenes) {
    if (!scene.id || ids.has(scene.id)) throw new Error(`scene.id が空か重複: ${scene.id}`);
    ids.add(scene.id);
    if (!Array.isArray(scene.cues) || scene.cues.length === 0) {
      throw new Error(`scene ${scene.id} の cues が空`);
    }
    for (const cue of scene.cues) {
      if (!(cue.speaker in SPEAKERS)) throw new Error(`未知の speaker: ${cue.speaker} (scene ${scene.id})`);
      if (!cue.text) throw new Error(`text が空 (scene ${scene.id})`);
    }
  }
}

/** scenes[].cues[] を通し順に並べる */
export function flattenCues(script) {
  return script.scenes.flatMap((scene) => scene.cues.map((cue) => ({ scene: scene.id, ...cue })));
}

// audio_query のモーラ列 → [開始オフセット, 終了オフセット, 母音] の列。
// 母音 a/i/u/e/o だけ口を開け、N (ん)・cl (っ)・pau は閉じたままにする。
// speedScale はモーラ長にも前後無音にも 1/s で効く (synth.mjs で実測)。
function mouthFromQuery(query) {
  const s = query.speedScale ?? 1;
  const out = [];
  let t = (query.prePhonemeLength ?? 0) / s;
  for (const phrase of query.accent_phrases ?? []) {
    for (const mora of phrase.moras ?? []) {
      const len = ((mora.consonant_length ?? 0) + (mora.vowel_length ?? 0)) / s;
      const v = String(mora.vowel ?? "").toLowerCase();
      if (["a", "i", "u", "e", "o"].includes(v)) out.push([t, t + len, v]);
      t += len;
    }
    if (phrase.pause_mora) {
      t += ((phrase.pause_mora.consonant_length ?? 0) + (phrase.pause_mora.vowel_length ?? 0)) / s;
    }
  }
  return out;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * @param {object} script script.json の中身
 * @param {{wavSec:number, query:object}[]} cueData flattenCues と同順
 */
export function buildTimeline(script, cueData) {
  validateScript(script);
  const flat = flattenCues(script);
  if (flat.length !== cueData.length) {
    throw new Error(`cueData の長さ (${cueData.length}) が cue 数 (${flat.length}) と合わない`);
  }
  const cues = [];
  let t = LEAD_IN;
  let prevScene = flat[0].scene;
  flat.forEach((cue, i) => {
    if (i > 0) t += cue.scene === prevScene ? GAP : SCENE_GAP;
    const start = t;
    const end = start + cueData[i].wavSec;
    cues.push({
      i,
      scene: cue.scene,
      speaker: cue.speaker,
      caption: cue.caption ?? cue.text,
      step: cue.step ?? null,
      startSec: r3(start),
      endSec: r3(end),
      mouth: mouthFromQuery(cueData[i].query).map(([s, e, v]) => [r3(start + s), r3(start + e), v]),
    });
    t = end + (cue.pauseAfter ?? 0);
    prevScene = cue.scene;
  });
  const totalSec = r3(t + TAIL);

  const scenes = script.scenes.map((scene, si) => {
    const first = cues.find((c) => c.scene === scene.id);
    return { id: scene.id, startSec: si === 0 ? 0 : r3(first.startSec - SCENE_LEAD), endSec: 0 };
  });
  scenes.forEach((s, si) => {
    s.endSec = si + 1 < scenes.length ? scenes[si + 1].startSec : totalSec;
  });

  return { fps: FPS, title: script.title ?? "", totalSec, scenes, cues };
}

// ---- CLI: script/script.json + build/audio/*.{wav,query.json} → build/timeline.{json,js}
function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const script = JSON.parse(readFileSync(path.join(root, "script/script.json"), "utf8"));
  const flat = flattenCues(script);
  let sampleRate = null;
  const cueData = flat.map((_, i) => {
    const nnn = String(i).padStart(3, "0");
    const wav = parseWav(readFileSync(path.join(root, `build/audio/${nnn}.wav`)));
    if (sampleRate === null) sampleRate = wav.sampleRate;
    if (wav.sampleRate !== sampleRate) throw new Error(`sampleRate が混在: ${nnn}.wav`);
    const query = JSON.parse(readFileSync(path.join(root, `build/audio/${nnn}.query.json`), "utf8"));
    return { wavSec: wav.durationSec, query };
  });
  const timeline = { ...buildTimeline(script, cueData), sampleRate };
  mkdirSync(path.join(root, "build"), { recursive: true });
  writeFileSync(path.join(root, "build/timeline.json"), JSON.stringify(timeline, null, 1));
  writeFileSync(path.join(root, "build/timeline.js"), `window.TIMELINE = ${JSON.stringify(timeline)};\n`);
  console.log(
    `timeline: ${timeline.cues.length} cues, ${timeline.scenes.length} scenes, ${timeline.totalSec.toFixed(1)}s`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
