// 自作 SVG マスコット 2 体。既存キャラの立ち絵は使わない (ADR 003)。
//   zunda 側 = ボトル博士 (スパイス瓶 + 指し棒)   声: VOICEVOX:ずんだもん
//   metan 側 = チリちゃん (唐辛子の新米)          声: VOICEVOX:四国めたん
// 口は data-mouth="closed|a|i|o" の 4 形、目は data-eyes="open|closed"。
// page.js が t に応じて表示を切り替える。

(() => {
  // ---------- ボトル博士 ----------
  const bottle = `
<svg viewBox="0 0 300 330" xmlns="http://www.w3.org/2000/svg">
  <g class="bob">
    <!-- 指し棒を持つ腕 (右) -->
    <path d="M232 178 Q 258 156 268 118" fill="none" stroke="#8a6a2f" stroke-width="13" stroke-linecap="round"/>
    <line x1="248" y1="150" x2="286" y2="66" stroke="#d8cdb4" stroke-width="7" stroke-linecap="round"/>
    <circle cx="286" cy="66" r="8" fill="#e8543f"/>
    <!-- 左腕 -->
    <path d="M68 190 Q 46 204 44 226" fill="none" stroke="#8a6a2f" stroke-width="13" stroke-linecap="round"/>

    <!-- コルク帽 -->
    <rect x="106" y="18" width="88" height="36" rx="10" fill="#b98a5e" stroke="#7c5a3a" stroke-width="4"/>
    <rect x="118" y="50" width="64" height="16" fill="#a5794f" stroke="#7c5a3a" stroke-width="4"/>

    <!-- 瓶の首と本体 -->
    <rect x="112" y="62" width="76" height="26" fill="#e9b75b" stroke="#8a6a2f" stroke-width="5"/>
    <rect x="62" y="84" width="176" height="216" rx="46" fill="#e9b75b" stroke="#8a6a2f" stroke-width="6"/>
    <!-- ガラスの照り -->
    <path d="M84 116 Q 80 200 88 258" fill="none" stroke="#f6d896" stroke-width="12" stroke-linecap="round" opacity="0.8"/>

    <!-- ラベル -->
    <rect x="86" y="196" width="128" height="76" rx="12" fill="#f2ede2" stroke="#c9bfa8" stroke-width="3"/>
    <text x="150" y="230" text-anchor="middle" font-family="Noto Sans CJK JP, sans-serif" font-size="24" font-weight="900" fill="#8a6a2f" letter-spacing="3">SPICE</text>
    <line x1="100" y1="244" x2="200" y2="244" stroke="#c9bfa8" stroke-width="3"/>
    <line x1="112" y1="256" x2="188" y2="256" stroke="#c9bfa8" stroke-width="3"/>

    <!-- 眉 (博士っぽさ) -->
    <path d="M92 108 Q 108 96 126 104" fill="none" stroke="#f5f0e4" stroke-width="9" stroke-linecap="round"/>
    <path d="M174 104 Q 192 96 208 108" fill="none" stroke="#f5f0e4" stroke-width="9" stroke-linecap="round"/>

    <!-- 目 (開) -->
    <g data-eyes="open">
      <circle cx="112" cy="134" r="11" fill="#2b2b26"/>
      <circle cx="188" cy="134" r="11" fill="#2b2b26"/>
      <circle cx="116" cy="130" r="3.6" fill="#fff"/>
      <circle cx="192" cy="130" r="3.6" fill="#fff"/>
    </g>
    <!-- 目 (閉) -->
    <g data-eyes="closed">
      <path d="M101 136 Q 112 143 123 136" fill="none" stroke="#2b2b26" stroke-width="5" stroke-linecap="round"/>
      <path d="M177 136 Q 188 143 199 136" fill="none" stroke="#2b2b26" stroke-width="5" stroke-linecap="round"/>
    </g>
    <!-- 丸眼鏡 -->
    <circle cx="112" cy="134" r="20" fill="none" stroke="#5c4a28" stroke-width="4.5"/>
    <circle cx="188" cy="134" r="20" fill="none" stroke="#5c4a28" stroke-width="4.5"/>
    <line x1="132" y1="134" x2="168" y2="134" stroke="#5c4a28" stroke-width="4.5"/>

    <!-- 口 -->
    <g data-mouth="closed"><path d="M136 172 Q 150 181 164 172" fill="none" stroke="#6b4a22" stroke-width="5" stroke-linecap="round"/></g>
    <g data-mouth="a"><ellipse cx="150" cy="176" rx="14" ry="15" fill="#7c3a28"/><path d="M139 183 Q 150 192 161 183" fill="#c4614a"/></g>
    <g data-mouth="i"><rect x="133" y="170" width="34" height="10" rx="5" fill="#7c3a28"/></g>
    <g data-mouth="o"><circle cx="150" cy="176" r="9.5" fill="#7c3a28"/></g>

    <!-- 足 -->
    <ellipse cx="118" cy="304" rx="22" ry="10" fill="#8a6a2f"/>
    <ellipse cx="182" cy="304" rx="22" ry="10" fill="#8a6a2f"/>
  </g>
</svg>`;

  // ---------- チリちゃん ----------
  const chili = `
<svg viewBox="0 0 300 330" xmlns="http://www.w3.org/2000/svg">
  <g class="bob">
    <!-- 腕 -->
    <path d="M64 196 Q 40 184 34 160" fill="none" stroke="#a83323" stroke-width="12" stroke-linecap="round"/>
    <path d="M236 196 Q 258 208 262 232" fill="none" stroke="#a83323" stroke-width="12" stroke-linecap="round"/>

    <!-- 体 (唐辛子) -->
    <path d="M150 66
             C 216 66 236 132 228 192
             C 221 246 196 288 148 296
             C 106 302 70 272 72 220
             C 74 156 92 66 150 66 Z"
          fill="#e8543f" stroke="#a83323" stroke-width="6"/>
    <!-- 照り -->
    <path d="M96 122 Q 88 196 102 250" fill="none" stroke="#f07a5f" stroke-width="12" stroke-linecap="round" opacity="0.85"/>

    <!-- ヘタ (ベレー帽風) -->
    <path d="M110 74 Q 116 46 150 44 Q 186 46 192 74
             Q 170 62 150 66 Q 130 62 110 74 Z"
          fill="#5e8c3a" stroke="#3f6626" stroke-width="5" stroke-linejoin="round"/>
    <path d="M148 46 Q 146 28 162 20" fill="none" stroke="#3f6626" stroke-width="7" stroke-linecap="round"/>

    <!-- 目 (開) -->
    <g data-eyes="open">
      <circle cx="118" cy="158" r="13" fill="#2b2422"/>
      <circle cx="184" cy="158" r="13" fill="#2b2422"/>
      <circle cx="123" cy="153" r="4.2" fill="#fff"/>
      <circle cx="189" cy="153" r="4.2" fill="#fff"/>
    </g>
    <!-- 目 (閉) -->
    <g data-eyes="closed">
      <path d="M106 160 Q 118 168 130 160" fill="none" stroke="#2b2422" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M172 160 Q 184 168 196 160" fill="none" stroke="#2b2422" stroke-width="5.5" stroke-linecap="round"/>
    </g>

    <!-- ほっぺ -->
    <ellipse cx="98" cy="186" rx="13" ry="8" fill="#f2937f" opacity="0.9"/>
    <ellipse cx="204" cy="186" rx="13" ry="8" fill="#f2937f" opacity="0.9"/>

    <!-- 口 -->
    <g data-mouth="closed"><path d="M136 194 Q 150 203 164 194" fill="none" stroke="#8c2f1e" stroke-width="5" stroke-linecap="round"/></g>
    <g data-mouth="a"><ellipse cx="150" cy="199" rx="14" ry="16" fill="#8c2f1e"/><path d="M139 207 Q 150 216 161 207" fill="#d4705c"/></g>
    <g data-mouth="i"><rect x="133" y="193" width="34" height="10" rx="5" fill="#8c2f1e"/></g>
    <g data-mouth="o"><circle cx="150" cy="199" r="9.5" fill="#8c2f1e"/></g>

    <!-- 足 -->
    <ellipse cx="122" cy="302" rx="20" ry="9" fill="#a83323"/>
    <ellipse cx="178" cy="302" rx="20" ry="9" fill="#a83323"/>
  </g>
</svg>`;

  window.CHARACTERS = {
    zunda: { name: "ボトル博士", svg: bottle, blinkPeriod: 4.1, blinkOffset: 1.3 },
    metan: { name: "チリちゃん", svg: chili, blinkPeriod: 3.4, blinkOffset: 0.4 },
  };
})();
