// lib/mp4Info.ts
//
// Reads what the upload screen needs straight from the picked file's MP4/MOV
// boxes — duration, display size (rotation applied) and whether the `moov`
// index comes before the media data ("faststart"). Reading the bytes ourselves
// means the checks don't depend on what a particular phone's picker reports
// or on any re-encoding it may do. Only the box headers and the (small) moov
// box are read, never the whole file.

import { File } from "expo-file-system";

export type Mp4Info = {
  size: number;
  duration: number | null; // seconds
  width: number | null; // display width (rotation applied)
  height: number | null;
  // true: moov first (streams well) · false: moov after mdat · null: unknown
  fastStart: boolean | null;
};

const MAX_MOOV_BYTES = 32 * 1024 * 1024;

type Reader = { size: number; read: (offset: number, length: number) => Uint8Array };

function openReader(uri: string): { reader: Reader; close: () => void } {
  const file = new File(uri);
  const handle = file.open();
  const size = handle.size ?? file.size ?? 0;
  return {
    reader: {
      size,
      read: (offset, length) => {
        handle.offset = offset;
        return handle.readBytes(Math.min(length, Math.max(0, size - offset)));
      },
    },
    close: () => handle.close(),
  };
}

const fourcc = (v: DataView, o: number) =>
  String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

function u64(v: DataView, o: number) {
  return v.getUint32(o) * 2 ** 32 + v.getUint32(o + 4);
}

// Child boxes of `buf[start, end)`.
function* boxes(v: DataView, start: number, end: number) {
  let o = start;
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    const type = fourcc(v, o + 4);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) return;
      size = u64(v, o + 8);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) return;
    yield { type, start: o + header, end: o + size };
    o += size;
  }
}

function parseMoov(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let duration: number | null = null;
  let width: number | null = null;
  let height: number | null = null;

  // moov is the root here: walk moov → trak → tkhd.
  const root = [...boxes(v, 0, bytes.byteLength)].find((b) => b.type === "moov");
  if (root) {
    for (const child of boxes(v, root.start, root.end)) {
      if (child.type === "mvhd") {
        const ver = v.getUint8(child.start);
        const timescale = v.getUint32(child.start + (ver === 1 ? 20 : 12));
        const dur = ver === 1 ? u64(v, child.start + 24) : v.getUint32(child.start + 16);
        if (timescale > 0) duration = dur / timescale;
      } else if (child.type === "trak" && width === null) {
        for (const t of boxes(v, child.start, child.end)) {
          if (t.type !== "tkhd") continue;
          const ver = v.getUint8(t.start);
          // version 0: …duration(4) reserved(8) layer(2) group(2) volume(2) reserved(2) matrix(36) w(4) h(4)
          const matrix = t.start + (ver === 1 ? 4 + 8 + 8 + 4 + 4 + 8 : 4 + 4 + 4 + 4 + 4 + 4) + 8 + 2 + 2 + 2 + 2;
          const w = v.getUint32(matrix + 36) / 65536;
          const h = v.getUint32(matrix + 40) / 65536;
          if (w > 0 && h > 0) {
            const a = v.getInt32(matrix) / 65536; // matrix[0][0]
            const b = v.getInt32(matrix + 4) / 65536; // matrix[0][1]
            const rotated = Math.abs(a) < 0.001 && Math.abs(b) > 0.5; // 90° / 270°
            width = Math.round(rotated ? h : w);
            height = Math.round(rotated ? w : h);
          }
        }
      }
    }
  }
  return { duration, width, height };
}

export async function readMp4Info(uri: string): Promise<Mp4Info> {
  const info: Mp4Info = { size: 0, duration: null, width: null, height: null, fastStart: null };
  let session: ReturnType<typeof openReader> | null = null;
  try {
    session = openReader(uri);
    const { reader } = session;
    info.size = reader.size;

    let offset = 0;
    let moov: { offset: number; size: number } | null = null;
    let sawMdat = false;
    for (let i = 0; i < 64 && offset < reader.size; i++) {
      const head = reader.read(offset, 16);
      if (head.byteLength < 8) break;
      const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
      let size = v.getUint32(0);
      const type = fourcc(v, 4);
      if (size === 1) {
        if (head.byteLength < 16) break;
        size = u64(v, 8);
      } else if (size === 0) {
        size = reader.size - offset; // runs to the end of the file
      }
      if (size < 8) break;
      if (type === "moov") {
        moov = { offset, size };
        if (!sawMdat) info.fastStart = true;
      } else if (type === "mdat") {
        if (!moov) info.fastStart = false;
        sawMdat = true;
      }
      if (moov && sawMdat) break;
      offset += size;
    }

    if (moov && moov.size <= MAX_MOOV_BYTES) {
      const parsed = parseMoov(reader.read(moov.offset, moov.size));
      info.duration = parsed.duration;
      info.width = parsed.width;
      info.height = parsed.height;
    }
  } catch {
    // unreadable / unusual file → leave fields null; the caller falls back
  } finally {
    try {
      session?.close();
    } catch {
      /* ignore */
    }
  }
  return info;
}
