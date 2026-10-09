// lib/share.ts
//
// One place that opens the system share sheet (Android share manager / iOS
// share sheet) with a link that opens the app. The link is an https URL on
// the web origin; Android App Links (see app.json intentFilters) make the OS
// open it in the app when installed, and fall back to the website otherwise.

import { Share } from "react-native";
import { WEB_ORIGIN } from "@/lib/links";

export function shareUrl(path: string) {
  return `${WEB_ORIGIN}${path}`;
}

// Resolves true only when the viewer actually picked a share target, so share
// counters don't go up when the sheet is dismissed.
export async function shareLink(opts: { title: string; path: string }): Promise<boolean> {
  const url = shareUrl(opts.path);
  try {
    // Android ignores `url` (it only sends `message`), iOS uses both.
    const res = await Share.share({ title: opts.title, message: `${opts.title}\n${url}`, url });
    return res.action === Share.sharedAction;
  } catch {
    return false;
  }
}
