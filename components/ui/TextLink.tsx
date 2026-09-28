import type { ReactNode } from "react";
import { useRouter, type Href } from "expo-router";
import { Text } from "@/components/ui/Text";

// Inline link, for use inside a <Text> (mirrors an <a> inside a <p>).
export function TextLink({
  href,
  replace,
  className,
  children,
}: {
  href: string;
  replace?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Text
      accessibilityRole="link"
      onPress={() => (replace ? router.replace(href as Href) : router.push(href as Href))}
      className={className}
    >
      {children}
    </Text>
  );
}
