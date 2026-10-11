# Android CI Playtest Implementation Plan

**Goal:** Produce installable ARM64 Android test APKs from GitHub Actions.
**Architecture:** Android-specific Tauri config, generated native project, a deterministic preparation script, and independent Android workflow. Official release signing stays local.
**Tech Stack:** Tauri 2, Rust, Java 17, Android SDK/NDK, Gradle, pnpm, GitHub Actions.

- [ ] Add Android config with `com.yuutatsubasa.projectrondo`; run `pnpm tauri android init --ci --skip-targets-install` to inspect the generated project.
- [ ] Add `tools/android/prepare.mjs`: set sensorLandscape, copy generated portrait icons, and configure a public test-only debug key. Fail when expected generated files are absent.
- [ ] Add preparation regression tests for repeatability, missing templates and release-signing isolation. Generate a public debug-only keystore with standard Android debug credentials.
- [ ] Add `.github/workflows/android-playtest.yml`: checkout LFS, pnpm 11/Node 24, Java 17, Android SDK/NDK, Rust ARM64, frontend checks, init/prepare/build `--debug --apk --target aarch64 --ci`, APK validation and upload.
- [ ] Document download/install, debug package ID, local build steps and local-only release signing in `docs/android-playtest.md`.
- [ ] Run targeted tests, typecheck, frontend build verification; push a PR and verify a real Android CI artifact. Inspect APK metadata/signature from the produced package.
