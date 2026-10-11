# Android / iiSU

Open the deployed **HTTPS** game URL in Android Chrome. From Chrome's menu choose **Add to Home screen → Install**, or enter the game menu and use **安裝遊戲** when Chrome offers installation. The icon uses 悠太翼's portrait. The app requests landscape standalone display; the browser/device ultimately decides orientation behavior.

This is online-first: models and music require a connection. Only the connection-help page and its small icon are cached. Installation does not download the entire game. Browser-origin saves remain in that origin; localhost, preview URLs and production have different saves.

Updates wait until all old tabs close, or until you choose **新版本 · 更新並重新載入** in the main menu. A game in progress is never automatically reloaded, even when a different tab applies an update.

For iiSU, install in Chrome first, then check iiSU's Android app list and add Project Rondo to its home page. WebAPK discovery depends on the device/launcher and has not been verified on a physical device here. A browser shortcut may not appear as an installed Android app.

## Controller troubleshooting

Use HTTPS: opening a LAN URL such as `http://192.168.x.x:5173` is not a secure context on the phone. Pair/connect the controller, tap the game once and press a controller button; browsers can hide controllers until interaction. Release buttons/sticks before trying again. In **Settings → Controls**, the connection panel reports whether Chrome exposes the device, its mapping, and live button/axis values. Unknown mappings are reported rather than silently treated as an Xbox layout. This panel is local only and does not transmit diagnostics.

## Development

Service workers register only in production builds in secure web contexts, not Vite dev or Tauri. Run `pnpm build` and `pnpm exec vite preview` to test. `sw.js` is generated with a digest of bundle/offline-shell contents. Netlify `_headers` disables stale HTTP caching for the worker and manifest. Real Android installation, controller hardware and iiSU still need device testing.

## Verification for this change

- 1,089 tests passed; typecheck and production build passed.
- Production build verifier checks lazy session CSS plus emitted manifest, PNG dimensions and worker digest.
- Browser verified offline launch with the preview server stopped, reconnection, waiting-update button, and explicit update returning to the title.
- UI visually checked at 960×540 for settings/HUD/AVG/results and in an 844×390 iframe for the mission introduction. Additional viewport dimensions have unit coverage.
