import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>ใช้กล้องเพื่อสแกน QR</Text>
        <Pressable style={styles.button} onPress={() => void requestPermission()}><Text style={styles.buttonText}>อนุญาตกล้อง</Text></Pressable>
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
          setLocked(true);
          void verifierApi.verifyQr(apiOptions, data).then(setResult);
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.scanTitle}>สแกน QR Code</Text>
          <Pressable onPress={() => router.back()}><Text style={styles.close}>ปิด</Text></Pressable>
        </View>
        <View style={styles.frame} />
        <Text style={styles.help}>หันกล้องไปที่ QR Code บนเอกสาร VC หรือ VP</Text>
        {result && (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>{result.verified ? "Verified" : "Invalid"}</Text>
            <Text style={styles.resultText}>{result.issuer}</Text>
            <Pressable style={styles.button} onPress={() => setLocked(false)}><Text style={styles.buttonText}>สแกนอีกครั้ง</Text></Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050c13" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#050c13" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.34)", justifyContent: "space-between", padding: 24, paddingTop: 60 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scanTitle: { color: "#fff", fontSize: 26, fontWeight: "900" },
  close: { color: "#fff", fontSize: 18, fontWeight: "800" },
  frame: { alignSelf: "center", width: 280, height: 280, borderWidth: 5, borderColor: "#fff", borderRadius: 8 },
  help: { color: "#fff", textAlign: "center", fontSize: 17, marginBottom: 22 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginBottom: 18 },
  button: { minHeight: 50, borderRadius: 8, backgroundColor: "#4f67f2", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { color: "#fff", fontWeight: "900" },
  result: { borderRadius: 8, backgroundColor: "#fff", padding: 18, gap: 8 },
  resultTitle: { fontSize: 22, fontWeight: "900", color: "#0b6b42" },
  resultText: { color: "#374151" }
});

