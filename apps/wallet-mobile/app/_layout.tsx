import { Tabs } from "expo-router";
import { Activity, Database, Home, QrCode, Send, Settings } from "lucide-react-native";
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
          tabBarLabelStyle: { fontWeight: "800", fontSize: 12 }
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
    </NativeLanguageProvider>
  );
}
