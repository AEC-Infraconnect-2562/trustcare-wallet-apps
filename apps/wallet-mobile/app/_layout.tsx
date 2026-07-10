import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import {
  Activity,
  FileText,
  Home,
  QrCode,
  Send,
} from "lucide-react-native";
import { NativeLanguageProvider } from "@trustcare/i18n/src/provider.native";
import { MobileWalletSessionProvider } from "../src/hooks/useActiveWalletUser";
import {
  MobileSecuritySettingsProvider,
  useMobileSecuritySettings,
} from "../src/hooks/useMobileSecuritySettings";
import { env } from "../src/env";

export default function RootLayout() {
  if (env.runtimeEnvironment !== "demo") {
    return <ProductionRuntimeBoundary />;
  }
  return (
    <NativeLanguageProvider>
      <MobileWalletSessionProvider>
        <MobileSecuritySettingsProvider>
          <WalletTabs />
        </MobileSecuritySettingsProvider>
      </MobileWalletSessionProvider>
    </NativeLanguageProvider>
  );
}

function ProductionRuntimeBoundary() {
  return (
    <View style={styles.runtimeBoundary} accessibilityRole="alert">
      <View style={styles.runtimeCard}>
        <Text style={styles.runtimeEyebrow}>
          {env.environmentBanner.labelTh}
        </Text>
        <Text style={styles.runtimeTitle}>ยังไม่ได้เชื่อมต่อระบบเข้าสู่ระบบ</Text>
        <Text style={styles.runtimeBody}>
          Wallet จะไม่เปิดข้อมูลสาธิตแทนข้อมูลจริง ต้องตั้งค่าระบบเข้าสู่ระบบ
          คลังเอกสารที่ปลอดภัย และการเชื่อมต่อ TrustCare Portal ก่อนใช้งาน
        </Text>
      </View>
    </View>
  );
}

function WalletTabs() {
  const { theme } = useMobileSecuritySettings();
  const dark = theme === "dark";
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? "#8ea2ff" : "#4f67f2",
        tabBarInactiveTintColor: dark ? "#94a3b8" : "#9ca3af",
        tabBarStyle: {
          height: 76,
          paddingBottom: 10,
          paddingTop: 7,
          borderTopColor: dark ? "#263244" : "#d8dfe4",
          backgroundColor: dark ? "#111827" : "#fff",
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "หน้าแรก",
          tabBarIcon: ({ color }) => <Home color={color} />,
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: "เอกสาร",
          tabBarIcon: ({ color }) => <FileText color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "รับเอกสาร",
          tabBarIcon: ({ color }) => <QrCode color={color} />,
        }}
      />
      <Tabs.Screen
        name="prepare"
        options={{
          title: "เตรียม",
          tabBarIcon: ({ color }) => <Activity color={color} />,
        }}
      />
      <Tabs.Screen
        name="share"
        options={{
          title: "แชร์",
          tabBarIcon: ({ color }) => <Send color={color} />,
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="credential/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  runtimeBoundary: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7f9",
  },
  runtimeCard: {
    borderWidth: 1,
    borderColor: "#d8e0e7",
    borderRadius: 18,
    padding: 22,
    backgroundColor: "#fff",
    gap: 8,
  },
  runtimeEyebrow: {
    color: "#365773",
    fontSize: 12,
    fontWeight: "800",
  },
  runtimeTitle: {
    color: "#17202b",
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "800",
  },
  runtimeBody: {
    color: "#526174",
    fontSize: 14,
    lineHeight: 22,
  },
});
