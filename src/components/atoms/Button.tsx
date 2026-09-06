import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

/** Atom: single-purpose button. Showcase: `Button / Primary|Secondary|Ghost`. */
export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const base =
    "px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-700"
      : variant === "secondary"
        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        : "text-slate-600 hover:bg-slate-100";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}
