// lib/tusUpload.ts
//
// A small, self-contained resumable-upload client for Supabase Storage's TUS
// endpoint. It is transport-agnostic (the app passes an XHR transport, the
// tests pass a Node one) so the protocol logic can be tested for real.
//
// Why not a library: on a phone we need (a) the file read in pieces straight
// from disk — never loaded whole, (b) progress *while* a piece is sending, not
// only between pieces, (c) resume after the network drops or the app is closed,
// and (d) every failure turned into a message a person can act on.

export type TusResponse = { status: number; headers: Record<string, string> };

export type TusRequest = {
  method: "POST" | "HEAD" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  // Bytes of `body` handed to the network so far (called repeatedly).
  onUploadProgress?: (sent: number) => void;
  signal?: AbortSignal;
};

export type TusDeps = {
  size: number;
  readChunk: (offset: number, length: number) => Promise<Uint8Array> | Uint8Array;
  request: (req: TusRequest) => Promise<TusResponse>;
  // Remembers the upload URL so a later attempt can continue it.
  store?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    del: (key: string) => Promise<void>;
  };
  sleep?: (ms: number) => Promise<void>;
  // Resolves once the backend is reachable again. Returns true if it actually
  // had to wait (false = it was already reachable). Lets an upload sit out a
  // long outage and then continue, instead of giving up after a minute.
  waitForOnline?: (signal?: AbortSignal) => Promise<boolean>;
};

export type TusOptions = {
  endpoint: string;
  getHeaders: (forceRefresh?: boolean) => Promise<Record<string, string>>;
  metadata: Record<string, string>;
  resumeKey?: string;
  chunkSize?: number; // Supabase requires 6 MiB (except for the last piece)
  retryDelays?: number[];
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  onStatus?: (s: { phase: "starting" | "resuming" | "uploading" | "retrying" | "finishing"; attempt?: number; detail?: string }) => void;
  signal?: AbortSignal;
};

