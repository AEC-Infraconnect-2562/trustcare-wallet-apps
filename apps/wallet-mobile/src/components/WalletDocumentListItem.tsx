import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, FileText, Pin } from "lucide-react-native";
import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";
import {
  documentDisplayDate,
  lifecyclePresentation,
  toneBackground,
  toneColor,
  patientTrustPresentation,
} from "../documents/patientDocumentPresentation";

export function WalletDocumentListItem({
  document,
  onPress,
}: {
  document: WalletDocumentRecordV2;
  onPress: () => void;
}) {
  const trust = patientTrustPresentation(document);
  const source =
    document.clinicalContext.facility?.name ??
    document.provenance.issuerName ??
    "ไม่ระบุแหล่งที่มา";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${document.title.th}, ${source}, ${trust.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <FileText color="#365f91" size={22} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {document.title.th}
          </Text>
          {document.local.pinned ? <Pin color="#365f91" size={15} /> : null}
        </View>
        <Text style={styles.source} numberOfLines={1}>
          {source}
        </Text>
        <Text style={styles.meta}>
          {documentDisplayDate(document)} · {lifecyclePresentation(document)}
        </Text>
        <View
          style={[
            styles.trustBadge,
            { backgroundColor: toneBackground(trust.tone) },
          ]}
        >
          <Text style={[styles.trustText, { color: toneColor(trust.tone) }]}>
            {trust.label}
          </Text>
        </View>
      </View>
      <ChevronRight color="#98a2b3" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dce3ee",
    backgroundColor: "#fff",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pressed: { opacity: 0.72 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#eaf2fb",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    flex: 1,
    color: "#182230",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  source: { color: "#475467", fontSize: 13 },
  meta: { color: "#667085", fontSize: 12 },
  trustBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 3,
  },
  trustText: { fontSize: 11.5, fontWeight: "800" },
});
