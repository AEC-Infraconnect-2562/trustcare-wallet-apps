import { Tabs } from "expo-router";
import { Activity, Database, QrCode, Settings, Wallet } from "lucide-react-native";
import { NativeLanguageProvider } from "@trustcare/i18n/src/provider.native";

export default function RootLayout() {
  return (
    <NativeLanguageProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#4f67f2",
          tabBarInactiveTintColor: "#9ca3af",
          tabBarStyle: { height: 78, paddingBottom: 10, paddingTop: 8, borderTopColor: "#d8dfe4" },
          tabBarLabelStyle: { fontWeight: "800" }
        }}
      >
        <Tabs.Screen name="index" options={{ title: "กระเป๋า", tabBarIcon: ({ color }) => <Wallet color={color} /> }} />
        <Tabs.Screen name="prepare" options={{ title: "Prepare", tabBarIcon: ({ color }) => <Activity color={color} /> }} />
        <Tabs.Screen name="scan" options={{ title: "Verify", tabBarIcon: ({ color }) => <QrCode color={color} /> }} />
        <Tabs.Screen name="store" options={{ title: "Store", tabBarIcon: ({ color }) => <Database color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "ตั้งค่า", tabBarIcon: ({ color }) => <Settings color={color} /> }} />
        <Tabs.Screen name="share" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="credential/[id]" options={{ href: null }} />
      </Tabs>
    </NativeLanguageProvider>
  );
}
