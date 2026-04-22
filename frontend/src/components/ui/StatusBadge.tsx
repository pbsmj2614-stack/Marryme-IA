import { planoBadgeClass, planoLabel } from "@/lib/client-utils";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "purple" | "brand";

const VARIANT_CLASSES: Record<Variant, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-gray-100 text-gray-600",
  purple: "bg-purple-100 text-purple-700",
  brand: "bg-brand-100 text-brand-700",
};

interface StatusBadgeProps {
  label: string;
  variant?: Variant;
  className?: string;
}

export function StatusBadge({ label, variant = "neutral", className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {label}
    </span>
  );
}

interface PlanoBadgeProps {
  plano: string | null;
}

export function PlanoBadge({ plano }: PlanoBadgeProps) {
  if (!plano) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${planoBadgeClass(plano)}`}
    >
      {planoLabel(plano)}
    </span>
  );
}

const NIVEL_MERCADO_CLASSES: Record<string, string> = {
  premium: "bg-purple-100 text-purple-700",
  medio: "bg-blue-100 text-blue-700",
  "medio-alto": "bg-indigo-100 text-indigo-700",
  popular: "bg-gray-100 text-gray-600",
};

interface NivelMercadoBadgeProps {
  nivel: string | null;
}

export function NivelMercadoBadge({ nivel }: NivelMercadoBadgeProps) {
  if (!nivel) return null;
  const key = nivel.toLowerCase().replace(/\s+/g, "-");
  const cls = NIVEL_MERCADO_CLASSES[key] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {nivel}
    </span>
  );
}
