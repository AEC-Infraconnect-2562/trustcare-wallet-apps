import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { gradientForCardType } from "@trustcare/design-tokens";
import {
  canPresentCredential,
  credentialStatusLabel,
  presentationEnvelopeFromWalletCard,
  type WalletCard,
} from "@trustcare/wallet-core";

export function MobileWalletCard({
  card,
  stacked = false,
  onPress,
}: {
  card: WalletCard;
  stacked?: boolean;
  onPress?: () => void;
}) {
  const [from, to] = gradientForCardType(card.cardType);
  const envelope = presentationEnvelopeFromWalletCard(card);
  const holderName = envelope.subject.displayName ?? card.displayName;
  const disabled = !canPresentCredential(card);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.wrap,
        stacked && styles.stacked,
        disabled && styles.disabled,
      ]}
    >
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.iconBox}>
          <Text style={styles.iconText}>VC</Text>
        </View>
        <View>
          <Text style={styles.issuer}>
            {envelope.issuer?.name ??
              card.issuerHospitalName ??
              "TrustCare Network"}
          </Text>
          <Text style={styles.title}>{envelope.display.title}</Text>
        </View>
        <View style={styles.footer}>
          <Text style={styles.name}>{holderName}</Text>
          <Text style={styles.meta}>
            หมดอายุ{" "}
            {envelope.policy.expiresAt
              ? new Date(envelope.policy.expiresAt).toLocaleDateString("th-TH")
              : "-"}
          </Text>
          <Text style={styles.verified}>
            {credentialStatusLabel(card.credentialStatus)}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  stacked: {
    marginTop: -68,
  },
  disabled: {
    opacity: 0.62,
  },
  card: {
    minHeight: 188,
    borderRadius: 28,
    padding: 24,
    gap: 12,
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: "#fff",
    fontWeight: "900",
  },
  issuer: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 16,
  },
  title: {
    color: "#fff",
    fontSize: 27,
    fontWeight: "900",
  },
  footer: {
    marginTop: "auto",
    gap: 7,
  },
  name: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
  },
  meta: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 16,
  },
  verified: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    textAlign: "right",
  },
});
