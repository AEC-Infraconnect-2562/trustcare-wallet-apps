import { darkColors, lightColors, trustBadge } from "./colors";
import { radius } from "./radius";
import { typography } from "./typography";
import { gradientForCardType, walletCardGradients } from "./gradients";

export const nativeTheme = {
  light: lightColors,
  dark: darkColors,
  radius,
  typography,
  trustBadge,
  gradients: walletCardGradients,
  gradientForCardType
} as const;

