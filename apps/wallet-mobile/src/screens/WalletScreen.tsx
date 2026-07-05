import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bell, Archive, ShieldCheck, Wallet } from "lucide-react-native";
import { router } from "expo-router";
import { MobileWalletCard } from "@trustcare/ui-mobile";
import { flattenCardsByCategory, getDemoCardsByCategory, type WalletCard } from "@trustcare/wallet-core";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";
import { cacheCards, loadCards } from "../storage/offlineWallet";

export function WalletScreen() {
  const { user } = useActiveWalletUser();
  const [cached, setCached] = useState<WalletCard[]>([]);
  const cards = useMemo(() => flattenCardsByCategory(getDemoCardsByCategory(user.id)), [user.id]);

  useEffect(() => {
    void cacheCards(cards, user.id);
    void loadCards(user.id).then(setCached).catch(() => undefined);
  }, [cards, user.id]);

  const displayCards = cached.length ? cached : cards;
  const activeCards = displayCards.filter(card => card.credentialStatus === "active");

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TrustCare Wallet</Text>
          <Text style={styles.title}>เอกสารสุขภาพ</Text>
          <Text style={styles.name}>{user.nameTh}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.circle}><Bell color="#4b5563" size={21} /></Pressable>
          <Pressable style={[styles.circle, styles.avatar]}>
            {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{user.initials}</Text>}
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
        <Text style={styles.scopeText}>scope: {user.id}</Text>
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
  kicker: { color: "#5b6475", fontSize: 12, fontWeight: "700", marginBottom: 3 },
  title: { fontSize: 26, fontWeight: "700", color: "#111827", lineHeight: 32 },
  name: { fontSize: 14, color: "#5b646f", marginTop: 2 },
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
  statText: { fontSize: 16, color: "#1f2937", fontWeight: "700" },
  statSub: { fontSize: 12, color: "#667085", marginTop: 2 },
  archive: { color: "#4f67f2", fontSize: 12, fontWeight: "700" },
  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 10 },
  trustChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "#dff8e9", paddingHorizontal: 10, paddingVertical: 6 },
  trustText: { color: "#0b6b42", fontSize: 12, fontWeight: "700" },
  scopeText: { color: "#667085", fontSize: 11 },
  stack: { paddingTop: 22 }
});
