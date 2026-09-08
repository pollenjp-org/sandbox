// シーンごとのスライド定義。
//   data-step="X"      : 台本の step X の cue 開始で出現 (0.28s フェード)
//   data-step-hide="X" : step X の cue 開始で退場 (紙面の入れ替え)
//   data-delay="0.3"   : 出現を step 開始から遅らせる (連鎖出現用)
//   data-draw="X"      : SVG パスを step X から描画進行 (data-drawdur 秒, 既定 0.6)
// page.js がこれらを __seek(t) の純関数として駆動する。

(() => {
  // グラフのノード (rebac シーンのヒーロー図)
  const node = (x, y, w, label, cls = "") =>
    `<g class="gnode ${cls}" transform="translate(${x},${y})">
       <rect x="${-w / 2}" y="-39" width="${w}" height="78" rx="16"
             fill="#2a302b" stroke="#3d453e" stroke-width="3"/>
       <text x="0" y="10" text-anchor="middle" font-family="Noto Sans Mono CJK JP, monospace"
             font-size="27" fill="#f2ede2">${label}</text>
     </g>`;

  window.SLIDES = {
    // ================= OP =================
    op: {
      title: "SpiceDB をゼロから",
      badge: "総集編",
      html: `
        <div data-step="title" style="margin-top:16px">
          <div class="lede" style="font-size:62px">SpiceDB を<span class="accent">ゼロ</span>から</div>
          <div class="sub" style="font-size:30px; margin-top:8px">if 文の破綻から New Enemy 問題まで — 教材リポジトリ総集編</div>
        </div>
        <div class="cardrow" data-step="cast" style="max-width:1200px; margin-top:22px">
          <div class="card gold" style="padding:16px 26px"><h3 style="margin-bottom:4px">ボトル博士 <span style="font-size:20px;color:var(--ink-dim)">解説役</span></h3><p style="font-size:23px">スパイス瓶の妖精。声: VOICEVOX:ずんだもん</p></div>
          <div class="card red" style="padding:16px 26px"><h3 style="margin-bottom:4px">チリちゃん <span style="font-size:20px;color:var(--ink-dim)">聞き役</span></h3><p style="font-size:23px">新米エンジニアの唐辛子。声: VOICEVOX:四国めたん</p></div>
        </div>
        <div class="cardrow" data-step="authn-authz" style="max-width:1420px; margin-top:22px">
          <div class="card" style="padding:18px 28px"><h3>認証 <span style="color:var(--ink-dim);font-size:22px">authentication</span></h3><p><strong>相手が誰か</strong>を確かめる。ログイン、OIDC、パスキー</p></div>
          <div class="card gold" style="padding:18px 28px"><h3>認可 <span style="color:var(--ink-dim);font-size:22px">authorization</span></h3><p><strong>その人が何をしてよいか</strong>を決める。<strong>今日はこちら</strong></p></div>
        </div>
        <p class="sub" data-step="badge" style="margin-top:20px; font-size:27px">
          教材: <span class="mono">spicedb-tutorial-2026-09-07</span> — tutorial 8 章 (手) ・ textbook 8 章 (頭) ・ docshare (応用)。右上の章バッジが対応先
        </p>`,
    },

    // ================= 00 if 文の破綻 =================
    ifhell: {
      title: "なぜ認可は難しいのか",
      badge: "textbook 00",
      html: `
        <div class="lede" data-step="intro">文書共有サービスを作る</div>
        <div style="display:flex; gap:48px; align-items:flex-start">
          <div style="flex:11">
            <pre class="code" data-step="code"><span class="c-kw">if</span> doc.OwnerID == user.ID { <span class="c-cm">/* OK */</span> }</pre>
            <div class="note" data-step="collapse">
              if 文で追うと権限ロジックがハンドラ中に散らばり、<br>
              <b>「結局この文書を誰が見られるのか」に誰も答えられなくなる</b>
            </div>
            <div class="note" data-step="reverse">
              特に <b>⑥ 逆引き</b>は、判定が命令形コードの中にあると<b>原理的に書けない</b>
            </div>
          </div>
          <ul class="klist" style="flex:9; margin-top:6px">
            <li data-step="req1">① フォルダの中は、フォルダを見られる人も <b class="term">階層</b></li>
            <li data-step="req2">② eng チーム全員に。出入りで文書は触らない <b class="term">グループ</b></li>
            <li data-step="req345">③ 全社公開 <b class="term">公開</b></li>
            <li data-step="req345" data-delay="0.25">④ 社外に 1 時間だけ <b class="term">期限</b></li>
            <li data-step="req345" data-delay="0.5">⑤ この人には何があっても見せない <b class="term">ブロック</b></li>
            <li data-step="req6">⑥ 自分が見られる文書の一覧 <b class="term">逆引き</b></li>
          </ul>
        </div>`,
    },

    // ================= 00 Zanzibar =================
    zanzibar: {
      title: "Zanzibar と SpiceDB",
      badge: "textbook 00",
      html: `
        <div class="lede" data-step="intro" data-step-hide="spicedb">Google も同じ問題を抱えていた</div>
        <div class="card" data-step="paper" data-step-hide="spicedb" style="max-width:1280px; margin-top:26px">
          <h3>Zanzibar (USENIX ATC 2019)</h3>
          <p>Drive・Docs・YouTube・Photos の認可を<strong>一手に引き受ける</strong> Google 社内システム。毎秒 1,000 万 check を 95%ile 10ms 以下で</p>
        </div>
        <ul class="klist" data-step="points" data-step-hide="spicedb">
          <li>認可を<b class="term">専用サービスに集約</b>する (各アプリの if 文をやめる)</li>
          <li>権限は<b class="term">「関係」のグラフ</b>として表す</li>
          <li>キャッシュが効くのに<b class="term">権限剥奪を取りこぼさない</b>仕掛けを持つ</li>
        </ul>

        <div class="lede" data-step="spicedb"><span class="accent">SpiceDB</span> — その OSS 実装</div>
        <p class="sub" data-step="spicedb">Apache-2.0 / AuthZed 社が開発 / Zanzibar 系でスキーマ言語とテスト道具が学習に向く</p>
        <div data-step="grpc" style="display:flex; align-items:center; gap:30px; margin-top:34px">
          <div class="card" style="flex:0 0 340px; text-align:center"><h3>アプリ</h3><p>判定ロジックを持たない</p></div>
          <div style="font-size:30px; color:var(--turmeric); font-weight:900; text-align:center; line-height:1.4">─ gRPC ─▶<br><span class="mono" style="font-size:25px;color:var(--ink)">Check(資源, 権限, 人)</span></div>
          <div class="card gold" style="flex:1"><h3>SpiceDB</h3>
            <p style="font-size:23px">権限の問いに答える認可データベース。持ち物は 2 つだけ</p>
            <div class="cardrow" style="margin-top:14px; gap:18px">
              <div class="card" data-step="two" style="padding:16px 20px"><h3 style="font-size:25px">スキーマ <span style="font-size:20px;color:var(--ink-dim)">型</span></h3><p style="font-size:22px">開発者が設計時に書く</p></div>
              <div class="card" data-step="two" data-delay="0.3" style="padding:16px 20px"><h3 style="font-size:25px">relationship <span style="font-size:20px;color:var(--ink-dim)">データ</span></h3><p style="font-size:22px">アプリが実行時に書き込む</p></div>
            </div>
          </div>
        </div>
        <pre class="code" data-step="check" style="max-width:1180px"><span class="c-fn">Check</span>(<span class="c-gold">document:design</span>, <span class="c-gold">view</span>, <span class="c-gold">user:bob</span>) → <span class="c-str">true</span></pre>`,
    },

    // ================= 01 ReBAC =================
    rebac: {
      title: "ReBAC — 権限はグラフの到達可能性",
      badge: "textbook 01",
      html: `
        <div class="lede" data-step="intro" data-step-hide="graph" style="font-size:42px">ロールと何が違う?</div>
        <table class="tbl" data-step="models" data-step-hide="graph" style="max-width:1500px">
          <tr><th style="width:220px">モデル</th><th style="width:420px">権限の根拠</th><th>例</th></tr>
          <tr><td class="k">ACL</td><td>資源ごとの許可リスト</td><td>この文書の閲覧者: alice, bob</td></tr>
          <tr><td class="k">RBAC</td><td>役割 (role)</td><td>「編集者」ロールの人は編集できる</td></tr>
          <tr><td class="k">ABAC</td><td>属性の論理式</td><td>部署 = 営業 かつ 等級 ≥ 3 なら閲覧可</td></tr>
          <tr class="hot"><td class="k">ReBAC</td><td><b>関係のグラフ</b></td><td>文書 ← フォルダ ← owner とたどれる人</td></tr>
        </table>
        <div class="note" data-step="explosion" data-step-hide="graph">
          RBAC で資源単位の制御をすると <span class="mono">editor_of_folder_x</span> が資源の数だけ生える — <b>ロール爆発</b>
        </div>

        <svg data-step="graph" viewBox="0 0 1560 470" style="width:100%; max-width:1560px; margin-top:36px">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#e8a93d"/>
            </marker>
            <marker id="arr-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#e8543f"/>
            </marker>
          </defs>
          <g data-step="path0">
            <rect x="40" y="18" width="640" height="64" rx="14" fill="rgba(232,169,61,0.10)" stroke="#e8a93d" stroke-width="2.5"/>
            <text x="70" y="60" font-size="30" font-weight="700" fill="#f2ede2" font-family="Noto Sans CJK JP">問い: bob は design を view できる?</text>
          </g>
          ${node(200, 170, 300, "document:design")}
          ${node(640, 170, 300, "folder:eng-docs")}
          ${node(1080, 170, 320, "group:eng#member")}
          <g class="gnode" transform="translate(1420,330)">
            <rect id="bob-box" x="-110" y="-39" width="220" height="78" rx="16" fill="#2a302b" stroke="#3d453e" stroke-width="3"/>
            <text x="0" y="10" text-anchor="middle" font-family="Noto Sans Mono CJK JP, monospace" font-size="27" fill="#f2ede2">user:bob</text>
          </g>
          <path data-draw="path1" d="M 352,150 C 410,100 470,100 486,148" fill="none" stroke="#e8a93d" stroke-width="6" marker-end="url(#arr)"/>
          <text data-step="path1" x="420" y="94" text-anchor="middle" font-size="24" fill="#e8a93d" font-family="Noto Sans Mono CJK JP">parent</text>
          <path data-draw="path2" d="M 792,150 C 850,100 910,100 926,148" fill="none" stroke="#e8a93d" stroke-width="6" marker-end="url(#arr)"/>
          <text data-step="path2" x="860" y="94" text-anchor="middle" font-size="24" fill="#e8a93d" font-family="Noto Sans Mono CJK JP">viewer</text>
          <path data-draw="path2" data-delay="0.45" d="M 1225,205 C 1290,245 1330,265 1362,296" fill="none" stroke="#e8a93d" stroke-width="6" marker-end="url(#arr)"/>
          <text data-step="path2" data-delay="0.45" x="1252" y="272" text-anchor="middle" font-size="24" fill="#e8a93d" font-family="Noto Sans Mono CJK JP">member</text>
          <g data-step="path2" data-delay="0.8">
            <rect x="-110" y="-39" width="220" height="78" rx="16" fill="rgba(147,184,88,0.18)" stroke="#93b858" stroke-width="5" transform="translate(1420,330)"/>
            <g transform="translate(1348,236) rotate(-6)">
              <rect x="-6" y="-40" width="152" height="60" rx="10" fill="rgba(147,184,88,0.14)" stroke="#93b858" stroke-width="4"/>
              <text x="70" y="4" text-anchor="middle" font-size="34" font-weight="900" fill="#93b858" font-family="Noto Sans CJK JP">YES!</text>
            </g>
          </g>
          <g data-step="reverse">
            <path d="M 1310,382 C 950,462 420,458 216,242" fill="none" stroke="#e8543f" stroke-width="5" stroke-dasharray="14 12" marker-end="url(#arr-red)"/>
            <text x="700" y="330" text-anchor="middle" font-size="26" font-weight="700" fill="#e8543f" font-family="Noto Sans CJK JP">逆向きにたどれば「見られる資源の列挙」= LookupResources</text>
          </g>
        </svg>`,
    },

    // ================= 02 スキーマ言語 =================
    schema: {
      title: "スキーマ言語",
      badge: "textbook 02 / tutorial 01-06",
      html: `
        <div class="lede" data-step="intro" data-step-hide="ops0" style="font-size:42px">世界の<span class="accent">型</span>を決める — 宣言は 3 つだけ</div>
        <div class="cardrow" data-step="three" data-step-hide="ops0" style="max-width:1560px">
          <div class="card"><h3>definition</h3><p>オブジェクトの<strong>型</strong><br><span style="font-size:22px">DB のテーブル定義に相当</span></p></div>
          <div class="card gold"><h3>relation</h3><p>持ちうる<strong>関係</strong> = データを入れる箱<br><span style="font-size:22px"><strong>名詞</strong>で命名 (viewer, owner, parent)</span></p></div>
          <div class="card green"><h3>permission</h3><p>関係から導く<strong>できること</strong> = 計算式<br><span style="font-size:22px"><strong>動詞</strong>で命名 (view, edit, share)</span></p></div>
        </div>
        <pre class="code" data-step="hello" data-step-hide="ops0" style="max-width:1000px"><span class="c-kw">definition</span> user {}

<span class="c-kw">definition</span> document {
    <span class="c-kw">relation</span> <span class="c-gold">viewer</span>: user            <span class="c-cm">// 関係の宣言 (材料)</span>
    <span class="c-kw">permission</span> <span class="c-str">view</span> = <span class="c-gold">viewer</span>     <span class="c-cm">// 権限の定義 (合成)</span>
}</pre>
        <p class="sub" data-step="naming" data-step-hide="ops0">
          <span class="mono">check document:x view user:y</span> が英文として読める命名にする
        </p>

        <div class="lede" data-step="ops0" style="font-size:44px">部品はこれで<span class="accent">全部</span></div>
        <table class="tbl" data-step="ops" style="max-width:1560px">
          <tr><th style="width:280px">部品</th><th style="width:360px">書き方</th><th>意味</th></tr>
          <tr><td class="k">union / intersection / exclusion</td><td class="mono">a + b / a & b / a - b</td><td>どちらか / 両方だけ / b を除く</td></tr>
          <tr><td class="k">arrow</td><td class="mono">parent-&gt;view</td><td>関係の先のオブジェクトで view を評価 (階層)</td></tr>
          <tr><td class="k">subject relation</td><td class="mono">group#member</td><td>グループの member <b>集合</b>を相手にする</td></tr>
          <tr><td class="k">wildcard</td><td class="mono">user:*</td><td>「user 型の全員」= 公開</td></tr>
          <tr><td class="k">caveat</td><td class="mono">user with not_expired</td><td>条件式 (CEL) 付きの関係 = 期限</td></tr>
        </table>
        <pre class="code" data-step="formula" style="max-width:1560px"><span class="c-cm">// 「viewer と、編集できる人と、親を見られる人。ただし banned は除く」</span>
<span class="c-kw">permission</span> <span class="c-str">view</span> = (<span class="c-gold">viewer</span> + <span class="c-gold">shared_viewer</span> + <span class="c-gold">edit</span> + <span class="c-gold">parent-&gt;view</span>) <span class="c-warn">- banned</span></pre>
        <div class="note ok" data-step="interface">
          アプリの check は必ず <b>permission</b> へ。relation は実装詳細、permission がインターフェース
        </div>`,
    },

    // ================= 03 relationship と Check =================
    check: {
      title: "relationship と Check の実体",
      badge: "textbook 03 / tutorial 07",
      html: `
        <div class="lede" data-step="intro" data-step-hide="walk0" style="font-size:42px">スキーマが「型」なら、relationship は<span class="accent">「行」</span></div>
        <div data-step="tuple" data-step-hide="walk0" style="margin-top:10px">
          <div class="sub" style="margin-bottom:6px">relationship 1 本 = グラフの辺 1 つ (SpiceDB 自身の datastore に保存される)</div>
          <pre class="code" style="font-size:34px; max-width:1360px"><span class="c-gold">document:design</span><span style="color:#b9b3a4">#</span><span class="c-str">viewer</span><span style="color:#b9b3a4">@</span><span class="c-warn">user:bob</span></pre>
          <div style="display:flex; max-width:1360px; padding:0 34px; font-size:24px; color:var(--ink-dim)">
            <span style="flex:5; color:var(--turmeric)">↑ 資源</span><span style="flex:3; color:var(--sage)">↑ 関係</span><span style="flex:4; color:var(--paprika)">↑ 主体</span>
          </div>
        </div>
        <div class="cardrow" data-step="division" data-step-hide="walk0" style="max-width:1360px">
          <div class="card"><h3>アプリの DB</h3><p>文書の<strong>中身</strong> (title / body)</p></div>
          <div class="card gold"><h3>SpiceDB</h3><p><strong>誰がどう関わるか</strong> (relationship) と<strong>規則</strong> (スキーマ)</p></div>
        </div>

        <div data-step="walk0" data-step-hide="apis">
          <pre class="code" style="max-width:900px; margin-top:8px"><span class="c-fn">Check</span>(<span class="c-gold">document:design</span>, <span class="c-gold">view</span>, <span class="c-gold">user:bob</span>) の中で起きること</pre>
        </div>
        <div data-step="walk1" data-step-hide="apis" style="margin-top:20px; font-size:28px; line-height:1.7">
          <div><span class="mono" style="color:var(--turmeric)">view = (viewer + shared_viewer + edit + parent-&gt;view) - banned</span> をサブ問題に分解:</div>
          <div style="margin-top:12px; display:flex; gap:16px; flex-wrap:wrap">
            <span style="border:2px solid var(--line); border-radius:12px; padding:8px 18px">viewer に bob? <b style="color:var(--paprika)">✗</b></span>
            <span style="border:2px solid var(--line); border-radius:12px; padding:8px 18px">edit? <b style="color:var(--paprika)">✗</b></span>
            <span style="border:2.5px solid var(--turmeric); border-radius:12px; padding:8px 18px">parent-&gt;view → <b style="color:var(--turmeric)">新サブ問題: folder:eng-docs の view</b></span>
          </div>
        </div>
        <div data-step="walk2" data-step-hide="apis" style="margin-top:16px; font-size:28px">
          <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap">
            <span style="border:2px solid var(--line); border-radius:12px; padding:8px 18px">folder の viewer = <span class="mono">group:eng#member</span></span>
            <span style="color:var(--turmeric); font-weight:900">→ member を展開 →</span>
            <span style="border:2.5px solid var(--sage); border-radius:12px; padding:8px 18px; color:var(--sage); font-weight:900">bob に届いた</span>
            <span class="stamp">true</span>
          </div>
        </div>
        <div class="note ok" data-step="cache" data-step-hide="apis">
          サブ問題の答えは revision 付きで<b>キャッシュ</b>され、同じフォルダの別文書の check で再利用される — スケールの根拠
        </div>

        <table class="tbl" data-step="apis" style="max-width:1560px">
          <tr><th style="width:420px">API</th><th style="width:520px">問い</th><th>使いどころ</th></tr>
          <tr><td class="k">CheckPermission</td><td>この人はこの資源に X できる?</td><td>リクエストの認可判定</td></tr>
          <tr class="hot"><td class="k">LookupResources</td><td>この人が X できる<b>資源は?</b></td><td><b>一覧画面</b> (逆引き)</td></tr>
          <tr><td class="k">LookupSubjects</td><td>この資源に X できる<b>人は?</b></td><td>共有ダイアログ、監査</td></tr>
        </table>
        <div class="note" data-step="apis" data-delay="0.4">
          「全件取得 → 1 件ずつ check」の <b>N+1</b> に落ちないこと。一覧は LookupResources に聞き、ID でアプリ DB から引く
        </div>`,
    },

    // ================= 04 zed =================
    zed: {
      title: "zed validate — スキーマのテスト",
      badge: "textbook 04",
      html: `
        <div class="lede" data-step="intro" style="font-size:42px">書いたスキーマ、<span class="accent">合っているか</span>どう確かめる?</div>
        <div data-step="validate">
          <pre class="code" style="max-width:900px"><span class="c-cm">$</span> <span class="c-fn">zed validate</span> validate.yaml   <span class="c-str">✓ passed</span></pre>
          <p class="sub">サーバ無しで「スキーマ + データ + 期待値」を数十 ms で検証。教材の全章がこの形</p>
        </div>
        <pre class="code" data-step="yaml" data-step-hide="explain" style="max-width:1200px; font-size:25px"><span class="c-gold">schemaFile</span>: schema.zed
<span class="c-gold">relationships</span>: |-
  document:doc1#reader@user:alice
<span class="c-gold">assertions</span>:
  <span class="c-str">assertTrue</span>:
    - "document:doc1#view@user:alice"
  <span class="c-warn">assertFalse</span>:
    - "document:doc1#edit@user:alice"   <span class="c-cm"># ← 事故を検知する側</span></pre>
        <div class="note" data-step="assertfalse" data-step-hide="explain">
          価値が高いのは <b>assertFalse</b>。「公開しすぎ」「剥奪漏れ」はこちらが検知する
        </div>
        <pre class="code" data-step="explain" style="max-width:1200px; font-size:25px"><span class="c-cm">$</span> <span class="c-fn">zed permission check</span> document:design view user:bob <span class="c-gold">--explain</span>
<span class="c-str">✓</span> document:design view
  └─ folder:eng-docs view
      └─ group:eng member
          └─ <span class="c-str">user:bob ✓</span>   <span class="c-cm"># 「なぜ許可か」= この経路</span></pre>
        <div class="note ok" data-step="pair">
          <b>schema.zed の隣に必ず validate.yaml</b>。スキーマ 1 行の変更はデプロイなしで全アプリの権限を変える — テストと共に動かす
        </div>`,
    },

    // ================= 06 New Enemy =================
    newenemy: {
      title: "New Enemy 問題と ZedToken",
      badge: "textbook 06 / tutorial 08",
      html: `
        <div class="lede" data-step="intro" data-step-hide="zt0" style="font-size:44px">権限<span style="color:var(--paprika)">「剥奪」</span>の取りこぼしは事故になる</div>
        <svg data-step="quantize" data-step-hide="zt0" viewBox="0 0 1560 270" style="width:100%; max-width:1560px; margin-top:14px">
          <rect x="60" y="56" width="460" height="74" rx="10" fill="rgba(232,169,61,0.07)" stroke="#3d453e" stroke-width="2"/>
          <rect x="530" y="56" width="460" height="74" rx="10" fill="rgba(232,169,61,0.14)" stroke="#e8a93d" stroke-width="2.5"/>
          <rect x="1000" y="56" width="460" height="74" rx="10" fill="rgba(232,169,61,0.07)" stroke="#3d453e" stroke-width="2"/>
          <text x="290" y="102" text-anchor="middle" font-size="26" fill="#b9b3a4" font-family="Noto Sans CJK JP">revision R1 の窓</text>
          <text x="760" y="102" text-anchor="middle" font-size="26" fill="#e8a93d" font-family="Noto Sans CJK JP">R2 の窓 (5 秒)</text>
          <text x="1230" y="102" text-anchor="middle" font-size="26" fill="#b9b3a4" font-family="Noto Sans CJK JP">R3 の窓</text>
          <line x1="60" y1="180" x2="1500" y2="180" stroke="#3d453e" stroke-width="3"/>
          <text x="60" y="252" font-size="25" fill="#b9b3a4" font-family="Noto Sans CJK JP">量子化: 窓の中の check は同じ revision で評価 → キャッシュが効く</text>
          <g data-step="stale">
            <path d="M 700,56 L 700,26" stroke="#93b858" stroke-width="5"/>
            <text x="700" y="18" text-anchor="middle" font-size="24" fill="#93b858" font-family="Noto Sans CJK JP">書き込み</text>
            <circle cx="880" cy="180" r="9" fill="#e8543f"/>
            <text x="880" y="214" text-anchor="middle" font-size="24" fill="#e8543f" font-family="Noto Sans CJK JP">直後の check</text>
            <path data-draw="stale" d="M 869,158 C 780,150 640,150 553,158" fill="none" stroke="#e8543f" stroke-width="4.5" stroke-dasharray="10 8" marker-end="url(#arr-red2)"/>
            <text x="400" y="214" text-anchor="middle" font-size="21" fill="#e8543f" font-family="Noto Sans CJK JP">窓の頭 (= 書き込み前) の世界で評価されうる</text>
          </g>
          <defs>
            <marker id="arr-red2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#e8543f"/>
            </marker>
          </defs>
        </svg>
        <div data-step="ne0" data-step-hide="zt0" style="margin-top:10px">
          <span class="stamp bad" style="font-size:32px">New Enemy 問題</span>
        </div>
        <div class="cardrow" data-step="ne" data-step-hide="zt0" style="max-width:1560px; margin-top:16px">
          <div class="card"><h3>① 剥奪</h3><p>alice が bob をフォルダから外す</p></div>
          <div class="card" data-step="ne" data-delay="0.35"><h3>② 追加</h3><p>bob に見せたくない<strong>新文書</strong>をそのフォルダに置く</p></div>
          <div class="card red" data-step="ne" data-delay="0.7"><h3>③ 事故</h3><p>bob の check が<strong>剥奪前の revision</strong> で評価され、<strong>新文書が見える</strong></p></div>
        </div>

        <div class="card gold" data-step="zt" style="max-width:1360px; margin-top:8px">
          <h3>ZedToken — 「この時点以降で評価して」という栞</h3>
          <p>すべての書き込みが返す。<span class="mono">WriteRelationships → <b style="color:var(--turmeric)">ZedToken</b></span> を読みに添えると「<strong>少なくともこの書き込みを含む世界で評価せよ</strong>」</p>
        </div>
        <div data-step="pattern" style="margin-top:18px; display:flex; gap:34px; align-items:center; max-width:1560px">
          <table class="tbl" style="flex:1; margin-top:0">
            <tr><th>id</th><th>title</th><th style="color:var(--turmeric)">zedtoken ← 1 列足す</th></tr>
            <tr><td class="mono">design</td><td>設計メモ</td><td class="mono" style="color:var(--turmeric)">GhUKEzE3NT…</td></tr>
          </table>
          <div style="font-size:29px; line-height:1.6; flex:1">ACL を変えたら token を保存 →<br>その文書の check は<br><span class="mono" style="color:var(--turmeric)">at_least_as_fresh(token)</span></div>
        </div>
        <table class="tbl" data-step="four" style="max-width:1560px">
          <tr><th style="width:430px">consistency</th><th>意味と使いどころ</th></tr>
          <tr><td class="k mono">minimize_latency</td><td>既定。量子化された revision でよい — 大半の読み</td></tr>
          <tr class="hot"><td class="k mono">at_least_as_fresh</td><td><b>定石</b>。資源に保存した token 以上に新しい世界で</td></tr>
          <tr><td class="k mono">at_exact_snapshot / fully_consistent</td><td>監査の再現 / 常に最新 (キャッシュを捨てる。高くつく)</td></tr>
        </table>`,
    },

    // ================= 07 + 歩き方 =================
    outro: {
      title: "アプリへの組み込みと教材の歩き方",
      badge: "textbook 07 / app",
      html: `
        <div class="lede" data-step="intro" data-step-hide="six" style="font-size:42px">応用アプリ <span class="accent">docshare</span> を解剖する</div>
        <div data-step="docshare" data-step-hide="six">
          <div style="display:flex; gap:26px; align-items:center; margin-top:14px">
            <div class="card" style="flex:0 0 300px; text-align:center"><h3>handler</h3><p style="font-size:22px">権限の if 文なし</p></div>
            <div style="font-size:28px; color:var(--turmeric); font-weight:900">─ check ─▶</div>
            <div class="card gold" style="flex:0 0 330px; text-align:center"><h3>SpiceDB</h3><p style="font-size:22px">可否はすべてここに聞く</p></div>
            <div class="card" style="flex:1"><h3>store</h3><p style="font-size:22px">文書の行に <b style="color:var(--turmeric)">ZedToken 列</b>。一覧は <span class="mono">LookupResources</span></p></div>
          </div>
          <p class="sub" data-step="docshare" data-delay="0.4">応用アプリ <span class="mono">app/</span> (docshare) がこの形。統合テストは <span class="mono">spicedb serve-testing</span> で 1 本 0.5 秒</p>
        </div>
        <table class="tbl" data-step="six" data-step-hide="map" style="max-width:1400px">
          <tr><th style="width:360px">冒頭の要求</th><th>スキーマでの答え</th></tr>
          <tr><td class="k">① 階層</td><td class="mono">parent-&gt;view (arrow)</td></tr>
          <tr><td class="k">② グループ</td><td class="mono">group#member</td></tr>
          <tr><td class="k">③ 公開 / ④ 期限 / ⑤ ブロック</td><td class="mono">user:* / caveat / - banned</td></tr>
          <tr><td class="k">⑥ 逆引き</td><td class="mono">LookupResources</td></tr>
        </table>
        <div class="cardrow" data-step="map" data-step-hide="credits" style="max-width:1560px; margin-top:16px">
          <div class="card gold"><h3>tutorial/ 8 章 <span style="font-size:21px;color:var(--ink-dim)">手</span></h3><p>1 章 1 概念。<span class="mono">zed validate</span> で答え合わせ</p></div>
          <div class="card"><h3>textbook 8 章 <span style="font-size:21px;color:var(--ink-dim)">頭</span></h3><p>概念を順番に、体系立てて</p></div>
          <div class="card green"><h3>app/ docshare <span style="font-size:21px;color:var(--ink-dim)">応用</span></h3><p>実コードのどこに座るかを読む</p></div>
        </div>
        <pre class="code" data-step="start" data-step-hide="credits" style="max-width:1200px"><span class="c-cm">$</span> cd tutorial/01_hello_schema
<span class="c-cm">$</span> <span class="c-fn">zed validate</span> validate.yaml     <span class="c-cm"># まずはここから</span></pre>
        <div data-step="credits" style="text-align:center; margin-top:130px">
          <div style="font-size:46px; font-weight:900; letter-spacing:0.04em">SpiceDB をゼロから</div>
          <p class="sub" style="margin-top:22px; font-size:30px">
            音声: <b style="color:var(--ink)">VOICEVOX:ずんだもん</b> / <b style="color:var(--ink)">VOICEVOX:四国めたん</b><br>
            キャラクター: オリジナル (ボトル博士 / チリちゃん)<br>
            教材: <span class="mono">spicedb-tutorial-2026-09-07</span> — tutorial・textbook・docshare
          </p>
        </div>`,
    },
  };
})();
