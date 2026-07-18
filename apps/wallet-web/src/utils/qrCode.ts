type QrDataUrlOptions = {
  margin?: number;
  width?: number;
};

const minimumQuietZoneModules = 4;

export async function toQrDataUrl(
  value: string,
  options: QrDataUrlOptions = {},
) {
  const QRCode = await import("qrcode");
  return QRCode.default.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: Math.max(
      minimumQuietZoneModules,
      options.margin ?? minimumQuietZoneModules,
    ),
    width: options.width,
    color: {
      dark: "#0B172AFF",
      light: "#FFFFFFFF",
    },
  });
}
