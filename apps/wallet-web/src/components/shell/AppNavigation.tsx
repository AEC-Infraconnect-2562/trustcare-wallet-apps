import type { ReactElement } from "react";
import {
  Activity,
  Database,
  FileText,
  History,
  Home,
  Inbox,
  Settings,
  Share2,
} from "lucide-react";
import type { View } from "../../views/appViewModel";

type NavigationProps = {
  routeId: string;
  routeView: View;
  onNavigate: (view: View) => void;
  onOpenDocuments: () => void;
};

export function NavButton({
  active,
  icon,
  label,
  testId,
  onClick,
}: {
  active: boolean;
  icon: ReactElement;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "nav-button active" : "nav-button"}
      data-testid={testId}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function AppPrimaryNavigation({
  routeId,
  routeView,
  onNavigate,
  onOpenDocuments,
  compact = false,
}: NavigationProps & { compact?: boolean }) {
  const documentsActive = ["documents", "receive", "store", "history"].includes(
    routeView,
  );
  return (
    <>
      <NavButton
        active={routeId === "home"}
        icon={<Home />}
        label="หน้าแรก"
        testId="nav-home"
        onClick={() => onNavigate("home")}
      />
      <NavButton
        active={documentsActive}
        icon={<FileText />}
        label="เอกสาร"
        testId="nav-documents"
        onClick={onOpenDocuments}
      />
      <NavButton
        active={routeView === "share"}
        icon={<Share2 />}
        label="แชร์"
        testId="nav-share"
        onClick={() => onNavigate("share")}
      />
      <NavButton
        active={routeView === "prepare"}
        icon={<Activity />}
        label={compact ? "เตรียม" : "เตรียมบริการ"}
        testId="nav-prepare"
        onClick={() => onNavigate("prepare")}
      />
      <NavButton
        active={routeView === "settings"}
        icon={<Settings />}
        label="ตั้งค่า"
        testId="nav-settings"
        onClick={() => onNavigate("settings")}
      />
    </>
  );
}

export function AppSideNavigation({
  routeId,
  routeView,
  onNavigate,
}: Omit<NavigationProps, "onOpenDocuments">) {
  return (
    <>
      <NavButton
        active={routeId === "home"}
        icon={<Home />}
        label="หน้าแรก"
        testId="nav-home"
        onClick={() => onNavigate("home")}
      />
      <NavButton
        active={routeView === "documents"}
        icon={<FileText />}
        label="เอกสาร"
        testId="nav-documents"
        onClick={() => onNavigate("documents")}
      />
      <NavButton
        active={routeView === "receive"}
        icon={<Inbox />}
        label="รับเอกสาร"
        testId="nav-receive"
        onClick={() => onNavigate("receive")}
      />
      <NavButton
        active={routeView === "share"}
        icon={<Share2 />}
        label="แชร์"
        testId="nav-share"
        onClick={() => onNavigate("share")}
      />
      <NavButton
        active={routeView === "prepare"}
        icon={<Activity />}
        label="เตรียมบริการ"
        testId="nav-prepare"
        onClick={() => onNavigate("prepare")}
      />
      <NavButton
        active={routeView === "store"}
        icon={<Database />}
        label="คลังข้อมูล"
        testId="nav-store"
        onClick={() => onNavigate("store")}
      />
      <NavButton
        active={routeView === "history"}
        icon={<History />}
        label="ประวัติ"
        testId="nav-history"
        onClick={() => onNavigate("history")}
      />
      <NavButton
        active={routeView === "settings"}
        icon={<Settings />}
        label="ตั้งค่า"
        testId="nav-settings"
        onClick={() => onNavigate("settings")}
      />
    </>
  );
}
