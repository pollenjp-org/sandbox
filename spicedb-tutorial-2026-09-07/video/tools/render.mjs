// headless Chromium を CDP (WebSocket) で直接叩き、page/ の __seek(t) を
// 1/fps 刻みで進めながらスクリーンショットを ffmpeg の stdin へ流して
// out/spicedb-intro.mp4 を作る。npm 依存ゼロ (Node 24 の fetch / WebSocket)。
//
//   node tools/render.mjs                     フルレンダリング
//   node tools/render.mjs --stills 1,32,60    指定秒の PNG を build/stills/ へ (QA 用)
//   node tools/render.mjs --range 10 20       10〜20 秒だけの mp4 (out/preview.mp4)

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync, renameSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;

// ---------- CDP クライアント (page target 直結の flat protocol) ----------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${JSON.stringify(msg.error)}`));
        else p.resolve(msg.result);
      } else {
        this.events.push(msg);
      }
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression, { awaitPromise = false } = {}) {
    const r = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`page 内で例外: ${JSON.stringify(r.exceptionDetails).slice(0, 500)}`);
    }
    return r.result?.value;
  }
}

async function launchChromium() {
  const bin = process.env.CHROMIUM_BIN;
  if (!bin) throw new Error("CHROMIUM_BIN が未設定 (nix develop 経由で実行すること)");
  const profile = mkdtempSync(path.join(tmpdir(), "video-render-"));
  const proc = spawn(
    bin,
    [
      "--headless",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "--force-device-scale-factor=1",
      "--force-color-profile=srgb",
      "--window-size=1920,1080",
      "--allow-file-access-from-files",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  // stderr の "DevTools listening on ws://..." からポートを拾う
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        proc.stderr.off("data", onData);
        resolve(Number(m[1]));
      }
    };
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => reject(new Error(`chromium が起動前に終了 (code=${code})\n${buf}`)));
    setTimeout(() => reject(new Error(`chromium の DevTools が 30s 以内に出ない:\n${buf}`)), 30_000);
  });
  const cleanup = () => {
    try {
      proc.kill();
    } catch {}
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  };
  return { proc, port, cleanup };
}

async function connectPage(port) {
  // page target の webSocketDebuggerUrl を探す
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === "page");
    if (page) {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.addEventListener("open", res, { once: true });
        ws.addEventListener("error", rej, { once: true });
      });
      return new Cdp(ws);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("page target が見つからない");
}

function parseArgs(argv) {
  const a = { mode: "full" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--stills") {
      a.mode = "stills";
      a.times = argv[++i].split(",").map(Number);
    } else if (argv[i] === "--range") {
      a.mode = "range";
      a.from = Number(argv[++i]);
      a.to = Number(argv[++i]);
    } else {
      throw new Error(`未知の引数: ${argv[i]}`);
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const { cleanup, port } = await launchChromium();
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit(130));
  try {
    const cdp = await connectPage(port);
    await cdp.call("Page.enable");
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const pageUrl = `file://${path.join(root, "page/index.html")}?render=1`;
    await cdp.call("Page.navigate", { url: pageUrl });
    // __ready (フォントロード + seek(0)) を待つ
    for (let i = 0; i < 100; i++) {
      try {
        if (await cdp.eval("window.__ready", { awaitPromise: true })) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const warnings = await cdp.eval("JSON.stringify(window.__stepWarnings || [])");
    for (const w of JSON.parse(warnings)) console.warn(`⚠ ${w}`);

    const shot = async (t) => {
      await cdp.eval(`window.__seek(${t})`);
      const r = await cdp.call("Page.captureScreenshot", { format: "png" });
      return Buffer.from(r.data, "base64");
    };

    if (args.mode === "stills") {
      const dir = path.join(root, "build/stills");
      mkdirSync(dir, { recursive: true });
      for (const t of args.times) {
        const png = await shot(t);
        const file = path.join(dir, `t${String(t).replace(/\./g, "_")}.png`);
        writeFileSync(file, png);
        console.log(file);
      }
      return;
    }

    // full / range: timeline と full.wav が要る
    if (!existsSync(path.join(root, "build/timeline.json")) || !existsSync(path.join(root, "build/full.wav"))) {
      throw new Error("build/timeline.json か build/full.wav が無い。先に synth → timeline → mix を実行");
    }
    const totalSec = await cdp.eval("window.__total()");
    const from = args.mode === "range" ? args.from : 0;
    const to = args.mode === "range" ? Math.min(args.to, totalSec) : totalSec;
    const outFile = path.join(root, args.mode === "range" ? "out/preview.mp4" : "out/spicedb-intro.mp4");
    // faststart の mp4 は ffmpeg 終了まで moov が無く再生できないので、
    // 一時名で書いて完成時に rename する (未完成品を完成品のパスに置かない)
    const tmpFile = path.join(path.dirname(outFile), `.rendering-${path.basename(outFile)}`);
    const logFile = path.join(root, "build/render.log");
    const log = (line) => {
      console.log(line);
      appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    };
    mkdirSync(path.join(root, "out"), { recursive: true });
    mkdirSync(path.join(root, "build"), { recursive: true });
    writeFileSync(logFile, "");

    const startFrame = Math.round(from * FPS);
    const endFrame = args.mode === "range" ? Math.round(to * FPS) : Math.ceil(to * FPS);
    const nFrames = endFrame - startFrame;

    const ffArgs = [
      "-y",
      "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      ...(args.mode === "range"
        ? ["-ss", String(from), "-i", path.join(root, "build/full.wav"), "-t", String(to - from)]
        : ["-i", path.join(root, "build/full.wav")]),
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-f", "mp4",
      tmpFile,
    ];
    const ff = spawn("ffmpeg", ffArgs, { stdio: ["pipe", "ignore", "pipe"] });
    let ffErr = "";
    ff.stderr.on("data", (d) => (ffErr = (ffErr + d.toString()).slice(-4000)));
    const ffDone = new Promise((resolve, reject) => {
      ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}:\n${ffErr}`))));
    });

    const t0 = Date.now();
    for (let f = startFrame; f < endFrame; f++) {
      const png = await shot(f / FPS);
      if (!ff.stdin.write(png)) {
        await new Promise((r) => ff.stdin.once("drain", r));
      }
      const done = f - startFrame + 1;
      if (done % 300 === 0 || done === nFrames) {
        const spd = done / ((Date.now() - t0) / 1000);
        const eta = Math.round((nFrames - done) / spd);
        log(`  frame ${done}/${nFrames} (${spd.toFixed(1)} fps, 残り ~${eta}s)`);
      }
    }
    ff.stdin.end();
    await ffDone;
    renameSync(tmpFile, outFile);
    log(`✅ ${outFile}`);
  } finally {
    cleanup();
  }
}

await main();
