// lib/download.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

// Downloads a private-bucket video to the device and hands it to the OS
// share/save sheet (Save to Files / Photos / other apps). The signed URL is
// minted with `download` set, exactly like the web app.
//
// NOTE ON WATERMARKING: as on web, this downloads the source file as stored.
// Burning the app-icon watermark into the downloaded file requires a
// server-side ffmpeg overlay pass, which is not part of this app. The
// in-player watermark is real; the downloaded file is not re-encoded yet.
export async function downloadEpisodeVideo(
  supabase: SupabaseClient,
  videoPath: string,
  fileName: string
) {
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(videoPath, 60 * 5, { download: fileName });
  if (error || !data?.signedUrl) throw error ?? new Error("Could not prepare download");

  const safeName = fileName.replace(/[^\w.\- ]+/g, "_");
  const dest = new File(new Directory(Paths.cache), safeName);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(data.signedUrl, dest);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "video/mp4", dialogTitle: fileName });
  }
}
