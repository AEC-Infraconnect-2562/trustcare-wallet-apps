import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import type { WalletCard } from "@trustcare/wallet-core";
import { initialsFromName } from "@trustcare/wallet-core";

export function CredentialDocumentNative({ card, qrValue }: { card: WalletCard; qrValue?: string }) {
  const subject = (card.credentialData?.credentialSubject ?? card.credentialData ?? {}) as Record<string, any>;
  const patient = subject.patient ?? subject.student ?? {};
  const nameTh = patient.fullNameTh ?? patient.nameTh ?? "นายธนกร เรียนดี";
  const nameEn = patient.fullNameEn ?? patient.nameEn ?? "Mr. Thanakorn Riandee";

  return (
    <View style={styles.doc}>
      <View style={styles.header}>
        <View style={styles.logo}><Text style={styles.logoText}>TC</Text></View>
        <View style={styles.headerText}>
          <Text style={styles.hospital}>TrustCare Hospital Network</Text>
          <Text style={styles.title}>{card.displayName}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.photo}><Text style={styles.photoText}>{initialsFromName(nameTh)}</Text></View>
        <View style={styles.person}>
          <Text style={styles.label}>ชื่อ-นามสกุล</Text>
          <Text style={styles.name}>{nameTh}</Text>
          <Text style={styles.nameEn}>{nameEn}</Text>
          <Text style={styles.big}>{patient.carepassId ?? patient.studentId ?? "TC-6501001001"}</Text>
        </View>
        <Text style={styles.watermark}>DEMO ONLY</Text>
      </View>
      <View style={styles.status}>
        <View>
          <Text style={styles.label}>สถานะ / STATUS</Text>
          <Text style={styles.active}>ปกติ</Text>
        </View>
        <View>
          <Text style={styles.label}>หมดอายุ</Text>
          <Text style={styles.date}>{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("th-TH") : "-"}</Text>
        </View>
        <View style={styles.qr}>{qrValue ? <QRCode value={qrValue} size={76} /> : <Text>QR</Text>}</View>
      </View>
      <Text style={styles.footer}>VC: urn:uuid:{String(card.credentialId)}-trustcare-wallet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  doc: {
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8dfe4",
    borderBottomWidth: 8,
    borderBottomColor: "#c7ac2e",
    marginBottom: 18
  },
  header: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    backgroundColor: "#344b83",
    padding: 20
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 24 },
  headerText: { flex: 1 },
  hospital: { color: "#fff", fontSize: 19, fontWeight: "900" },
  title: { color: "rgba(255,255,255,0.85)", fontSize: 16 },
  body: { flexDirection: "row", gap: 18, padding: 20, position: "relative" },
  photo: {
    width: 108,
    height: 142,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#a9b8cc"
  },
  photoText: { color: "#fff", fontWeight: "900", fontSize: 34 },
  person: { flex: 1, gap: 3 },
  label: { color: "#62718a", fontSize: 13 },
  name: { color: "#0f172a", fontSize: 24, fontWeight: "900" },
  nameEn: { color: "#62718a", fontSize: 17 },
  big: { color: "#1c2e55", fontWeight: "900", fontSize: 22, marginTop: 8 },
  watermark: {
    position: "absolute",
    right: 0,
    top: 48,
    transform: [{ rotate: "-32deg" }],
    color: "rgba(210,68,72,0.14)",
    fontSize: 40,
    fontWeight: "900"
  },
  status: {
    marginHorizontal: 20,
    marginBottom: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    backgroundColor: "#f3f6fa",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  active: { color: "#0b6b42", fontWeight: "900", fontSize: 17 },
  date: { color: "#162330", fontWeight: "800", fontSize: 16 },
  qr: {
    marginLeft: "auto",
    width: 86,
    height: 86,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  footer: {
    marginHorizontal: 20,
    marginBottom: 18,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8dfe4",
    paddingTop: 12,
    color: "#62718a",
    fontSize: 12
  }
});