export class UploadError extends Error {
  constructor(
    public code: "aborted" | "auth" | "too_large" | "forbidden" | "bad_file" | "server" | "network",
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

const SIX_MIB = 6 * 1024 * 1024;
const TUS = "1.0.0";

function b64(s: string): string {
  // btoa is available in Hermes and Node ≥16; handle non-ASCII (file names)
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

function resolveUrl(location: string, endpoint: string) {
  if (/^https?:\/\//i.test(location)) return location;
  return new URL(location, endpoint).toString();
}

export async function tusUpload(opts: TusOptions, deps: TusDeps): Promise<{ url: string }> {
  const { size } = deps;
  const chunkSize = opts.chunkSize ?? SIX_MIB;
  const retryDelays = opts.retryDelays ?? [0, 1500, 4000, 8000, 15000, 30000];
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const checkAbort = () => {
    if (opts.signal?.aborted) throw new UploadError("aborted", "Upload cancelled.");
  };

  if (!size || size <= 0) throw new UploadError("bad_file", "The selected file is empty or can't be read.");

  let headersCache = await opts.getHeaders();
  const authed = async (extra: Record<string, string>, refresh = false) => {
    if (refresh) headersCache = await opts.getHeaders(true);
    return { ...headersCache, "Tus-Resumable": TUS, ...extra };
  };

  const fail = (res: TusResponse, what: string): never => {
    const s = res.status;
    if (s === 401) throw new UploadError("auth", "You've been signed out. Sign in again and retry the upload.", s);
    if (s === 403) throw new UploadError("forbidden", "You don't have permission to upload this file.", s);
    if (s === 413) throw new UploadError("too_large", "This file is larger than the server allows.", s);
    if (s === 415) throw new UploadError("bad_file", "This file type isn't accepted. Use an MP4 or MOV video.", s);
    throw new UploadError("server", `${what} failed (server answered ${s}).`, s);
  };
  const isRetryable = (e: unknown) =>
    e instanceof UploadError ? e.code === "network" || (e.code === "server" && ((e.status ?? 500) >= 500 || e.status === 403)) : true;

  async function create(): Promise<string> {
    const meta = Object.entries(opts.metadata).map(([k, v]) => `${k} ${b64(v)}`).join(",");
    let res = await deps.request({
      method: "POST",
      url: opts.endpoint,
      headers: await authed({ "Upload-Length": String(size), "Upload-Metadata": meta }),
      signal: opts.signal,
    });
    if (res.status === 401) {
      res = await deps.request({
        method: "POST",
        url: opts.endpoint,
        headers: await authed({ "Upload-Length": String(size), "Upload-Metadata": meta }, true),
        signal: opts.signal,
      });
    }
    if (res.status !== 201) fail(res, "Starting the upload");
    const loc = lower(res.headers).location;
    if (!loc) throw new UploadError("server", "The server didn't return an upload address.");
    return resolveUrl(loc, opts.endpoint);
  }

  // How many bytes the server already has. `null` means ONLY "the server no
  // longer has this upload" (404/410). Anything unclear (offline, 5xx, 401/403
  // right after reconnecting, 423 locked…) THROWS so the caller retries — it
  // must never be mistaken for "start over", that is what threw progress away.
  async function serverOffset(url: string): Promise<number | null> {
    let res = await deps.request({ method: "HEAD", url, headers: await authed({}), signal: opts.signal });
    if (res.status === 401) res = await deps.request({ method: "HEAD", url, headers: await authed({}, true), signal: opts.signal });
    if (res.status === 404 || res.status === 410) return null;
    if (res.status < 200 || res.status >= 300) {
      throw new UploadError(res.status === 403 || res.status >= 500 ? "server" : "network", `Checking upload progress failed (${res.status}).`, res.status);
    }
    const off = parseInt(lower(res.headers)["upload-offset"] ?? "", 10);
    if (!Number.isFinite(off)) throw new UploadError("network", "The server didn't say how much it has yet.");
    return off;
  }

  // The server forgot the upload (expired / cleaned up): the only honest option
  // is a fresh one.
  async function startFresh(): Promise<string> {
    if (opts.resumeKey && deps.store) await deps.store.del(opts.resumeKey);
    const fresh = await withRetry(() => create());
    if (opts.resumeKey && deps.store) await deps.store.set(opts.resumeKey, fresh);
    return fresh;
  }

  let url: string | null = null;
  let offset = 0;

  // 1) Continue a previous attempt if we remember one and the server still has it.
  if (opts.resumeKey && deps.store) {
    const saved = await deps.store.get(opts.resumeKey);
    if (saved) {
      opts.onStatus?.({ phase: "resuming" });
      // Retries (and waits out an outage) rather than guessing: a hiccup while
      // asking "how much do you have?" must NOT turn into a brand-new upload.
      // If it still can't be answered, this throws and the saved address stays,
      // so the next attempt continues from the same place.
      const off = await withRetry(() => serverOffset(saved));
      if (off !== null && off <= size) {
        url = saved;
        offset = off;
      } else {
        await deps.store.del(opts.resumeKey);
      }
    }
  }

  // 2) Otherwise start a new upload.
  if (!url) {
    opts.onStatus?.({ phase: "starting" });
    url = await withRetry(() => create());
    if (opts.resumeKey && deps.store) await deps.store.set(opts.resumeKey, url);
  }

  opts.onProgress?.(offset, size);

  // 3) Send the file piece by piece.
  let attempt = 0;
  while (offset < size) {
    checkAbort();
    const length = Math.min(chunkSize, size - offset);
    try {
      const body = await deps.readChunk(offset, length);
      if (body.byteLength !== length) throw new UploadError("bad_file", "Couldn't read the video file from your phone's storage.");
      opts.onStatus?.({ phase: "uploading" });
      const base = offset;
      const res = await deps.request({
        method: "PATCH",
        url,
        headers: await authed({ "Content-Type": "application/offset+octet-stream", "Upload-Offset": String(offset) }),
        body,
        signal: opts.signal,
        onUploadProgress: (sent) => opts.onProgress?.(Math.min(size, base + sent), size),
      });
      if (res.status === 401) {
        headersCache = await opts.getHeaders(true);
        throw new UploadError("network", "refresh"); // retried with fresh headers
      }
      if (res.status === 409) {
        // Offset mismatch: our idea of the offset is stale. Ask the server.
        const off = await serverOffset(url);
        if (off === null) {
          url = await startFresh();
          offset = 0;
          opts.onProgress?.(0, size);
        } else {
          offset = off;
        }
        continue;
      }
      if (res.status !== 204 && res.status !== 200) fail(res, "Sending the video");
      const next = parseInt(lower(res.headers)["upload-offset"] ?? "", 10);
      offset = Number.isFinite(next) ? next : offset + length;
      opts.onProgress?.(offset, size);
      attempt = 0;
    } catch (e) {
      if (opts.signal?.aborted) throw new UploadError("aborted", "Upload cancelled.");
      if (e instanceof UploadError && !isRetryable(e)) throw e;
      if (attempt >= retryDelays.length) {
        // Out of quick retries. If the phone is simply offline, wait for the
        // connection and then carry on from the saved offset — no tapping.
        if (deps.waitForOnline && (await deps.waitForOnline(opts.signal))) {
          attempt = 0;
          checkAbort();
          continue;
        }
        throw e instanceof UploadError && e.code !== "network"
          ? e
          : new UploadError("network", "The connection kept dropping. Your progress is saved — check your connection and tap Retry to continue.");
      }
      opts.onStatus?.({ phase: "retrying", attempt: attempt + 1, detail: e instanceof Error ? e.message : String(e) });
      await sleep(retryDelays[attempt++]);
      checkAbort();
      // The failed PATCH may have been partly or fully applied: re-sync.
      try {
        const off = await serverOffset(url);
        if (off === null) {
          // The server really lost it: only now start a new upload.
          url = await startFresh();
          offset = 0;
          opts.onProgress?.(0, size);
        } else {
          offset = off;
        }
      } catch {
        // can't tell yet (still offline / server hiccup): loop and try the PATCH again
      }
    }
  }

  opts.onStatus?.({ phase: "finishing" });
  if (opts.resumeKey && deps.store) await deps.store.del(opts.resumeKey);
  return { url };

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let i = 0;
    for (;;) {
      checkAbort();
      try {
        return await fn();
      } catch (e) {
        if (opts.signal?.aborted) throw new UploadError("aborted", "Upload cancelled.");
        if (e instanceof UploadError && !isRetryable(e)) throw e;
        if (i >= retryDelays.length) {
          if (deps.waitForOnline && (await deps.waitForOnline(opts.signal))) {
            i = 0;
            continue;
          }
          throw e instanceof UploadError && e.code !== "network"
            ? e
            : new UploadError("network", "Couldn't reach the server. Check your connection and try again.");
        }
        opts.onStatus?.({ phase: "retrying", attempt: i + 1 });
        await sleep(retryDelays[i++]);
      }
    }
  }
}
