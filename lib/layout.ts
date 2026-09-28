import { useWindowDimensions } from "react-native";

// The web layout is a centered `max-w-md` column (448px). Native screens can
// be wider on tablets/foldables, so grids are sized against the same cap.
export const MAX_CONTENT_WIDTH = 448;

export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_CONTENT_WIDTH);
}

// Width of one cell in an N-column grid inside a container with horizontal
// padding `pad` and gutter `gap` (both in px).
export function useGridCell(cols: number, gap: number, pad = 16) {
  const w = useContentWidth();
  return Math.floor((w - pad * 2 - gap * (cols - 1)) / cols);
}
