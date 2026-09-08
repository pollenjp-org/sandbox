// 決定論的 seek エンジン。
// __seek(t) が「時刻 t の画面状態」を完全に決める (壁時計・乱数・CSS アニメ不使用)。
// render.mjs はこれを 1/30 秒刻みで呼びながらスクリーンショットを撮る。

(() => {
  const RENDER = new URLSearchParams(location.search).has("render");
  if (RENDER) document.body.classList.add("render");

  const SCENE_FADE = 0.5; // シーン交差フェード
  const STEP_IN = 0.28; // step 出現
  const STEP_OUT = 0.22; // step 退場
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (p) => 1 - (1 - p) * (1 - p);

  // ---------- タイムライン (無ければ静的 QA 用の代替を合成) ----------
  let TL = window.TIMELINE;
  window.__stepWarnings = [];
  if (!TL) {
    const scenes = [];
    const cues = [];
    let t = 0;
    for (const [id, def] of Object.entries(window.SLIDES)) {
      const tmp = document.createElement("div");
      tmp.innerHTML = def.html;
      const steps = [...new Set([...tmp.querySelectorAll("[data-step]")].map((e) => e.dataset.step))];
      const start = t;
      steps.forEach((step, k) => {
        cues.push({ i: cues.length, scene: id, speaker: k % 2 ? "metan" : "zunda", caption: `(preview) ${id} / ${step}`, step, startSec: t + 0.4 + k * 0.9, endSec: t + 1.1 + k * 0.9, mouth: [] });
      });
      t = start + 1.2 + steps.length * 0.9 + 1.6;
      scenes.push({ id, startSec: start, endSec: t });
    }
    TL = { fps: 30, totalSec: t + 1, scenes, cues, preview: true };
    console.warn("build/timeline.js が無いので静的プレビュー用タイムラインで動いています");
  }

  // ---------- DOM 構築 ----------
  const scenesEl = document.getElementById("scenes");
  const sceneEls = new Map();
  for (const sc of TL.scenes) {
    const def = window.SLIDES[sc.id];
    if (!def) {
      window.__stepWarnings.push(`scene 未定義: ${sc.id}`);
      continue;
    }
    const el = document.createElement("div");
    el.className = "scene";
    el.dataset.scene = sc.id;
    el.innerHTML = `<div class="inner">${def.html}</div>`;
    scenesEl.appendChild(el);
    sceneEls.set(sc.id, el);
  }
  for (const key of ["zunda", "metan"]) {
    document.getElementById(`chara-${key}`).innerHTML = window.CHARACTERS[key].svg;
  }

  // ---------- step 時刻の解決 ----------
  const stepStart = new Map(); // "scene:step" -> sec
  for (const cue of TL.cues) {
    if (cue.step && !stepStart.has(`${cue.scene}:${cue.step}`)) {
      stepStart.set(`${cue.scene}:${cue.step}`, cue.startSec);
    }
  }
  const sceneById = new Map(TL.scenes.map((s) => [s.id, s]));

  // 要素ごとの出現/退場時刻を確定する
  const stepItems = []; // {el, isSvg, showAt, hideAt}
  const drawItems = []; // {el, len, showAt, dur}
  for (const [sceneId, root] of sceneEls) {
    const sc = sceneById.get(sceneId);
    const resolve = (step, delayAttr) => {
      const key = `${sceneId}:${step}`;
      let at = stepStart.get(key);
      if (at === undefined) {
        window.__stepWarnings.push(`step が台本に無い: ${key}`);
        at = sc.startSec;
      }
      return at + (parseFloat(delayAttr || "0") || 0);
    };
    for (const el of root.querySelectorAll("[data-step]")) {
      const showAt = resolve(el.dataset.step, el.dataset.delay);
      const hideAt = el.dataset.stepHide ? resolve(el.dataset.stepHide, "0") : Infinity;
      // 完全に隠れている間は display:none でレイアウトからも外す。
      // 元の inline display (flex 等) を覚えておいて復元する
      stepItems.push({ el, isSvg: !!el.ownerSVGElement, showAt, hideAt, disp: el.style.display });
    }
    for (const el of root.querySelectorAll("[data-draw]")) {
      const showAt = resolve(el.dataset.draw, el.dataset.delay);
      const dur = parseFloat(el.dataset.drawdur || "0.6");
      const len = el.getTotalLength ? el.getTotalLength() : 0;
      el.style.strokeDasharray = `${len}`;
      drawItems.push({ el, len, showAt, dur });
    }
    // 台本側の step が紙面に存在するかの逆チェック
    for (const [key] of stepStart) {
      if (!key.startsWith(`${sceneId}:`)) continue;
      const step = key.slice(sceneId.length + 1);
      if (!root.querySelector(`[data-step="${step}"], [data-draw="${step}"], [data-step-hide="${step}"]`)) {
        window.__stepWarnings.push(`紙面に無い step: ${key}`);
      }
    }
  }

  // ---------- 字幕スケジュール ----------
  const captions = TL.cues.map((cue, i) => {
    const next = TL.cues[i + 1];
    const sceneEnd = sceneById.get(cue.scene).endSec;
    const from = cue.startSec - 0.12;
    const to = next ? Math.min(next.startSec - 0.12, next.scene === cue.scene ? Infinity : sceneEnd) : TL.totalSec;
    return { cue, from, to };
  });

  // ---------- キャラ ----------
  const charas = {};
  for (const key of ["zunda", "metan"]) {
    const root = document.getElementById(`chara-${key}`);
    charas[key] = {
      root,
      def: window.CHARACTERS[key],
      bob: root.querySelector(".bob"),
      mouths: {
        closed: root.querySelectorAll('[data-mouth="closed"]'),
        a: root.querySelectorAll('[data-mouth="a"]'),
        i: root.querySelectorAll('[data-mouth="i"]'),
        o: root.querySelectorAll('[data-mouth="o"]'),
      },
      eyesOpen: root.querySelectorAll('[data-eyes="open"]'),
      eyesClosed: root.querySelectorAll('[data-eyes="closed"]'),
      plate: document.getElementById(`plate-${key}`),
    };
  }
  const VOWEL_SHAPE = { a: "a", i: "i", e: "i", u: "o", o: "o" };

  const headTitle = document.getElementById("scene-title");
  const headBadge = document.getElementById("scene-badge");
  const headEl = document.getElementById("head");
  const progressEl = document.getElementById("progress");
  const capBox = document.getElementById("caption-box");
  const capEl = document.getElementById("caption");

  // 現在のセリフ (発話区間のみ)
  function activeCue(t) {
    for (const cue of TL.cues) {
      if (t >= cue.startSec && t <= cue.endSec) return cue;
      if (cue.startSec > t) break;
    }
    return null;
  }

  // ---------- 本体 ----------
  function seek(t) {
    t = Math.max(0, Math.min(TL.totalSec, t));

    progressEl.style.width = `${(t / TL.totalSec) * 100}%`;

    // シーンの交差フェードとヘッダ
    let current = TL.scenes[0];
    for (const sc of TL.scenes) if (t >= sc.startSec) current = sc;
    for (const sc of TL.scenes) {
      const el = sceneEls.get(sc.id);
      if (!el) continue;
      // 先頭シーンはフェード無しで最初から見せる
      const inP = sc.startSec <= 0 ? 1 : clamp01((t - sc.startSec) / SCENE_FADE);
      const outP = clamp01((t - sc.endSec) / SCENE_FADE);
      const op = inP * (1 - outP);
      el.style.opacity = op.toFixed(3);
      el.style.visibility = op <= 0 ? "hidden" : "visible";
    }
    const def = window.SLIDES[current.id] || { title: "", badge: "" };
    headTitle.textContent = def.title;
    headBadge.textContent = def.badge;
    headBadge.style.visibility = def.badge ? "visible" : "hidden";
    headEl.style.opacity = clamp01((t - current.startSec) / 0.35).toFixed(3);

    // step 出現 / 退場
    for (const it of stepItems) {
      const inP = easeOut(clamp01((t - it.showAt) / STEP_IN));
      const outP = clamp01((t - it.hideAt) / STEP_OUT);
      const op = inP * (1 - outP);
      it.el.style.opacity = op.toFixed(3);
      it.el.style.display = op <= 0 ? "none" : it.disp;
      if (!it.isSvg) {
        it.el.style.transform = inP < 1 ? `translateY(${((1 - inP) * 14).toFixed(2)}px)` : "";
      }
    }
    for (const it of drawItems) {
      const p = clamp01((t - it.showAt) / it.dur);
      it.el.style.opacity = p > 0 ? "1" : "0";
      it.el.style.display = p <= 0 ? "none" : "";
      it.el.style.strokeDashoffset = `${it.len * (1 - p)}`;
    }

    // 字幕
    let cap = null;
    for (const c of captions) {
      if (t >= c.from && t < c.to) cap = c;
      if (c.from > t) break;
    }
    if (cap) {
      capEl.textContent = cap.cue.caption;
      capBox.className = `sp-${cap.cue.speaker}`;
      capBox.style.opacity = clamp01((t - cap.from) / 0.18).toFixed(3);
    } else {
      capBox.style.opacity = "0";
    }

    // キャラ (口・目・ゆれ・強調)
    const cue = activeCue(t);
    for (const key of ["zunda", "metan"]) {
      const ch = charas[key];
      const speaking = !!cue && cue.speaker === key;

      let shape = "closed";
      if (speaking) {
        for (const [s, e, v] of cue.mouth) {
          if (t >= s && t < e) {
            shape = VOWEL_SHAPE[v] || "closed";
            break;
          }
          if (s > t) break;
        }
      }
      for (const [name, els] of Object.entries(ch.mouths)) {
        const vis = name === shape ? "visible" : "hidden";
        els.forEach((el) => (el.style.visibility = vis));
      }

      const bp = ch.def.blinkPeriod;
      const phase = (t + ch.def.blinkOffset) % bp;
      const blink = phase > bp - 0.13;
      ch.eyesOpen.forEach((el) => (el.style.visibility = blink ? "hidden" : "visible"));
      ch.eyesClosed.forEach((el) => (el.style.visibility = blink ? "visible" : "hidden"));

      if (ch.bob) {
        const dy = speaking ? -3.2 * Math.abs(Math.sin(2 * Math.PI * 2.1 * (t - cue.startSec))) : 0;
        ch.bob.setAttribute("transform", `translate(0 ${dy.toFixed(2)})`);
      }

      const scale = speaking ? 1.05 : cue ? 0.94 : 0.97;
      ch.root.style.transform = `scale(${scale})`;
      ch.root.style.transformOrigin = "50% 100%";
      ch.root.style.filter = speaking || !cue ? "none" : "brightness(0.72) saturate(0.85)";
      ch.plate.classList.toggle("on", speaking);
    }
  }

  window.__seek = seek;
  window.__total = () => TL.totalSec;
  window.__ready = (async () => {
    try {
      await document.fonts.ready;
    } catch {}
    seek(0);
    if (window.__stepWarnings.length) console.warn("step 警告:", window.__stepWarnings);
    return true;
  })();

  // ---------- プレビュー操作 (render 時は不使用) ----------
  if (!RENDER) {
    const audio = document.getElementById("voice");
    const btn = document.getElementById("btn-play");
    const bar = document.getElementById("seekbar");
    const clock = document.getElementById("clock");
    let raf = null;
    const useAudio = !TL.preview;

    const fit = () => {
      const s = Math.min(innerWidth / 1920, innerHeight / 1080);
      document.getElementById("stage").style.transform = `scale(${s})`;
    };
    addEventListener("resize", fit);
    fit();

    let vt = 0; // 音声を使わないときの仮想時刻
    let playing = false;
    let lastTick = 0;
    const tick = (now) => {
      if (useAudio) {
        vt = audio.currentTime;
        playing = !audio.paused && !audio.ended;
      } else if (playing) {
        vt = Math.min(TL.totalSec, vt + (now - lastTick) / 1000);
        if (vt >= TL.totalSec) playing = false;
      }
      lastTick = now;
      seek(vt);
      bar.value = String(Math.round((vt / TL.totalSec) * 1000));
      clock.textContent = `${vt.toFixed(1)} / ${TL.totalSec.toFixed(1)}`;
      btn.textContent = playing ? "⏸ 停止" : "▶ 再生";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    btn.addEventListener("click", () => {
      if (useAudio) {
        audio.paused ? audio.play() : audio.pause();
      } else {
        playing = !playing;
      }
    });
    bar.addEventListener("input", () => {
      const t = (Number(bar.value) / 1000) * TL.totalSec;
      if (useAudio) audio.currentTime = t;
      vt = t;
      seek(t);
    });
    addEventListener("keydown", (e) => {
      if (e.key === " ") {
        e.preventDefault();
        btn.click();
      }
    });
  }
})();
