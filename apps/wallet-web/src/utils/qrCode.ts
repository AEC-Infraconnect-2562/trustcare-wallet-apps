type QrDataUrlOptions = {
  margin?: number;
  width?: number;
};

export async function toQrDataUrl(
  value: string,
  options: QrDataUrlOptions = {},
) {
  const QRCode = await import("qrcode");
  return QRCode.default.toDataURL(value, options);
}
