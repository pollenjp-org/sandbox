// VOICEVOX ENGINE の起動と話者解決。synth.mjs から使う。

import { spawn } from "node:child_process";
import net from "node:net";

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * ENGINE を空きポートで起動し、/version が応答するまで待つ。
 * @returns {Promise<{baseUrl:string, stop:()=>void}>}
 */
export async function startEngine() {
  const bin = process.env.VOICEVOX_ENGINE_BIN;
  if (!bin) throw new Error("VOICEVOX_ENGINE_BIN が未設定 (nix develop 経由で実行すること)");
  const port = await freePort();
  const proc = spawn(bin, ["--host", "127.0.0.1", "--port", String(port)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderrTail = "";
  proc.stderr.on("data", (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000; // モデルロードに時間がかかることがある
  for (;;) {
    if (proc.exitCode !== null) {
      throw new Error(`ENGINE が起動前に終了 (code=${proc.exitCode}):\n${stderrTail}`);
    }
    try {
      const res = await fetch(`${baseUrl}/version`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) break;
    } catch {
      // まだ立ち上がっていない
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`ENGINE が 120s 以内に応答しない:\n${stderrTail}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    baseUrl,
    stop() {
      proc.kill();
    },
  };
}

/** 話者名 + スタイル名 → style id (/speakers から解決。無ければ throw) */
export async function resolveStyleId(baseUrl, vvSpeaker, vvStyle) {
  const res = await fetch(`${baseUrl}/speakers`);
  if (!res.ok) throw new Error(`/speakers が ${res.status}`);
  const speakers = await res.json();
  const sp = speakers.find((s) => s.name === vvSpeaker);
  if (!sp) throw new Error(`話者が見つからない: ${vvSpeaker}`);
  const st = sp.styles.find((s) => s.name === vvStyle);
  if (!st) throw new Error(`スタイルが見つからない: ${vvSpeaker}/${vvStyle}`);
  return st.id;
}
