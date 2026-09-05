/**
 * Whether this engine honours VP9's alpha channel.
 *
 * `canPlayType` cannot answer this: WKWebView reports it can play VP9 in WebM, plays it, and then
 * ignores the alpha — so a portrait shipped as VP9 would render its removed background as an opaque
 * black rectangle over the scene. The only reliable answer is to decode a frame and look at it.
 *
 * The probe is a 2x2, one-frame, fully transparent VP9 clip of about 600 bytes, kept separate from
 * the real portrait so the answer arrives before anything large is fetched. A false answer costs
 * bytes (the WebP fallback is ~6x the WebM) and never correctness, so every failure path — no
 * canvas, a decode error, a frame that never arrived, a slow or hung load — resolves to `false`.
 */
const PROBE_URL = '/portraits/vp9-alpha-probe.webm';
const TIMEOUT_MS = 2000;

let cached: Promise<boolean> | undefined;

function probe(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const timer = setTimeout(() => finish(false), TIMEOUT_MS);
    video.addEventListener('error', () => { clearTimeout(timer); finish(false); });
    video.addEventListener('loadeddata', () => {
      clearTimeout(timer);
      try {
        // An engine that decodes nothing must not read as one that decoded transparency. `drawImage`
        // is specified to return silently when the source has no intrinsic size or no current frame,
        // so a canvas left as it was found is the shape of a failed decode -- and a canvas found
        // transparent would answer `true`, enabling VP9 on exactly the engines the probe excludes.
        // Painting it opaque first inverts that: whatever this cannot sample stays opaque, and only
        // a frame that really arrived can turn the pixel transparent.
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (!canvas.width || !canvas.height) return finish(false);
        const context = canvas.getContext('2d', { willReadFrequently: false });
        if (!context) return finish(false);
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return finish(false);
        // `copy` rather than the default `source-over`, or a transparent frame drawn onto the opaque
        // fill would composite to opaque and every engine would fail.
        context.globalCompositeOperation = 'copy';
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0);
        // Every pixel of the probe is fully transparent. An engine that drops alpha paints it
        // opaque, so a non-zero alpha here is the answer -- whatever the colour channels say.
        finish(context.getImageData(0, 0, 1, 1).data[3] === 0);
      } catch {
        finish(false); // a tainted canvas or a blocked read is still "do not use VP9"
      }
    });

    video.src = PROBE_URL;
    // Some engines decode no frame until playback starts; the clip is 0.1s and muted.
    // `play()` predates its own promise -- older WebKit and jsdom return undefined -- so the result
    // is wrapped rather than chained. Rejecting here would poison the cache with a promise that
    // never resolves either way, and the caller would wait for an answer that cannot arrive.
    void Promise.resolve(video.play()).catch(() => {});
  });
}

/**
 * Cached across the session: the answer cannot change while the page is open.
 *
 * The `catch` is structural rather than defensive padding: callers upgrade to VP9 only on `true`,
 * so a rejection has no sensible handling at the call site, and one throwing line inside the probe
 * would otherwise turn a cheap wrong answer into a hung one.
 */
export const supportsVp9Alpha = (): Promise<boolean> => (cached ??= probe().catch(() => false));
