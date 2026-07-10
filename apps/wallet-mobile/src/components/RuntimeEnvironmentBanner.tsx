import { StyleSheet, Text, View } from "react-native";
import { env } from "../env";

export function RuntimeEnvironmentBanner() {
  if (!env.environmentBanner.bannerVisible) return null;
  return (
    <View style={styles.banner} accessibilityRole="summary">
      <Text style={styles.title}>{env.environmentBanner.labelTh}</Text>
      <Text style={styles.body}>{env.environmentBanner.descriptionTh}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    padding: 12,
    gap: 3,
  },
  title: { color: "#1e3a5f", fontSize: 13, fontWeight: "800" },
  body: { color: "#365773", fontSize: 12, lineHeight: 18 },
});
