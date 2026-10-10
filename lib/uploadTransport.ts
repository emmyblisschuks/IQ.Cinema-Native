// lib/uploadTransport.ts
//
// The phone's network layer for lib/tusUpload.ts. XMLHttpRequest (not fetch)
// because it reports how many bytes of a request body have actually left the
// device — that's what makes the progress bar move smoothly during a chunk.
//
// Timeouts follow the "stall detection" idea from tus-js-client: a big PATCH is
// allowed to take as long as it needs *while bytes keep moving*, but if nothing
// has moved for STALL_MS the request is abandoned right away so the uploader can
// re-sync and continue. (A single long total timeout would leave a dead
// connection hanging for minutes before anything noticed.)

import type { TusRequest, TusResponse } from "@/lib/tusUpload";

// No upload progress for this long = the connection is dead, give up on it.
const STALL_MS = 20_000;
// Once the body is fully sent, how long the server may take to answer.
const RESPONSE_MS = 60_000;
// Body-less requests (POST create / HEAD offset check) are tiny.
const SMALL_REQUEST_MS = 30_000;

export function xhrRequest(req: TusRequest): Promise<TusResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(req.method, req.url, true);
    for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const arm = (ms: number, why: string) => {
      clear();
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        reject(new Error(why));
      }, ms);
    };
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clear();
      fn();
    };

    const hasBody = !!req.body;
    if (hasBody) {
      arm(STALL_MS, "Network request stalled");
      if (xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (settled) return;
          arm(STALL_MS, "Network request stalled");
          if (e.lengthComputable) req.onUploadProgress?.(e.loaded);
        };
        // Body fully handed over → now we're only waiting for the answer.
        xhr.upload.onload = () => {
          if (!settled) arm(RESPONSE_MS, "Network request timed out");
        };
      }
    } else {
      arm(SMALL_REQUEST_MS, "Network request timed out");
    }

    xhr.onload = () =>
      done(() => {
        const headers: Record<string, string> = {};
        for (const line of (xhr.getAllResponseHeaders() || "").trim().split(/\r?\n/)) {
          const i = line.indexOf(":");
          if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
        }
        resolve({ status: xhr.status, headers });
      });
    xhr.onerror = () => done(() => reject(new Error("Network request failed")));
    xhr.ontimeout = () => done(() => reject(new Error("Network request timed out")));
    xhr.onabort = () => done(() => reject(new Error("aborted")));

    if (req.signal) {
      if (req.signal.aborted) {
        done(() => reject(new Error("aborted")));
        return;
      }
      req.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    // RN accepts typed arrays as a request body.
    xhr.send((req.body ?? null) as never);
  });
}
