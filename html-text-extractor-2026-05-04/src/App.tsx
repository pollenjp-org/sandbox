import { useEffect, useMemo, useState } from "react";
import { extractText } from "./extract";

const SAMPLE = `<!doctype html>
<html>
  <head>
    <title>Sample</title>
    <style>body { color: red; }</style>
  </head>
  <body>
    <h1>Hello</h1>
    <p>これは <strong>サンプル</strong> です。</p>
    <ul>
      <li>item 1</li>
      <li>item 2</li>
    </ul>
    <script>console.log("ignored");</script>
  </body>
</html>`;

export const App = () => {
  const [input, setInput] = useState<string>(SAMPLE);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const output = useMemo(() => extractText(input), [input]);

  useEffect(() => {
    if (copyState === "idle") return;
    const id = setTimeout(() => setCopyState("idle"), 1500);
    return () => clearTimeout(id);
  }, [copyState]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output);
      } else {
        const ta = document.createElement("textarea");
        ta.value = output;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>HTML Text Extractor</h1>
        <p className="lead">
          左に HTML を貼り付けると、右にテキストのみを抽出して表示します。
        </p>
      </header>

      <div className="panes">
        <section className="pane">
          <div className="pane-header">
            <span className="pane-title">入力 (HTML)</span>
            <button
              type="button"
              className="btn"
              onClick={() => setInput("")}
              disabled={!input}
            >
              クリア
            </button>
          </div>
          <div className="pane-body">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder="ここに HTML を貼り付け..."
            />
          </div>
        </section>

        <section className="pane">
          <div className="pane-header">
            <span className="pane-title">出力 (Text)</span>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCopy}
                disabled={!output}
              >
                Copy
              </button>
              {copyState !== "idle" && (
                <span className="copy-state">
                  {copyState === "copied" ? "コピーしました" : "失敗"}
                </span>
              )}
            </div>
          </div>
          <div className="pane-body">
            <textarea value={output} readOnly spellCheck={false} />
          </div>
        </section>
      </div>
    </div>
  );
};
