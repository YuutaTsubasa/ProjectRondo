# 3D title portrait and Loading composition

Approved direction: both the main menu and Loading use the current playable Yuuta model. Keep the illustrated coastal city background. Main menu uses a right-side three-quarter standing portrait; Loading uses a left-side head/shoulder close-up, blue-white diagonal framing, small upper-left logo and a bottom-right indeterminate loading rail. Preserve the white PRESS ANY KEY reveal and five menu entries.

Use a separate transparent Babylon scene, with the same PLAYER_MODEL URL, material adapter, Idle clip and blink morph as gameplay. No physics, movement bindings or pointer lock. The portrait persists between menu and Loading, changing its camera framing. Lazy-import its engine module; preload behind the white title. Scene/engine/listeners are released on gameplay entry and unmount, including late asynchronous completions. Hidden documents and reduced-motion preferences suspend animation; render a still pose for reduced motion. Illustration remains a fallback on unsupported WebGL or model failure. No invented loading percentage, no extra forced loading delay.

Verify scene configuration, lifecycle cancellation, paused/reduced-motion rendering, loading routing and accessibility, actual desktop/mobile framing, production build and typecheck. Scope excludes replacing the city illustration or changing gameplay model data.
