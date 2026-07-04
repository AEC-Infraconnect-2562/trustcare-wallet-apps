import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Copy, Database, Download, FileJson, ShieldCheck } from "lucide-react-native";
import {
  demoCardsByCategory,
  demoHistory,
  demoShlPackages,
  flattenCardsByCategory,
  importWalletExchange,
  mergeWalletObjects,
  walletObjectsFromCards,
  walletObjectsFromHistory,
  walletObjectsFromShl,
  type WalletStoredObject
} from "@trustcare/wallet-core";
import { cacheStoredObject, cacheStoredObjects, loadStoredObjects } from "../storage/offlineWallet";

type Filter = "all" | "vc" | "vp" | "shl" | "oid";

export function StoreScreen() {
  const [cached, setCached] = useState<WalletStoredObject[]>([]);
  const [payload, setPayload] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const cards = useMemo(() => flattenCardsByCategory(demoCardsByCategory), []);
  const baseObjects = useMemo(() => mergeWalletObjects(
    walletObjectsFromCards(cards),
    walletObjectsFromHistory(demoHistory),
    walletObjectsFromShl(demoShlPackages)
  ), [cards]);
  const objects = useMemo(() => mergeWalletObjects(baseObjects, cached), [baseObjects, cached]);
  const filtered = useMemo(() => {
    if (filter === "all") return objects;
    if (filter === "oid") return objects.filter(item => item.type === "oid4vci_offer" || item.type === "oid4vp_request");
    return objects.filter(item => item.type === filter);
  }, [filter, objects]);

  useEffect(() => {
    void cacheStoredObjects(baseObjects);
    void loadStoredObjects().then(setCached).catch(() => undefined);
  }, [baseObjects]);

  const importPayload = async () => {
    const result = importWalletExchange(payload, cards);
    if (result.object) {
      await cacheStoredObject(result.object);
      setCached(await loadStoredObjects());
    }
    setMessage(result.ok ? `Imported ${result.format}` : result.errors.join(", "));
    setPayload("");
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>STORE</Text>
          <Text style={styles.title}>VC/VP/SHL Wallet</Text>
          <Text style={styles.subtitle}>{objects.length} stored objects</Text>
        </View>
        <View style={styles.iconCircle}><Database color="#4f67f2" /></View>
      </View>

      <View style={styles.importPanel}>
        <Text style={styles.panelTitle}>Import</Text>
        <TextInput
          value={payload}
          onChangeText={setPayload}
          placeholder="Paste shlink:/, OID4VCI, OID4VP, VC/VP JSON, JWT..."
          multiline
          style={styles.input}
        />
        <Pressable style={[styles.importButton, !payload.trim() && styles.disabled]} disabled={!payload.trim()} onPress={() => void importPayload()}>
          <FileJson color="#fff" />
          <Text style={styles.importText}>Import to wallet</Text>
        </Pressable>
        {!!message && <Text style={styles.message}>{message}</Text>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(["all", "vc", "vp", "shl", "oid"] as Filter[]).map(item => (
          <Pressable key={item} style={[styles.filterChip, filter === item && styles.filterChipActive]} onPress={() => setFilter(item)}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.map(object => (
        <View key={object.id} style={styles.objectCard}>
          <View style={styles.objectTop}>
            <View style={styles.badgeRow}>
              <Text style={styles.badge}>{object.type}</Text>
              {!!object.protocol && <Text style={styles.protocol}>{object.protocol}</Text>}
            </View>
            <ShieldCheck color={object.status === "active" || object.status === "verified" ? "#16a34a" : "#d97706"} />
          </View>
          <Text style={styles.objectTitle}>{object.title}</Text>
          <Text style={styles.objectSub} numberOfLines={2}>{object.subtitle ?? object.source ?? object.id}</Text>
          <View style={styles.objectActions}>
            <Action icon={<Copy color="#4f67f2" />} label="Copy" />
            <Action icon={<Download color="#4f67f2" />} label="Export" />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function Action({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View style={styles.action}>
      {icon}
      <Text style={styles.actionText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 22, paddingBottom: 120, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 24 },
  eyebrow: { color: "#4f67f2", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 34, fontWeight: "900" },
  subtitle: { color: "#647084", marginTop: 4 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef3ff", alignItems: "center", justifyContent: "center" },
  importPanel: { borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d8dfe4", padding: 16, gap: 12 },
  panelTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  input: { minHeight: 104, borderRadius: 10, borderWidth: 1, borderColor: "#d8dfe4", backgroundColor: "#f8fafc", color: "#111827", padding: 12, textAlignVertical: "top" },
  importButton: { minHeight: 52, borderRadius: 10, backgroundColor: "#4f67f2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  disabled: { opacity: 0.5 },
  importText: { color: "#fff", fontWeight: "900" },
  message: { color: "#4f67f2", fontWeight: "800" },
  filterRow: { gap: 10 },
  filterChip: { minHeight: 40, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d8dfe4", paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: "#4f67f2", borderColor: "#4f67f2" },
  filterText: { color: "#374151", fontWeight: "900" },
  filterTextActive: { color: "#fff" },
  objectCard: { borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d8dfe4", padding: 16, gap: 10 },
  objectTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badgeRow: { flexDirection: "row", gap: 8 },
  badge: { color: "#065f46", backgroundColor: "#d1fae5", overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontWeight: "900" },
  protocol: { color: "#3730a3", backgroundColor: "#eef2ff", overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontWeight: "900" },
  objectTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  objectSub: { color: "#647084" },
  objectActions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 46, borderRadius: 10, backgroundColor: "#f4f6fa", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { color: "#4f67f2", fontWeight: "900" }
});
