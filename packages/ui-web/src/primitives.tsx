import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("tc-button", className)} {...props} />;
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("tc-icon-button", className)} {...props} />;
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tc-surface", className)} {...props} />;
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "green" | "yellow" | "red" | "blue"; children: ReactNode; className?: string }) {
  return <span className={cn("tc-badge", `tc-badge-${tone}`, className)}>{children}</span>;
}

