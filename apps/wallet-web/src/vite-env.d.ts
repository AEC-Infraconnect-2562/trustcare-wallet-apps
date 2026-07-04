/// <reference types="vite/client" />

type BarcodeDetectorResult = {
  rawValue: string;
};

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
  static getSupportedFormats?: () => Promise<string[]>;
}

