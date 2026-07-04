import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bell, Archive, ShieldCheck, Wallet } from "lucide-react-native";
import { router } from "expo-router";
import { MobileWalletCard } from "@trustcare/ui-mobile";
import { flattenCardsByCategory, getDemoCardsByCategory, getDemoUser, type WalletCard } from "@trustcare/wallet-core";
import { cacheCards, loadCards } from "../storage/offlineWallet";

const userId = "demo-patient-complete-001";
const demoUser = getDemoUser(userId);

export function WalletScreen() {
  const [cached, setCached] = useState<WalletCard[]>([]);
  const cards = useMemo(() => flattenCardsByCategory(getDemoCardsByCategory(userId)), []);

  useEffect(() => {
    void cacheCards(cards);
    void loadCards().then(setCached).catch(() => undefined);
  }, [cards]);

  const displayCards = cached.length ? cached : cards;
  const activeCards = displayCards.filter(card => card.credentialStatus === "active");

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TrustCare Wallet</Text>
          <Text style={styles.title}>เอกสารสุขภาพ</Text>
          <Text style={styles.name}>{demoUser.nameTh}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.circle}><Bell color="#4b5563" size={21} /></Pressable>
          <Pressable style={[styles.circle, styles.avatar]}>
            {demoUser.avatarUrl ? <Image source={{ uri: demoUser.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{demoUser.initials}</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statLeft}>
          <Wallet color="#4f67f2" size={22} />
          <View>
            <Text style={styles.statText}>{displayCards.length} เอกสาร</Text>
            <Text style={styles.statSub}>{activeCards.length} รายการพร้อมใช้</Text>
          </View>
        </View>
        <Text style={styles.archive}><Archive size={16} color="#4f67f2" /> คลังเก่า 280 รายการ</Text>
      </View>

      <View style={styles.trustRow}>
        <View style={styles.trustChip}><ShieldCheck color="#0f7c55" size={16} /><Text style={styles.trustText}>ตรวจสอบได้</Text></View>
        <Text style={styles.scopeText}>scope: {demoUser.id}</Text>
      </View>

      <View style={styles.stack}>
        {displayCards.slice(0, 8).map((card, index) => (
          <MobileWalletCard
            key={card.id}
            card={card}
            stacked={index > 0}
            onPress={() => router.push(`/credential/${card.id}`)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 20, paddingBottom: 120 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14, paddingTop: 20, paddingBottom: 18 },
  kicker: { color: "#5b6475", fontSize: 13, fontWeight: "800", marginBottom: 3 },
  title: { fontSize: 30, fontWeight: "900", color: "#111827", lineHeight: 36 },
  name: { fontSize: 16, color: "#5b646f", marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 10 },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#eef0f4" },
  avatar: { backgroundColor: "#4f67f2", overflow: "hidden" },
  avatarImage: { width: 48, height: 48 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  statusCard: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#dce3ee",
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  statLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  statText: { fontSize: 18, color: "#1f2937", fontWeight: "900" },
  statSub: { fontSize: 12, color: "#667085", marginTop: 2 },
  archive: { color: "#4f67f2", fontSize: 13, fontWeight: "800" },
  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 10 },
  trustChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "#dff8e9", paddingHorizontal: 10, paddingVertical: 6 },
  trustText: { color: "#0b6b42", fontSize: 12, fontWeight: "900" },
  scopeText: { color: "#667085", fontSize: 11 },
  stack: { paddingTop: 22 }
});
