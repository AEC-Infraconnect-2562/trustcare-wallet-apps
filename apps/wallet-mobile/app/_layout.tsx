import { Tabs } from "expo-router";
import { Archive, Clock, QrCode, Settings, Wallet } from "lucide-react-native";
import { NativeLanguageProvider } from "@trustcare/i18n/src/provider.native";

export default function RootLayout() {
  return (
    <NativeLanguageProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#4f67f2",
          tabBarInactiveTintColor: "#9ca3af",
          tabBarStyle: { height: 76, paddingBottom: 10, paddingTop: 8 }
        }}
      >
        <Tabs.Screen name="index" options={{ title: "กระเป๋า", tabBarIcon: ({ color }) => <Wallet color={color} /> }} />
        <Tabs.Screen name="share" options={{ title: "แชร์", tabBarIcon: ({ color }) => <QrCode color={color} /> }} />
        <Tabs.Screen name="scan" options={{ title: "สแกน", tabBarIcon: ({ color }) => <Archive color={color} /> }} />
        <Tabs.Screen name="history" options={{ title: "กิจกรรม", tabBarIcon: ({ color }) => <Clock color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "ตั้งค่า", tabBarIcon: ({ color }) => <Settings color={color} /> }} />
        <Tabs.Screen name="credential/[id]" options={{ href: null }} />
      </Tabs>
    </NativeLanguageProvider>
  );
}

