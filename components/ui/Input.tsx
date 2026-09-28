import { forwardRef } from "react";
import type { TextInput as RNTextInput, TextInputProps } from "react-native";
import clsx from "clsx";
import { TextInput } from "@/components/ui/Text";

// The `h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px]`
// text field the web forms repeat everywhere.
export const Input = forwardRef<RNTextInput, TextInputProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={clsx("h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text", className)}
      {...props}
    />
  )
);
Input.displayName = "Input";
