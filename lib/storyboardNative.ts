// lib/storyboardNative.ts
//
// Native twin of the web `generateStoryboard`: builds ONE small JPEG holding a
// grid of low-res frames, using the exact same layout (storyboardLayout) so the
// player and both clients agree. Frames come from the picked LOCAL file via
// expo-video-thumbnails; they're cropped to the 135x240 cell and stitched in
// pure JS (jpeg-js) — no canvas needed. Best-effort: callers treat a failure
// as "no scrub preview", the episode still saves.

import { Buffer } from "buffer";
import jpeg from "jpeg-js";
import { File } from "expo-file-system";
import { SB_FRAME_H, SB_FRAME_W, storyboardLayout } from "@/lib/storyboard";

// jpeg-js needs a global Buffer, which React Native doesn't ship.
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

type ThumbModule = typeof import("expo-video-thumbnails");
let Thumbs: ThumbModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Thumbs = require("expo-video-thumbnails") as ThumbModule;
} catch {
  Thumbs = null;
}

export const canGenerateStoryboard = () => Thumbs !== null;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// Average a 2x2 grid of samples per output pixel: cheap and avoids the worst
// aliasing when 720x1280 frames shrink to 135x240.
function drawCover(
  src: { data: Uint8Array | Buffer; width: number; height: number },
  dst: Uint8Array,
  dstW: number,
  cellX: number,
  cellY: number
) {
  const dstRatio = SB_FRAME_W / SB_FRAME_H;
  let sx = 0;
  let sy = 0;
  let sw = src.width;
  let sh = src.height;
  if (src.width / src.height > dstRatio) {
    sw = src.height * dstRatio;
    sx = (src.width - sw) / 2;
  } else {
    sh = src.width / dstRatio;
    sy = (src.height - sh) / 2;
  }
  const stepX = sw / SB_FRAME_W;
  const stepY = sh / SB_FRAME_H;
  for (let y = 0; y < SB_FRAME_H; y++) {
    for (let x = 0; x < SB_FRAME_W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < 2; j++) {
        const py = Math.min(src.height - 1, Math.floor(sy + (y + 0.25 + j * 0.5) * stepY));
        for (let i = 0; i < 2; i++) {
          const px = Math.min(src.width - 1, Math.floor(sx + (x + 0.25 + i * 0.5) * stepX));
          const o = (py * src.width + px) * 4;
          r += src.data[o];
          g += src.data[o + 1];
          b += src.data[o + 2];
        }
      }
      const d = ((cellY + y) * dstW + (cellX + x)) * 4;
      dst[d] = r >> 2;
      dst[d + 1] = g >> 2;
      dst[d + 2] = b >> 2;
      dst[d + 3] = 255;
    }
  }
}

export async function generateStoryboardNative(
  uri: string,
  durationSeconds: number,
  onProgress?: (fraction: number) => void
): Promise<ArrayBuffer> {
  if (!Thumbs) throw new Error("Video thumbnails aren't available in this build");
  const L = storyboardLayout(durationSeconds);
  const W = L.cols * L.frameW;
  const H = L.rows * L.frameH;
  const canvas = new Uint8Array(W * H * 4);
  for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255; // black, opaque

  for (let i = 0; i < L.count; i++) {
    const timeMs = Math.min(i * L.interval, Math.max(0, durationSeconds - 0.1)) * 1000;
    const thumb = await Thumbs.getThumbnailAsync(uri, { time: Math.round(timeMs), quality: 0.3 });
    try {
      const bytes = await new File(thumb.uri).bytes();
      const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
      drawCover(img, canvas, W, (i % L.cols) * L.frameW, Math.floor(i / L.cols) * L.frameH);
    } finally {
      try {
        new File(thumb.uri).delete();
      } catch {
        /* temp file; the OS clears the cache eventually */
      }
    }
    onProgress?.((i + 1) / L.count);
    await tick(); // let the UI thread breathe between frames
  }

  const encoded = jpeg.encode({ data: canvas, width: W, height: H }, 72);
  const out = encoded.data as Uint8Array;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
