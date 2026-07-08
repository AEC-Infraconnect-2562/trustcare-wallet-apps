import { Tabs } from "expo-router";
import { Activity, Database, Home, QrCode, Send, Settings } from "lucide-react-native";
import { NativeLanguageProvider } from "@trustcare/i18n/src/provider.native";
import { MobileWalletSessionProvider } from "../src/hooks/useActiveWalletUser";
import { MobileSecuritySettingsProvider, useMobileSecuritySettings } from "../src/hooks/useMobileSecuritySettings";

export default function RootLayout() {
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
      <Tabs.Screen name="index" options={{ title: "หน้าแรก", tabBarIcon: ({ color }) => <Home color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: "รับ", tabBarIcon: ({ color }) => <QrCode color={color} /> }} />
      <Tabs.Screen name="share" options={{ title: "แชร์", tabBarIcon: ({ color }) => <Send color={color} /> }} />
      <Tabs.Screen name="prepare" options={{ title: "เตรียม", tabBarIcon: ({ color }) => <Activity color={color} /> }} />
      <Tabs.Screen name="store" options={{ title: "คลัง", tabBarIcon: ({ color }) => <Database color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "ตั้งค่า", tabBarIcon: ({ color }) => <Settings color={color} /> }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="credential/[id]" options={{ href: null }} />
    </Tabs>
  );
}
