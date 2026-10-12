# Android 測試 APK

GitHub Actions 的 **Android playtest** 會在 PR、main push 及手動執行時建置 ARM64 APK。Windows playtest 保持獨立。下載該次執行的 `ProjectRondo-Android-arm64-test-…` artifact，解壓縮後將 `ProjectRondo-Android-arm64-test.apk` 傳到 Android 裝置安裝。系統可能要求允許檔案管理器安裝未知來源應用程式。產物保留 14 天。

- Android 7.0（API 24）以上、ARM64 裝置；實際 GPU/WebView 相容性仍須實機測試。
- 沿用目前遊戲內容、悠太翼深藍 Logo 圖示與橫向畫面，支援左右橫放。
- 正式 Android ID：`com.yuutatsubasa.projectrondo`。
- CI 測試 ID：`com.yuutatsubasa.projectrondo.debug`，可與未來正式版並存，存檔各自獨立。
- APK 內含遊戲資產，不依賴 Vite 開發伺服器。
- 手把仍透過 Android WebView 的 Gamepad API；APK 建置成功不等於所有手把皆支援，可用設定中的控制器診斷確認。

## 測試簽章與正式簽章

**正式簽章版只在本地電腦建置。CI 不讀取、不生成、不上傳正式金鑰，也不建置 release/AAB。**

`tools/android/playtest.keystore` 是刻意公開的測試金鑰，alias `androiddebugkey`，store/key password 都是 `android`。它只配置在 Gradle 的 `debug` signingConfig。穩定的測試簽章讓新測試 APK 可以覆蓋舊版而保留資料。任何人都能用此公開金鑰簽署 APK，因此只安裝自己信任的 CI 產物；絕對不能拿此金鑰簽正式版。

未來本地 release 必須使用另外保管的私人 keystore；不要將私人金鑰、密碼或 keystore.properties 提交到 Git。CI 不具備正式發行功能。

## 本機重現測試建置

安裝 Java 17、Android SDK platform 36 / build-tools 36.0.0、NDK 28.2.13676358、Rust `aarch64-linux-android` target，設定 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME` 後執行：

```sh
pnpm install --frozen-lockfile
pnpm tauri android init --ci --skip-targets-install
pnpm tauri icon tools/android/icon.json --output .superpowers/android-icons
node tools/android/prepare.mjs
pnpm tauri android build --ci --debug --apk --target aarch64
```

APK 位於 `src-tauri/gen/android/app/build/outputs/apk/`。`src-tauri/gen/` 是忽略的產物，不用手動提交生成工程。`prepare.mjs` 可重複執行，僅調整 MainActivity 的橫向設定、圖示與 debug 簽章，不寫 release 簽章。

CI 同時驗證 LFS 已還原、型別、測試、前端正式產物、APK 簽章、debug 套件 ID 和 ARM64 ABI。實機尚需驗證啟動、NEW GAME、觸控、手把、音訊及暫停／恢復。
