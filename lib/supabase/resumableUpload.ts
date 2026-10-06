// lib/supabase/resumableUpload.ts
//
// Resumable (TUS) upload straight to Supabase Storage — the native twin of the
// web helper. A plain single-request upload of a multi-hundred-MB video starts
// again from 0% whenever the connection drops; TUS retries and continues
// instead. The file is streamed from disk in 6 MB chunks (never loaded whole).

import * as tus from "tus-js-client";
import { createClient, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/client";

const supabase = createClient();

function storageEndpoint() {
  // https://<ref>.supabase.co → the dedicated storage host Supabase recommends
  // for large uploads (skips a hop through the API gateway).
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}

export type ResumableUpload = { promise: Promise<void>; abort: () => void };

export function uploadVideoResumable({
  bucket,
  path,
  uri,
  contentType = "video/mp4",
  onProgress,
}: {
  bucket: string;
  path: string;
  uri: string; // local file:// (or content://) uri from the picker
  contentType?: string;
  onProgress?: (fraction: number) => void;
}): ResumableUpload {
  let upload: tus.Upload | null = null;
  let aborted = false;

  const promise = new Promise<void>(async (resolve, reject) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        reject(new Error("You've been signed out — sign in again and retry the upload."));
        return;
      }

      // React Native Blobs are backed by the file on disk and can be sliced,
      // which is what tus reads chunk by chunk.
      const blob = await (await fetch(uri)).blob();
      if (aborted) return;

      upload = new tus.Upload(blob as unknown as Blob, {
        endpoint: storageEndpoint(),
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: "3600" },
        // Supabase's TUS endpoint requires exactly this chunk size.
        chunkSize: 6 * 1024 * 1024,
        onError: reject,
        onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
        onSuccess: () => resolve(),
      });
      upload.start();
    } catch (e) {
      reject(e);
    }
  });

  return {
    promise,
    abort: () => {
      aborted = true;
      upload?.abort(true).catch(() => {});
    },
  };
}
