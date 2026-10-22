// Categorías fijas del stock. La IA elige siempre una de estas, así el filtro no se llena de variantes.
export const CATEGORIAS = [
  "Carrocería",
  "Iluminación",
  "Cristales",
  "Interior",
  "Motor",
  "Eléctrico",
  "Refrigeración",
  "Frenos",
  "Suspensión y dirección",
  "Transmisión",
  "Escape",
  "Ruedas",
  "Otros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

// Guía para la IA: qué piezas van en cada categoría.
export const GUIA_CATEGORIAS = `Categorías (elegí exactamente una):
- Carrocería: paragolpes, guardabarros, puertas, capot, baúl/portón, techo, zócalos, espejos, parrillas, molduras, manijas exteriores, paneles.
- Iluminación: ópticas, faros, faros antiniebla, calaveras/faros traseros, giros, lámparas.
- Cristales: parabrisas, lunetas, vidrios de puertas, ventiletes.
- Interior: tablero, butacas, tapizados, paneles de puerta, volante, alfombras, consola, cinturones.
- Motor: bloque, tapa de cilindros, turbo, inyección, carburador, distribución, bombas de aceite/nafta, burro de arranque, alternador, filtros, soportes de motor.
- Eléctrico: módulos/ECU, sensores, tableros de instrumentos, levantavidrios, cableado, llaves, bocinas, limpiaparabrisas.
- Refrigeración: radiador, electroventilador, bomba de agua, termostato, depósito, aire acondicionado y calefacción.
- Frenos: discos, pastillas, campanas, cintas, cálipers, bomba de freno, ABS.
- Suspensión y dirección: amortiguadores, espirales, parrillas de suspensión, rótulas, extremos, cremallera, bomba de dirección, mazas.
- Transmisión: caja de cambios, embrague, semiejes, homocinéticas, cardán, diferencial.
- Escape: múltiple, caño, silenciador, catalizador.
- Ruedas: llantas, cubiertas, tazas, auxilio.
- Otros: lo que no encaje en ninguna.`;

const SINONIMOS: [RegExp, Categoria][] = [
  [/carrocer|chapa|paragolpe|guardabarro|puerta|capot|espejo|parrilla frontal/i, "Carrocería"],
  [/ilumin|óptica|optica|faro|calavera|luz|luces/i, "Iluminación"],
  [/cristal|vidrio|parabrisa|luneta/i, "Cristales"],
  [/interior|tapiz|butaca|tablero|volante/i, "Interior"],
  [/motor|inyecci|turbo|filtro|arranque|alternador/i, "Motor"],
  [/el[ée]ctric|electr[oó]nic|sensor|m[oó]dulo/i, "Eléctrico"],
  [/refrigera|radiador|climatiz|aire acond|calefac/i, "Refrigeración"],
  [/freno/i, "Frenos"],
  [/suspensi|direcci|amortigu/i, "Suspensión y dirección"],
  [/transmisi|embrague|caja de cambio|semieje|homocin/i, "Transmisión"],
  [/escape|silenciador|catalizador/i, "Escape"],
  [/rueda|llanta|cubierta|neum/i, "Ruedas"],
  [/otro/i, "Otros"],
];

// Lleva un texto libre ("Chapa", "Iluminacion", "Faros") a una categoría fija, o null si no hay pista.
export function normalizarCategoria(texto: string | null | undefined): Categoria | null {
  if (!texto) return null;
  const exacta = CATEGORIAS.find((c) => c.toLowerCase() === texto.trim().toLowerCase());
  if (exacta) return exacta;
  return SINONIMOS.find(([re]) => re.test(texto))?.[1] ?? null;
}
