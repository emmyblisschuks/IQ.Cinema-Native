// lib/videoUpload.ts
//
// Uploads a local video to private storage: resumable, progress-reporting,
// verified. This is the one function the Upload wizard calls.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/client";
import { openChunkReader } from "@/lib/fileChunks";
import { tusUpload, UploadError, type TusDeps } from "@/lib/tusUpload";
import { xhrRequest } from "@/lib/uploadTransport";
import { createProgressMeter, type MeterSnapshot } from "@/lib/progressMeter";

const supabase = createClient();

export type UploadPhase = "starting" | "resuming" | "uploading" | "retrying" | "finishing" | "verifying";
export type UploadUpdate = { phase: UploadPhase; attempt?: number; detail?: string };

function endpoint() {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  // The dedicated storage host Supabase recommends for large uploads.
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}

const store: NonNullable<TusDeps["store"]> = {
  get: (k) => AsyncStorage.getItem(`tus:v1:${k}`),
  set: (k, v) => AsyncStorage.setItem(`tus:v1:${k}`, v),
  del: (k) => AsyncStorage.removeItem(`tus:v1:${k}`),
};

// JS-only reachability check (works on every installed build, no native module):
// any HTTP answer from the backend, even a 401, proves the network path works.
async function backendReachable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY }, signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Sits out an outage. Returns true if it had to wait, false if the backend was
// already reachable (so a failure there is not the network's fault).
async function waitForOnline(signal?: AbortSignal): Promise<boolean> {
  let waited = false;
  for (;;) {
    if (signal?.aborted) throw new UploadError("aborted", "Upload cancelled.");
    if (await backendReachable()) return waited;
    waited = true;
    await new Promise<void>((r) => setTimeout(r, 3000));
  }
}

export const mimeForUri = (uri: string) => (/\.mov(\?|$)/i.test(uri) ? "video/quicktime" : "video/mp4");

// Same file picked again → same key → the upload continues instead of restarting.
export const resumeKeyFor = (titleId: string, slot: string, size: number, durationSeconds: number) =>
  `${titleId}:${slot}:${size}:${Math.round(durationSeconds)}`;

// Forget a half-finished upload for good (the person removed / replaced the file).
export async function clearResume(key: string) {
  await store.del(key);
  await AsyncStorage.removeItem(`tuspath:v1:${key}`);
}

export async function uploadVideo(opts: {
  uri: string;
  path: string; // storage object path: <user id>/<title id>/<file>
  bucket?: string;
  resumeKey?: string;
  signal?: AbortSignal;
  onProgress?: (m: MeterSnapshot) => void;
  onUpdate?: (u: UploadUpdate) => void;
}): Promise<void> {
  const bucket = opts.bucket ?? "videos";
  const reader = openChunkReader(opts.uri);
  const meter = createProgressMeter();
  try {
    await tusUpload(
      {
        endpoint: endpoint(),
        resumeKey: opts.resumeKey,
        signal: opts.signal,
        metadata: { bucketName: bucket, objectName: opts.path, contentType: mimeForUri(opts.uri), cacheControl: "3600" },
        getHeaders: async (forceRefresh) => {
          const { data } = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) throw new UploadError("auth", "You've been signed out. Sign in again and retry the upload.");
          return { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "x-upsert": "false" };
        },
        onProgress: (sent, total) => opts.onProgress?.(meter(sent, total)),
        onStatus: (s) => opts.onUpdate?.(s),
      },
      {
        size: reader.size,
        readChunk: (o, l) => reader.read(o, l),
        request: xhrRequest,
        store,
        waitForOnline,
      }
    );

    // Don't trust "done": confirm the object is really there with the right size.
    opts.onUpdate?.({ phase: "verifying" });
    const slash = opts.path.lastIndexOf("/");
    const dir = opts.path.slice(0, slash);
    const name = opts.path.slice(slash + 1);
    const { data: found, error } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 5 });
    if (!error) {
      const obj = found?.find((f) => f.name === name);
      const size = Number((obj?.metadata as { size?: number } | undefined)?.size ?? NaN);
      if (!obj || (Number.isFinite(size) && size !== reader.size)) {
        throw new UploadError("server", "The upload finished but the file didn't arrive intact. Tap Retry to send it again.");
      }
    }
  } finally {
    reader.close();
  }
}

export { UploadError };
