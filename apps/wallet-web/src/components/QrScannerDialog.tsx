import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ClipboardPaste, X } from "lucide-react";
import { Button, IconButton } from "@trustcare/ui-web";

export function QrScannerDialog({
  open,
  onClose,
  onScan
}: {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState("กำลังเตรียมกล้อง...");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    let frame = 0;
    const detector = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        streamRef.current = stream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus(detector ? "หันกล้องไปที่ QR Code" : "กล้องพร้อมแล้ว หากเบราว์เซอร์ไม่รองรับ QR detection ให้วาง payload ด้านล่าง");
        const scan = async () => {
          if (!active || !videoRef.current || !detector) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results[0]?.rawValue) {
              onScan(results[0].rawValue);
              onClose();
              return;
            }
          } catch {
            setStatus("ยังอ่าน QR ไม่ได้ ลองจัดให้อยู่ในกรอบและมีแสงเพียงพอ");
          }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "ไม่สามารถเปิดกล้องได้");
      }
    }

    void start();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setManual("");
    };
  }, [open, onClose, onScan]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="scanner-dialog">
        <header className="modal-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button type="button" className="dialog-back-button" onClick={onClose}>
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">รับเอกสาร / สแกน QR</span>
            </div>
            <div className="dialog-heading-row">
              <Camera size={22} />
              <strong>สแกน QR Code</strong>
            </div>
          </div>
          <IconButton aria-label="Close scanner" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="scanner-stage">
          <video ref={videoRef} muted playsInline />
          <div className="scanner-frame" />
        </div>
        <p className="scanner-help">{status}</p>
        <div className="manual-scan">
          <label htmlFor="manual-qr">วาง QR / VC / VP / SHL / OID4VC payload</label>
          <textarea id="manual-qr" value={manual} onChange={event => setManual(event.target.value)} placeholder="https://trustcare.example.com/verifier?vp=..." />
          <Button
            disabled={!manual.trim()}
            onClick={() => {
              if (manual.trim()) {
                onScan(manual.trim());
                onClose();
              }
            }}
          >
            <ClipboardPaste size={18} /> ตรวจสอบจากข้อความ
          </Button>
        </div>
      </div>
    </div>
  );
}
