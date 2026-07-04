import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { gradientForCardType } from "@trustcare/design-tokens";
import type { WalletCard } from "@trustcare/wallet-core";

export function MobileWalletCard({ card, stacked = false, onPress }: { card: WalletCard; stacked?: boolean; onPress?: () => void }) {
  const [from, to] = gradientForCardType(card.cardType);
  const holderName = holderNameFromCard(card);
  return (
    <Pressable onPress={onPress} style={[styles.wrap, stacked && styles.stacked]}>
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.iconBox}><Text style={styles.iconText}>VC</Text></View>
        <View>
          <Text style={styles.issuer}>{card.issuerHospitalName ?? "TrustCare Network"}</Text>
          <Text style={styles.title}>{card.displayName}</Text>
        </View>
        <View style={styles.footer}>
          <Text style={styles.name}>{holderName}</Text>
          <Text style={styles.meta}>หมดอายุ {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("th-TH") : "-"}</Text>
          <Text style={styles.verified}>Verified</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function holderNameFromCard(card: WalletCard): string {
  const subject = (card.credentialData?.credentialSubject ?? card.credentialData ?? {}) as Record<string, any>;
  const renderData = subject.humanDocument?.renderData;
  const person = renderData?.patient ?? subject.patient ?? subject.student ?? subject.staff ?? {};
  return person.fullNameTh ?? person.nameTh ?? person.fullNameEn ?? person.nameEn ?? card.displayNameEn ?? card.displayName;
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%"
  },
  stacked: {
    marginTop: -68
  },
  card: {
    minHeight: 188,
    borderRadius: 28,
    padding: 24,
    gap: 12
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  iconText: {
    color: "#fff",
    fontWeight: "900"
  },
  issuer: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 16
  },
  title: {
    color: "#fff",
    fontSize: 27,
    fontWeight: "900"
  },
  footer: {
    marginTop: "auto",
    gap: 7
  },
  name: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900"
  },
  meta: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 16
  },
  verified: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    textAlign: "right"
  }
});
