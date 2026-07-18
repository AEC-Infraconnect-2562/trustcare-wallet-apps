import { matchPath } from "react-router-dom";
import type { View } from "../views/appViewModel";

export type WalletPlaceholderRouteId =
  "active_shares" | "connections" | "family";

export type WalletRouteId =
  | "home"
  | "records"
  | "receive"
  | "prepare"
  | "share"
  | "activity"
  | "settings"
  | "verify"
  | WalletPlaceholderRouteId
  | "records_store";

export type WalletRouteDefinition = {
  id: WalletRouteId;
  path: string;
  view: View | null;
  title: string;
  subtitle: string;
  breadcrumb: string;
};

export type WalletRouteMatch = {
  route: WalletRouteDefinition;
  params: Readonly<Record<string, string | undefined>>;
  redirectTo?: string;
};

export const walletRouteDefinitions: readonly WalletRouteDefinition[] = [
  {
    id: "home",
    path: "/home",
    view: "home",
    title: "TrustCare Wallet",
    subtitle: "เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้",
    breadcrumb: "หน้าแรก",
  },
  {
    id: "records",
    path: "/records",
    view: "documents",
    title: "เอกสารสุขภาพ",
    subtitle: "ค้นหา กรอง ปักหมุด และตรวจดูเอกสารสุขภาพที่ตรวจสอบได้",
    breadcrumb: "เอกสาร",
  },
  {
    id: "records_store",
    path: "/records/store",
    view: "store",
    title: "คลังพกพา",
    subtitle:
      "ตรวจดูและส่งออกเอกสาร ลิงก์สุขภาพ และหลักฐานการแชร์ที่เก็บไว้ในเครื่องนี้",
    breadcrumb: "คลังข้อมูล",
  },
  {
    id: "receive",
    path: "/receive",
    view: "receive",
    title: "รับเอกสาร",
    subtitle:
      "สแกน QR วางลิงก์ หรืออัปโหลดไฟล์ เพื่อรับเอกสารสุขภาพเข้ากระเป๋า",
    breadcrumb: "รับเอกสาร",
  },
  {
    id: "prepare",
    path: "/prepare",
    view: "prepare",
    title: "เตรียมเข้ารับบริการ",
    subtitle:
      "ตรวจว่าเอกสารพร้อมสำหรับบริการที่จะไป แล้วไปสร้าง QR ในหน้าแชร์",
    breadcrumb: "เตรียมบริการ",
  },
  {
    id: "share",
    path: "/share",
    view: "share",
    title: "แชร์เอกสาร",
    subtitle: "สร้าง QR และเลือกข้อมูลตามวัตถุประสงค์การใช้งาน",
    breadcrumb: "แชร์",
  },
  {
    id: "active_shares",
    path: "/shares/active",
    view: null,
    title: "การแชร์ที่ยังใช้งาน",
    subtitle: "ตรวจสอบอายุ การเข้าถึง และหยุดการแชร์จากจุดเดียว",
    breadcrumb: "การแชร์ที่ยังใช้งาน",
  },
  {
    id: "activity",
    path: "/activity",
    view: "history",
    title: "กิจกรรม",
    subtitle: "ประวัติการรับ เปิด แสดงข้อมูล ตรวจสอบ และแชร์",
    breadcrumb: "กิจกรรม",
  },
  {
    id: "connections",
    path: "/connections",
    view: null,
    title: "การเชื่อมต่อ",
    subtitle: "จัดการโรงพยาบาล TrustCare Portal และแหล่งเอกสารที่อนุญาต",
    breadcrumb: "การเชื่อมต่อ",
  },
  {
    id: "family",
    path: "/family",
    view: null,
    title: "ครอบครัวและผู้รับมอบอำนาจ",
    subtitle: "จัดการความสัมพันธ์ ขอบเขต และระยะเวลาการดูแลแทนอย่างชัดเจน",
    breadcrumb: "ครอบครัว",
  },
  {
    id: "settings",
    path: "/settings",
    view: "settings",
    title: "ตั้งค่า",
    subtitle: "ตัวตน ความปลอดภัย ภาษา ธีม และโหมดนักพัฒนา",
    breadcrumb: "ตั้งค่า",
  },
  {
    id: "verify",
    path: "/verify",
    view: null,
    title: "ตรวจสอบเอกสาร",
    subtitle: "ตรวจสอบความถูกต้องของเอกสารที่ได้รับจากลิงก์หรือ QR",
    breadcrumb: "ตรวจสอบ",
  },
] as const;

const viewPaths: Record<View, string> = {
  home: "/home",
  documents: "/records",
  receive: "/receive",
  share: "/share",
  prepare: "/prepare",
  store: "/records/store",
  history: "/activity",
  settings: "/settings",
};

const parameterizedRoutes = [
  { pattern: "/records/:recordId", routeId: "records" },
  { pattern: "/prepare/:serviceProfileId", routeId: "prepare" },
  { pattern: "/share/requests/:requestId", routeId: "share" },
  { pattern: "/verify/:artifactId", routeId: "verify" },
] as const;

export function pathForView(view: View): string {
  return viewPaths[view];
}

export function isPlaceholderRouteId(
  routeId: WalletRouteId,
): routeId is WalletPlaceholderRouteId {
  return (
    routeId === "active_shares" ||
    routeId === "connections" ||
    routeId === "family"
  );
}

export function resolveWalletRoute(pathname: string): WalletRouteMatch {
  const normalized = normalizePathname(pathname);
  const home = routeById("home");
  if (normalized === "/") {
    return { route: home, params: {}, redirectTo: home.path };
  }

  for (const route of walletRouteDefinitions) {
    const match = matchPath({ path: route.path, end: true }, normalized);
    if (match) return { route, params: match.params };
  }

  for (const candidate of parameterizedRoutes) {
    const match = matchPath({ path: candidate.pattern, end: true }, normalized);
    if (match) {
      return {
        route: routeById(candidate.routeId),
        params: decodeRouteParams(match.params),
      };
    }
  }

  return { route: home, params: {}, redirectTo: home.path };
}

function decodeRouteParams(
  params: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (value === undefined) return [key, value];
      try {
        return [key, decodeURIComponent(value)];
      } catch {
        return [key, value];
      }
    }),
  );
}

export function routerBasename(baseUrl: string): string {
  const normalized = `/${baseUrl.trim().replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/" : normalized;
}

function routeById(id: WalletRouteId): WalletRouteDefinition {
  const route = walletRouteDefinitions.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Unknown wallet route: ${id}`);
  return route;
}

function normalizePathname(pathname: string): string {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/g, "")
    : withLeadingSlash;
}
