import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bell, Archive, Wallet } from "lucide-react-native";
import { router } from "expo-router";
import { MobileWalletCard } from "@trustcare/ui-mobile";
import { demoPatient, demoCardsByCategory, flattenCardsByCategory, type WalletCard } from "@trustcare/wallet-core";
import { cacheCards, loadCards } from "../storage/offlineWallet";

export function WalletScreen() {
  const [cached, setCached] = useState<WalletCard[]>([]);
  const cards = useMemo(() => flattenCardsByCategory(demoCardsByCategory), []);

  useEffect(() => {
    void cacheCards(cards);
    void loadCards().then(setCached).catch(() => undefined);
  }, [cards]);

  const displayCards = cached.length ? cached : cards;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>กระเป๋า VC</Text>
          <Text style={styles.name}>{demoPatient.nameTh}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.circle}><Bell color="#4b5563" /></Pressable>
          <Pressable style={[styles.circle, styles.avatar]}><Text style={styles.avatarText}>{demoPatient.initials}</Text></Pressable>
        </View>
      </View>
      <View style={styles.stats}>
        <View style={styles.statLeft}><Wallet color="#4f67f2" /><Text style={styles.statText}>{displayCards.length} เอกสาร</Text></View>
        <Text style={styles.archive}><Archive size={18} color="#4f67f2" /> คลังเก่า 280 รายการ →</Text>
      </View>
      <View style={styles.stack}>
        {displayCards.map((card, index) => (
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
  content: { padding: 22, paddingBottom: 120 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16, paddingVertical: 26 },
  title: { fontSize: 42, fontWeight: "900", color: "#111827" },
  name: { fontSize: 21, color: "#5b646f", marginTop: 4 },
  headerActions: { flexDirection: "row", gap: 14 },
  circle: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: "#eef0f4" },
  avatar: { backgroundColor: "#4f67f2" },
  avatarText: { color: "#fff", fontSize: 23, fontWeight: "900" },
  stats: { minHeight: 82, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#d8dfe4", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  statText: { fontSize: 23, color: "#1f2937", fontWeight: "800" },
  archive: { color: "#4f67f2", fontSize: 18 },
  stack: { paddingTop: 44 }
});

