{
  description = "SpiceDB を 1 から理解するためのチュートリアルと応用アプリの依存";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;

      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = lib.genAttrs systems;
    in
    {
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShellNoCC {
            packages = [
              pkgs.spicedb # 認可サーバ本体 (spicedb serve / serve-testing)
              pkgs.spicedb-zed # クライアント CLI (zed validate / zed permission check など)
              pkgs.go_1_27 # 応用アプリ (app/)。authzed-go v1.10 が go 1.27 を要求する
              pkgs.jq # walkthrough script の JSON 整形
              pkgs.curl # デモで HTTP API を叩く
            ];
            # go.mod の toolchain 指定でネットから toolchain を拾わせない。
            # 版を上げたくなったら nixpkgs 側 (上の go_1_27) を上げる。
            shellHook = ''
              export GOTOOLCHAIN=local
            '';
          };
        }
      );
    };
}
