// 台本の全セリフを VOICEVOX ENGINE で合成する。
//   build/audio/NNN.wav        音声
//   build/audio/NNN.query.json audio_query (モーラ長 → 口パクの素)
//   build/audio/NNN.meta.json  スキップ判定用ハッシュ
// speaker+text が変わっていないセリフは再合成しない。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startEngine, resolveStyleId } from "./engine.mjs";
import { validateScript, flattenCues, SPEAKERS } from "./timeline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 等速 (1.0) は解説にはややゆっくりなので少し上げる。
// モーラ長・前後無音はすべて 1/SPEED に縮む (実測済み)。timeline.mjs が同じ式で口パクを作る。
const SPEED = 1.12;

async function synthOne(baseUrl, styleId, text) {
  const qres = await fetch(
    `${baseUrl}/audio_query?speaker=${styleId}&text=${encodeURIComponent(text)}`,
    { method: "POST" },
  );
  if (!qres.ok) throw new Error(`audio_query ${qres.status}: ${await qres.text()}`);
  const query = await qres.json();
  query.speedScale = SPEED;
  const sres = await fetch(`${baseUrl}/synthesis?speaker=${styleId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!sres.ok) throw new Error(`synthesis ${sres.status}: ${await sres.text()}`);
  return { query, wav: Buffer.from(await sres.arrayBuffer()) };
}

async function main() {
  const scriptPath = process.argv[2] ?? path.join(root, "script/script.json");
  const script = JSON.parse(readFileSync(scriptPath, "utf8"));
  validateScript(script);
  const cues = flattenCues(script);
  const outDir = path.join(root, "build/audio");
  mkdirSync(outDir, { recursive: true });

  // 変更が無ければ ENGINE を立てずに終わる
  const todo = cues
    .map((cue, i) => {
      const hash = createHash("sha256").update(`${cue.speaker}\n${cue.text}\n${SPEED}`).digest("hex");
      const nnn = String(i).padStart(3, "0");
      const metaPath = path.join(outDir, `${nnn}.meta.json`);
      const fresh =
        existsSync(metaPath) &&
        existsSync(path.join(outDir, `${nnn}.wav`)) &&
        JSON.parse(readFileSync(metaPath, "utf8")).hash === hash;
      return { cue, i, nnn, hash, fresh };
    })
    .filter((x) => !x.fresh);
  console.log(`${cues.length} cues (${todo.length} 件を合成)`);
  if (todo.length === 0) return;

  const engine = await startEngine();
  try {
    const styleIds = {};
    for (const [key, { vvSpeaker, vvStyle }] of Object.entries(SPEAKERS)) {
      styleIds[key] = await resolveStyleId(engine.baseUrl, vvSpeaker, vvStyle);
    }
    console.log("style ids:", styleIds);
    for (const { cue, nnn, hash } of todo) {
      const { query, wav } = await synthOne(engine.baseUrl, styleIds[cue.speaker], cue.text);
      writeFileSync(path.join(outDir, `${nnn}.wav`), wav);
      writeFileSync(path.join(outDir, `${nnn}.query.json`), JSON.stringify(query));
      writeFileSync(path.join(outDir, `${nnn}.meta.json`), JSON.stringify({ hash }));
      console.log(`  ${nnn} [${cue.speaker}] ${cue.text.slice(0, 28)}…`);
    }
  } finally {
    engine.stop();
  }
}

await main();
