# AVG idle portrait replacement design

Approved scope: replace the AVG dialogue portrait with `C:/Users/User/Downloads/magnific_video-background-removal_UPnNKPTwny.webm`. Keep the existing portrait positioning, loop behavior, VP9-alpha capability detection, and reduced-motion still fallback. The 3D model is independent.

Regenerate the three existing knight portrait assets with the documented pipeline: 900px height, 12fps, VP9 CRF34, animated WebP quality35, still WebP quality90. Decode VP9 with libvpx-vp9 so alpha survives; strip audio. Preserve the external original and record its hash. Check eye/face quality, transparent boundaries, loop seam, playback and both fallback paths.

Repair the two existing asset-test tooling failures now directly in scope: ffprobe frame counting must not pass ffmpeg-only codec selection, and animated WebP alpha must be decoded with sharp (already installed). Keep actual decoded pixel checks rather than trusting container alpha metadata.
