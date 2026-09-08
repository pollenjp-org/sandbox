// timeline.json の開始時刻どおりに build/audio/NNN.wav を 1 本へ並べ、
// build/full.wav を書く。映像側 (render) と同じ timeline から作るので
// a/v ズレは構造的に起きない。

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseWav, buildWav } from "./wav.mjs";

/**
 * @param {{sampleRate:number, totalSec:number, cues:{startSec:number}[]}} timeline
 * @param {Int16Array[]} pcms cue と同順
 */
export function mixPcm(timeline, pcms) {
  if (pcms.length !== timeline.cues.length) {
    throw new Error(`pcm 数 (${pcms.length}) が cue 数 (${timeline.cues.length}) と合わない`);
  }
  const out = new Int16Array(Math.round(timeline.totalSec * timeline.sampleRate));
  timeline.cues.forEach((cue, i) => {
    const at = Math.round(cue.startSec * timeline.sampleRate);
    if (at + pcms[i].length > out.length) {
      throw new Error(`cue ${i} が全体長をはみ出す`);
    }
    out.set(pcms[i], at);
  });
  return out;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const timeline = JSON.parse(readFileSync(path.join(root, "build/timeline.json"), "utf8"));
  const pcms = timeline.cues.map((cue) => {
    const nnn = String(cue.i).padStart(3, "0");
    return parseWav(readFileSync(path.join(root, `build/audio/${nnn}.wav`))).pcm;
  });
  const mixed = mixPcm(timeline, pcms);
  writeFileSync(path.join(root, "build/full.wav"), buildWav(mixed, timeline.sampleRate));
  console.log(`full.wav: ${(mixed.length / timeline.sampleRate).toFixed(1)}s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
