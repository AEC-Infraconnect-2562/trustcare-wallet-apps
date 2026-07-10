import { Button, Surface } from "@trustcare/ui-web";
import type { View } from "../../views/appViewModel";
import type { WalletPlaceholderRouteId } from "../../routing/appRoutes";

const placeholderCopy: Record<
  WalletPlaceholderRouteId,
  { heading: string; body: string; action: string; target: View }
> = {
  active_shares: {
    heading: "กำลังเตรียมพื้นที่จัดการการแชร์",
    body: "พื้นที่นี้จะแสดงผู้รับ วัตถุประสงค์ วันหมดอายุ ประวัติการเข้าถึง และการหยุดหรือสร้างการแชร์ใหม่",
    action: "ไปหน้าแชร์",
    target: "share",
  },
  connections: {
    heading: "กำลังเตรียมพื้นที่จัดการแหล่งเอกสาร",
    body: "พื้นที่นี้จะใช้เชื่อมต่อโรงพยาบาล ตรวจสอบสถานะการรับเอกสาร และยกเลิกการเชื่อมต่อได้อย่างชัดเจน",
    action: "ไปรับเอกสาร",
    target: "receive",
  },
  family: {
    heading: "กำลังเตรียมความสัมพันธ์และสิทธิ์ดูแลแทน",
    body: "พื้นที่นี้จะใช้จัดการผู้พึ่งพิง ผู้ดูแล ผู้รับมอบอำนาจ ขอบเขต ระยะเวลา การเพิกถอน และประวัติที่ตรวจสอบได้",
    action: "ไปตั้งค่าความปลอดภัย",
    target: "settings",
  },
};

export function RoutePlaceholderView({
  routeId,
  onNavigate,
}: {
  routeId: WalletPlaceholderRouteId;
  onNavigate: (view: View) => void;
}) {
  const copy = placeholderCopy[routeId];
  return (
    <div className="view-stack">
      <Surface>
        <span className="eyebrow">กำลังพัฒนาอย่างเป็นขั้นตอน</span>
        <h2>{copy.heading}</h2>
        <p>{copy.body}</p>
        <Button className="secondary" onClick={() => onNavigate(copy.target)}>
          {copy.action}
        </Button>
      </Surface>
    </div>
  );
}
