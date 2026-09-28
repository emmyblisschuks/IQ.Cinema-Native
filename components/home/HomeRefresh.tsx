import type { ReactNode } from "react";
import { PullToRefresh } from "@/components/shared/PullToRefresh";

// On web this re-runs the server render; natively the screen owns the fetch
// and just hands its refetch to the pull-to-refresh control.
export function HomeRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  return <PullToRefresh onRefresh={onRefresh}>{children}</PullToRefresh>;
}
