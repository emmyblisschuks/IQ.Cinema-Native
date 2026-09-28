// Ported from app/loading.tsx — shown while the first home fetch is in flight.
import { View } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGridCell } from "@/lib/layout";

export function HomeSkeleton() {
  const cell = useGridCell(3, 8);
  return (
    <View className="pb-6">
      <View className="flex-row items-center gap-2 px-4 pt-5">
        <Skeleton className="h-10 flex-1 rounded-full" />
        <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-md" />
      </View>

      <View className="flex-row items-center gap-5 px-4 pt-4">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="ml-auto h-4 w-16" />
      </View>

      <Skeleton className="mx-4 mt-4 h-56 rounded-xl" />

      <View className="mt-6 flex-row flex-wrap gap-2 px-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="rounded-md" style={{ width: cell, aspectRatio: 9 / 16 }} />
        ))}
      </View>
    </View>
  );
}
