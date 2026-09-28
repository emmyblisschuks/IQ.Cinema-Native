// components/ui/PasswordInput.tsx

import { forwardRef, useState } from "react";
import { Pressable, View, type TextInput as RNTextInput, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import clsx from "clsx";
import { TextInput } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry"> & { className?: string };

export const PasswordInput = forwardRef<RNTextInput, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <View className="relative">
        <TextInput
          ref={ref}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          className={clsx(
            "h-12 w-full rounded-md border border-border bg-surface px-4 pr-11 text-[15px] text-text",
            className
          )}
          {...props}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 items-center justify-center px-3.5"
        >
          <Icon as={visible ? EyeOff : Eye} size={17} tone="muted" />
        </Pressable>
      </View>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
