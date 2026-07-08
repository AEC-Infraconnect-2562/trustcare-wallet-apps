import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { verifierApi } from "@trustcare/api-client";
import type { VerifierResult } from "@trustcare/wallet-core";
import { env } from "../env";

const apiOptions = { url: env.apiUrl, demoMode: env.demoMode };

export function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<VerifierResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [manual, setManual] = useState("");

  function verifyPayload(value: string) {
    const payload = value.trim();
    if (!payload || locked) return;
    setLocked(true);
    void verifierApi.verifyQr(apiOptions, payload).then(setResult);
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>ใช้กล้องเพื่อสแกน QR</Text>
        <Text style={styles.centerHelp}>
          รองรับ TrustCare VP, SHL, OID4VCI และ OID4VP
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => void requestPermission()}
        >
          <Text style={styles.buttonText}>อนุญาตกล้อง</Text>
        </Pressable>
        <ManualPasteBox
          manual={manual}
          setManual={setManual}
          onVerify={verifyPayload}
          locked={locked}
        />
        {result && (
          <ScanResult result={result} onRetry={() => setLocked(false)} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (locked) return;
          verifyPayload(data);
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.scanTitle}>สแกน QR Code</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.close}>ปิด</Text>
          </Pressable>
        </View>
        <View style={styles.frame} />
        <Text style={styles.help}>
          วาง QR Code ให้อยู่ในกรอบเพื่อ import หรือ verify wallet payload
        </Text>
        <ManualPasteBox
          manual={manual}
          setManual={setManual}
          onVerify={verifyPayload}
          locked={locked}
        />
        {result && (
          <ScanResult result={result} onRetry={() => setLocked(false)} />
        )}
      </View>
    </View>
  );
}

function ManualPasteBox({
  manual,
  setManual,
  onVerify,
  locked,
}: {
  manual: string;
  setManual: (value: string) => void;
  onVerify: (value: string) => void;
  locked: boolean;
}) {
  return (
    <View style={styles.manualBox}>
      <Text style={styles.manualLabel}>
        วาง QR / VC / VP / SHL / OID payload
      </Text>
      <TextInput
        value={manual}
        onChangeText={setManual}
        placeholder="https://trustcare.example.com/verifier?vp=..."
        multiline
        style={styles.manualInput}
      />
      <Pressable
        style={[styles.button, (!manual.trim() || locked) && styles.disabled]}
        disabled={!manual.trim() || locked}
        onPress={() => onVerify(manual)}
      >
        <Text style={styles.buttonText}>ตรวจสอบจากข้อความ</Text>
      </Pressable>
    </View>
  );
}

function ScanResult({
  result,
  onRetry,
}: {
  result: VerifierResult;
  onRetry: () => void;
}) {
  return (
    <View style={styles.result}>
      <Text
        style={[
          styles.resultTitle,
          !result.verified && styles.resultTitleError,
        ]}
      >
        {result.verified ? "ตรวจสอบผ่าน" : "ไม่ถูกต้อง"}
      </Text>
      <Text style={styles.resultText}>{result.issuer}</Text>
      {!!result.protocol && (
        <Text style={styles.protocol}>{result.protocol}</Text>
      )}
      {!!result.requestSummary && (
        <Text style={styles.resultText}>{result.requestSummary}</Text>
      )}
      {!!result.matchedCredentialIds?.length && (
        <Text style={styles.mono}>
          ตรงกับ: {result.matchedCredentialIds.join(", ")}
        </Text>
      )}
      {result.warnings?.map((item) => (
        <Text key={item} style={styles.warning}>
          {item}
        </Text>
      ))}
      {result.errors?.map((item) => (
        <Text key={item} style={styles.error}>
          {item}
        </Text>
      ))}
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>สแกนอีกครั้ง</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050c13" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#050c13",
  },
  centerHelp: { color: "#cbd5e1", textAlign: "center", marginBottom: 18 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.34)",
    justifyContent: "space-between",
    padding: 24,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scanTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  close: { color: "#fff", fontSize: 17, fontWeight: "800" },
  frame: {
    alignSelf: "center",
    width: 270,
    height: 270,
    borderWidth: 5,
    borderColor: "#fff",
    borderRadius: 14,
  },
  help: { color: "#fff", textAlign: "center", fontSize: 16, marginBottom: 22 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", marginBottom: 8 },
  button: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: "#4f67f2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonText: { color: "#fff", fontWeight: "900" },
  disabled: { opacity: 0.5 },
  manualBox: {
    alignSelf: "stretch",
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 14,
    gap: 10,
  },
  manualLabel: { color: "#111827", fontWeight: "800" },
  manualInput: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    color: "#111827",
    padding: 10,
    textAlignVertical: "top",
  },
  result: { borderRadius: 14, backgroundColor: "#fff", padding: 18, gap: 8 },
  resultTitle: { fontSize: 22, fontWeight: "900", color: "#0b6b42" },
  resultTitleError: { color: "#b91c1c" },
  resultText: { color: "#374151" },
  protocol: {
    alignSelf: "flex-start",
    color: "#3730a3",
    backgroundColor: "#eef2ff",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "900",
  },
  mono: { fontFamily: "monospace", color: "#647084" },
  warning: { color: "#92400e", fontSize: 13 },
  error: { color: "#b91c1c", fontSize: 13 },
});
