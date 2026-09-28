// lib/device.ts

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

// A stable per-install id for anonymous view/progress tracking (record_play
// accepts a null user_id but still wants a device fingerprint to dedupe by).
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await AsyncStorage.getItem("iq-device-id");
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem("iq-device-id", id);
  }
  cached = id;
  return id;
}
