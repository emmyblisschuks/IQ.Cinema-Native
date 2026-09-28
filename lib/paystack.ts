import * as WebBrowser from "expo-web-browser";
import { createClient, SUPABASE_URL } from "@/lib/supabase/client";

type PurchaseType = "coins" | "subscription";

export async function initializePaystackPurchase(purchaseType: PurchaseType, itemId: string) {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purchaseType, itemId }),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Could not start payment");
  return json as { authorization_url: string; access_code: string; reference: string };
}

/**
 * Opens Paystack's hosted checkout in the in-app browser (the native
 * equivalent of the web app's full-page redirect). Resolves when the person
 * closes it; the wallet updates on its own via the realtime subscription
 * once Paystack's webhook lands.
 */
export async function redirectToPaystackCheckout(authorizationUrl: string) {
  await WebBrowser.openBrowserAsync(authorizationUrl);
}
