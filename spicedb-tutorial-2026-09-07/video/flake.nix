{
  description = "教材解説動画の生成パイプライン (VOICEVOX / Chromium / ffmpeg) の依存";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    # voicevox-engine は unstable だと python3.14 の pyworld が壊れていて
    # ビルドできない (ADR 003)。安定チャンネル nixos-26.05 の revision を直接 pin する
    # (flake-lock-age が unstable 以外を扱えないため手動 pin。7 日遅延は満たすこと:
    #  この revision は 2026-08-30 公開)。
    nixpkgs-voicevox.url = "github:NixOS/nixpkgs/567e2ac2d51cc67054907460c0dee4793c4b34f7";
  };

  outputs =
    { nixpkgs, nixpkgs-voicevox, ... }:
    let
      inherit (nixpkgs) lib;

      # chromium が nixpkgs では Linux のみのため darwin は含めない
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;
    in
    {
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          # voicevox-onnxruntime (と音声モデル) が unfree 扱いなので、
          # voicevox 系に限って許可する
          vvPkgs = import nixpkgs-voicevox {
            inherit system;
            config.allowUnfreePredicate =
              pkg:
              builtins.elem (lib.getName pkg) [
                "voicevox-engine"
                "voicevox-core"
                "voicevox-onnxruntime"
                "voicevox-models"
                "voicevox-resource"
              ];
          };
          # 素の WSL2 は日本語フォントが 0 個で Chromium の描画が豆腐になる。
          # makeFontsConf は実環境のフォントを残したまま store のフォントを足す
          fontsConf = pkgs.makeFontsConf {
            fontDirectories = [
              pkgs.noto-fonts-cjk-sans # 日本語グリフ
              pkgs.noto-fonts-color-emoji # 絵文字
              pkgs.liberation_ttf # Arial / Times 等のメトリック互換
            ];
          };
        in
        {
          default = pkgs.mkShellNoCC {
            packages = [
              pkgs.nodejs_24 # tools/*.mjs (npm 依存ゼロ)
              pkgs.ffmpeg # フレーム列 + wav → mp4
              pkgs.chromium # page/ の撮影 (CDP)
              vvPkgs.voicevox-engine # 音声合成 HTTP サーバ
            ];
            shellHook = ''
              export CHROMIUM_BIN="${pkgs.chromium}/bin/chromium"
              export FONTCONFIG_FILE="${fontsConf}"
              export VOICEVOX_ENGINE_BIN="${vvPkgs.voicevox-engine}/bin/voicevox-engine"
            '';
          };
        }
      );
    };
}
