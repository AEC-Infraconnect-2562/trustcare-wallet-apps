export const RUNTIME_ENVIRONMENTS = [
  "demo",
  "sandbox",
  "pilot",
  "production",
] as const;

export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

export type RuntimeEnvironmentDescriptor = {
  environment: RuntimeEnvironment;
  label: string;
  labelTh: string;
  description: string;
  descriptionTh: string;
  bannerVisible: boolean;
  tone: "blue" | "yellow" | "purple" | "neutral";
  allowsSyntheticData: boolean;
};

export type ResolveRuntimeEnvironmentInput = {
  runtimeEnvironment?: unknown;
  legacyDemoMode?: unknown;
  defaultEnvironment?: RuntimeEnvironment;
};

export type RuntimeServiceEndpoint = {
  name: string;
  url?: string | null;
  requiredIn?: readonly RuntimeEnvironment[];
};

export class RuntimeEnvironmentConfigurationError extends Error {
  readonly code = "TRUSTCARE_RUNTIME_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeEnvironmentConfigurationError";
  }
}

const descriptors: Record<
  RuntimeEnvironment,
  RuntimeEnvironmentDescriptor
> = {
  demo: {
    environment: "demo",
    label: "Demo data",
    labelTh: "ข้อมูลสาธิต",
    description: "Synthetic local data. Not production clinical trust.",
    descriptionTh: "ข้อมูลสังเคราะห์ในเครื่อง ไม่ใช่ความน่าเชื่อถือระดับใช้งานจริง",
    bannerVisible: true,
    tone: "blue",
    allowsSyntheticData: true,
  },
  sandbox: {
    environment: "sandbox",
    label: "Sandbox",
    labelTh: "ระบบทดสอบ",
    description: "Real protocol flows against non-production services.",
    descriptionTh: "ทดสอบโปรโตคอลกับบริการที่ไม่ใช่ Production",
    bannerVisible: true,
    tone: "yellow",
    allowsSyntheticData: false,
  },
  pilot: {
    environment: "pilot",
    label: "Restricted pilot",
    labelTh: "โครงการนำร่องแบบจำกัด",
    description: "Restricted real integration with pilot monitoring.",
    descriptionTh: "การเชื่อมต่อจริงในขอบเขตนำร่องและมีการเฝ้าระวัง",
    bannerVisible: true,
    tone: "purple",
    allowsSyntheticData: false,
  },
  production: {
    environment: "production",
    label: "Production",
    labelTh: "ระบบใช้งานจริง",
    description: "Strict production services with no synthetic-data fallback.",
    descriptionTh: "บริการใช้งานจริงแบบเข้มงวดและไม่ย้อนกลับไปใช้ข้อมูลสาธิต",
    bannerVisible: false,
    tone: "neutral",
    allowsSyntheticData: false,
  },
};

export function isRuntimeEnvironment(
  value: unknown,
): value is RuntimeEnvironment {
  return (
    typeof value === "string" &&
    (RUNTIME_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

export function parseOptionalBooleanFlag(
  value: unknown,
  name = "boolean flag",
): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new RuntimeEnvironmentConfigurationError(
    `${name} must be explicitly set to true or false.`,
  );
}

export function resolveRuntimeEnvironment(
  input: ResolveRuntimeEnvironmentInput = {},
): RuntimeEnvironment {
  const explicit = input.runtimeEnvironment;
  if (
    explicit !== undefined &&
    explicit !== null &&
    explicit !== "" &&
    !isRuntimeEnvironment(explicit)
  ) {
    throw new RuntimeEnvironmentConfigurationError(
      `Unsupported TrustCare runtime environment: ${String(explicit)}.`,
    );
  }

  const environment = isRuntimeEnvironment(explicit) ? explicit : undefined;
  const legacyDemoMode = parseOptionalBooleanFlag(
    input.legacyDemoMode,
    "legacy demo mode",
  );

  if (
    environment &&
    legacyDemoMode !== undefined &&
    (environment === "demo") !== legacyDemoMode
  ) {
    throw new RuntimeEnvironmentConfigurationError(
      `Runtime environment ${environment} conflicts with legacy demo mode ${String(legacyDemoMode)}.`,
    );
  }

  if (environment) return environment;
  if (legacyDemoMode !== undefined)
    return legacyDemoMode ? "demo" : "production";
  return input.defaultEnvironment ?? "production";
}

export function runtimeEnvironmentDescriptor(
  environment: RuntimeEnvironment,
): RuntimeEnvironmentDescriptor {
  return descriptors[environment];
}

export function runtimeAllowsSyntheticData(
  environment: RuntimeEnvironment,
): boolean {
  return descriptors[environment].allowsSyntheticData;
}

export function assertRuntimeAllowsSyntheticData(
  environment: RuntimeEnvironment,
): void {
  if (runtimeAllowsSyntheticData(environment)) return;
  throw new RuntimeEnvironmentConfigurationError(
    `Synthetic Wallet data is disabled in ${environment} mode.`,
  );
}

export function assertRuntimeServiceEndpoints(input: {
  environment: RuntimeEnvironment;
  endpoints: readonly RuntimeServiceEndpoint[];
}): void {
  for (const endpoint of input.endpoints) {
    const requiredIn = endpoint.requiredIn ?? ["pilot", "production"];
    if (!requiredIn.includes(input.environment)) continue;
    if (!endpoint.url?.trim()) {
      throw new RuntimeEnvironmentConfigurationError(
        `${endpoint.name} URL is required in ${input.environment} mode.`,
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(endpoint.url);
    } catch {
      throw new RuntimeEnvironmentConfigurationError(
        `${endpoint.name} URL is invalid.`,
      );
    }
    if (parsed.protocol !== "https:") {
      throw new RuntimeEnvironmentConfigurationError(
        `${endpoint.name} URL must use HTTPS in ${input.environment} mode.`,
      );
    }
  }
}
