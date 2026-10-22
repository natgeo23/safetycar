// Íconos de trazo simples (24×24), heredan el color del texto.
const base = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
};

export const IconoFiltro = () => (
  <svg {...base}><path d="M3 5h18l-7 8v5l-4 2v-7z" /></svg>
);

export const IconoLista = () => (
  <svg {...base}><rect x="3" y="4" width="5" height="5" rx="1" /><rect x="3" y="15" width="5" height="5" rx="1" /><path d="M11 6.5h10M11 17.5h10" /></svg>
);

export function IconoGrilla({ columnas }: { columnas: 2 | 3 | 4 }) {
  // Dibuja tantas columnas como tenga la grilla, para que el ícono diga la vista actual.
  const ancho = 18 / columnas;
  return (
    <svg {...base}>
      {Array.from({ length: columnas }, (_, i) => (
        <g key={i}>
          <rect x={3 + i * ancho + 0.5} y="3.5" width={ancho - 1} height={ancho - 1} rx="0.8" />
          <rect x={3 + i * ancho + 0.5} y={4.5 + ancho} width={ancho - 1} height={ancho - 1} rx="0.8" />
        </g>
      ))}
    </svg>
  );
}

export const IconoImportar = () => (
  <svg {...base}><rect x="3" y="3" width="18" height="14" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 13-5-5-8 9" /><path d="M12 21v-5m-2.5 2.5L12 21l2.5-2.5" /></svg>
);

export const IconoVolver = () => (
  <svg {...base} width={26} height={26}><path d="m15 18-6-6 6-6" /></svg>
);

export const IconoCompartir = () => (
  <svg {...base}><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
);

export const IconoCerrar = () => (
  <svg {...base} width={26} height={26}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
