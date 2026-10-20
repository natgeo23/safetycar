import { Outfit } from "next/font/google";

const outfit = Outfit({ subsets: ["latin"], weight: ["600"] });

// Marca Safety Car: una "S" de cuadrados (gris) y una flecha "<" (verde), unidos en diagonal.
// Grilla de 30 u: cuadrados de 24 u con 6 u de separación.
const S: [number, number][] = [[1, 0], [0, 1], [1, 2], [0, 3]];
const FLECHA: [number, number][] = [[3, 0], [2, 1], [3, 2]];

function Trazo({ celdas, color }: { celdas: [number, number][]; color: string }) {
  const c = (n: number) => n * 30 + 12;
  return (
    <g fill={color} stroke={color}>
      {celdas.slice(1).map(([x, y], i) => (
        <line key={i} x1={c(celdas[i][0])} y1={c(celdas[i][1])} x2={c(x)} y2={c(y)} strokeWidth={7} strokeLinecap="round" />
      ))}
      {celdas.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x * 30} y={y * 30} width={24} height={24} rx={5} stroke="none" />
      ))}
    </g>
  );
}

export function Marca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 114 114" className={className} aria-hidden>
      <Trazo celdas={S} color="var(--color-light)" />
      <Trazo celdas={FLECHA} color="var(--color-brand)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.35em] ${outfit.className} ${className}`} aria-label="Safety Car">
      <Marca className="h-[1.05em] w-[1.05em]" />
      <span className="font-semibold leading-none tracking-tight text-white">
        Safety <span className="text-brand">Car</span>
      </span>
    </span>
  );
}
