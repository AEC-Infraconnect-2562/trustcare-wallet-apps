import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type ViewProps, type ViewStyle } from "react-native";
import { nativeTheme } from "@trustcare/design-tokens";
import type { ReactNode } from "react";

const colors = nativeTheme.light;

export function Surface({ style, ...props }: ViewProps) {
  return <View style={[styles.surface, style]} {...props} />;
}

export function Label({ style, ...props }: TextProps) {
  return <Text style={[styles.label, style]} {...props} />;
}

export function Title({ style, ...props }: TextProps) {
  return <Text style={[styles.title, style]} {...props} />;
}

type PrimaryButtonProps = Omit<PressableProps, "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ children, style, ...props }: PrimaryButtonProps) {
  return (
    <Pressable style={[styles.primaryButton, style]} {...props}>
      <Text style={styles.primaryButtonText}>{children}</Text>
    </Pressable>
  );
}

export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "yellow" | "red" | "neutral" }) {
  return (
    <View style={[styles.badge, tone === "green" ? styles.green : tone === "red" ? styles.red : tone === "yellow" ? styles.yellow : styles.neutral]}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 3
  },
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "800"
  },
  label: {
    color: colors.mutedForeground,
    fontSize: 14
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontWeight: "800",
    fontSize: 16
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start"
  },
  green: { backgroundColor: "#d1fae5" },
  red: { backgroundColor: "#fee2e2" },
  yellow: { backgroundColor: "#fef3c7" },
  neutral: { backgroundColor: "#eef2f7" },
  badgeText: {
    color: colors.foreground,
    fontWeight: "700",
    fontSize: 12
  }
});
