import { useDeferredValue, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { FileText, RefreshCw, Search } from "lucide-react-native";
import { WalletDocumentListItem } from "../components/WalletDocumentListItem";
import { RuntimeEnvironmentBanner } from "../components/RuntimeEnvironmentBanner";
import {
  filterPatientDocuments,
  type PatientDocumentFilter,
} from "../documents/patientDocumentPresentation";
import { useMobileWalletDocuments } from "../hooks/useMobileWalletDocuments";

const filters: Array<{ id: PatientDocumentFilter; label: string }> = [
  { id: "all", label: "ทั้งหมด" },
  { id: "current", label: "ฉบับปัจจุบัน" },
  { id: "attention", label: "ควรตรวจสอบ" },
];

export function RecordsScreen() {
  const { documents, isLoading, error, refresh } = useMobileWalletDocuments();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PatientDocumentFilter>("all");
  const deferredQuery = useDeferredValue(query);
  const visibleDocuments = useMemo(
    () =>
      filterPatientDocuments(documents, {
        search: deferredQuery,
        filter,
      }),
    [deferredQuery, documents, filter],
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <RuntimeEnvironmentBanner />
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>เอกสารของฉัน</Text>
          <Text style={styles.title}>เอกสารสุขภาพ</Text>
          <Text style={styles.subtitle}>
            ดูที่มา วันที่ สถานะ และความน่าเชื่อถือก่อนนำไปใช้
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <FileText color="#365f91" size={28} />
        </View>
      </View>

      <View style={styles.searchBox}>
        <Search color="#667085" size={20} />
        <TextInput
          accessibilityLabel="ค้นหาเอกสารสุขภาพ"
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหาชื่อเอกสาร โรงพยาบาล หรือผู้ออก"
          placeholderTextColor="#98a2b3"
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {filters.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item.id }}
            onPress={() => setFilter(item.id)}
            style={[styles.filter, filter === item.id && styles.filterSelected]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item.id && styles.filterTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.count}>
        {isLoading
          ? "กำลังเปิดคลังเอกสาร…"
          : `${visibleDocuments.length} รายการ`}
      </Text>

      {error ? (
        <View style={styles.stateCard} accessibilityRole="alert">
          <Text style={styles.stateTitle}>เปิดคลังเอกสารไม่สำเร็จ</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <Pressable style={styles.retry} onPress={refresh}>
            <RefreshCw color="#fff" size={17} />
            <Text style={styles.retryText}>ลองอีกครั้ง</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && !error && !visibleDocuments.length ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>ไม่พบเอกสารที่ค้นหา</Text>
          <Text style={styles.stateBody}>
            ลองเปลี่ยนคำค้นหาหรือตัวกรอง เอกสารจะไม่ถูกลบออกจาก Wallet
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {visibleDocuments.map((document) => (
          <WalletDocumentListItem
            key={document.id}
            document={document}
            onPress={() =>
              router.push({
                pathname: "/document/[id]",
                params: { id: document.id },
              })
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7f9" },
  content: { padding: 20, paddingTop: 28, paddingBottom: 120, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  heading: { flex: 1, gap: 4 },
  eyebrow: { color: "#365f91", fontSize: 12, fontWeight: "800" },
  title: { color: "#182230", fontSize: 28, lineHeight: 34, fontWeight: "800" },
  subtitle: { color: "#667085", fontSize: 13, lineHeight: 19 },
  headerIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#eaf2fb",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, color: "#182230", fontSize: 15, paddingVertical: 12 },
  filters: { gap: 8 },
  filter: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 999,
    backgroundColor: "#fff",
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  filterSelected: { backgroundColor: "#365f91", borderColor: "#365f91" },
  filterText: { color: "#344054", fontSize: 13, fontWeight: "700" },
  filterTextSelected: { color: "#fff" },
  count: { color: "#667085", fontSize: 12, fontWeight: "700" },
  list: { gap: 10 },
  stateCard: {
    borderWidth: 1,
    borderColor: "#dce3ee",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 18,
    gap: 8,
  },
  stateTitle: { color: "#182230", fontSize: 16, fontWeight: "800" },
  stateBody: { color: "#667085", fontSize: 13, lineHeight: 20 },
  retry: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#365f91",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
