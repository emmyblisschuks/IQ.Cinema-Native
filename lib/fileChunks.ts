// lib/fileChunks.ts
//
// Reads a local video in pieces straight from disk, so even a multi-GB file
// never sits in memory whole.

import { File, Paths } from "expo-file-system";

export type ChunkReader = {
  size: number;
  read: (offset: number, length: number) => Uint8Array;
  close: () => void;
};

export function openChunkReader(uri: string): ChunkReader {
  let file = new File(uri);
  let handle;
  try {
    handle = file.open();
  } catch {
    // Some picker results (content:// on Android) can't be opened in place:
    // take a private copy in the cache, then read that.
    const copy = new File(Paths.cache, `upload-${Date.now()}.mp4`);
    file.copy(copy);
    file = copy;
    handle = file.open();
  }
  const size = handle.size ?? file.size ?? 0;
  return {
    size,
    read: (offset, length) => {
      handle.offset = offset;
      return handle.readBytes(length);
    },
    close: () => {
      try {
        handle.close();
      } catch {
        /* ignore */
      }
    },
  };
}
