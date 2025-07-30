```bash
mkdir new-proj
cd new-proj
```

```bash
mise use rust@latest
mise use cargo-binstall@latest
mise use cargo:cargo-generate@latest
# rust@1.88.0
# cargo-binstall@1.14.2
# cargo:cargo-generate@0.23.4
```

```bash
cargo generate --path ../sample-template --init --overwrite
```

```plaintext
 Project Name: new-proj
 Destination: /home/pollenjp/ghq/github.com/pollenjp-org/sandbox/cargo-generate-hello-world-2025-07-30/new-proj ...
 project-name: new-proj ...
 Generating template ...
[1/6]   Done: .gitignore
[2/6]   Done: Cargo.lock
[3/6]   Done: Cargo.toml
[4/6]   Done: mise.toml
[5/6]   Done: src/main.rs                                                                                                                              [6/6]   Done: src                                                                                                                                       Moving generated files into: `/home/pollenjp/ghq/github.com/pollenjp-org/sandbox/cargo-generate-hello-world-2025-07-30/new-proj`...
```

Run in the new project.

```bash
mise trust
mise install
cargo run
```
