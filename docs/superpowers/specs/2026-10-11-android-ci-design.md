# Android CI playtest design

Approved scope: ARM64 installable test APKs on pull requests, main pushes and manual workflow runs. Use Tauri's Android shell with the existing bundled game, portrait icon and landscape presentation. Android base ID is `com.yuutatsubasa.projectrondo`; debug builds retain `.debug` so they cannot overwrite a future local release.

CI uses only a public Android debug signing identity. Official release builds and private release signing keys remain on the developer's local computer, never in CI. A stable public debug key allows test APK upgrades without uninstalling saves. It must never sign a release.

Generate the Android project with the pinned Tauri CLI, then apply deterministic landscape/icon/debug-signing customization. Keep generated Gradle outputs untracked. The workflow checks LFS assets, frontend types/tests/build output, builds ARM64, verifies the APK signature and package metadata, and uploads the APK for 14 days. Windows CI is unchanged.

Validation includes local generator and preparation runs, script regression checks, and a real GitHub Actions build producing a signed APK. Physical Android rendering/controller behavior remains a device test.
