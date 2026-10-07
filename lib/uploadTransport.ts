// lib/uploadTransport.ts
//
// The phone's network layer for lib/tusUpload.ts. XMLHttpRequest (not fetch)
// because it reports how many bytes of a request body have actually left the
// device — that's what makes the progress bar move smoothly during a chunk.

import type { TusRequest, TusResponse } from "@/lib/tusUpload";

export function xhrRequest(req: TusRequest): Promise<TusResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(req.method, req.url, true);
    for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v);
    xhr.timeout = 180_000; // a 6 MB chunk on a bad connection can take a while

    if (req.onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) req.onUploadProgress!(e.loaded);
      };
    }

    xhr.onload = () => {
      const headers: Record<string, string> = {};
      for (const line of (xhr.getAllResponseHeaders() || "").trim().split(/\r?\n/)) {
        const i = line.indexOf(":");
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
      resolve({ status: xhr.status, headers });
    };
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network request timed out"));
    xhr.onabort = () => reject(new Error("aborted"));

    if (req.signal) {
      if (req.signal.aborted) {
        xhr.abort();
        return;
      }
      req.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    // RN accepts typed arrays as a request body.
    xhr.send((req.body ?? null) as never);
  });
}
