import "server-only";
import { crearMotor } from "@natgeo23/nucleo-whatsapp";
import { crearAlmacenSupabase } from "@natgeo23/nucleo-whatsapp/supabase";
import { db } from "@/lib/supabase";
import { emergencia, generar } from "./agente";
import { equipo, mensajeDelEquipo, reenviarATomador } from "./equipo";
import { canal } from "./evolution";

// Stefy sobre el núcleo de WhatsApp (@natgeo23/nucleo-whatsapp): el núcleo maneja ráfagas, turnos,
// ritmo, reintentos y salvaguardas; acá va lo propio de Safetycar.
let motor: ReturnType<typeof crearMotor> | null = null;

export function motorStefy() {
  motor ??= crearMotor({
    // Las tablas de siempre (wa_chats, wa_mensajes); el asistente se guarda como "bot".
    almacen: crearAlmacenSupabase(db(), { tablas: { conocidos: null }, rolAsistente: "bot" }),
    canal: canal(),
    generar,
    emergencia,
    modo: () => (process.env.BOT_MODO as "prueba" | "activo" | "apagado") || "prueba",
    numerosPrueba: () => process.env.BOT_NUMEROS_PRUEBA,
    // Si alguien de ventas contesta desde el WhatsApp del local, Stefy se calla en ese chat 6 horas.
    alEscribirPersona: { tipo: "pausar", horas: 6 },
    // Alguien de ventas tomando una consulta desde su celular: no es un cliente.
    interceptar: async (e) => {
      const vendedor = equipo().find((v) => v.numero === e.telefono);
      return !!vendedor && (await mensajeDelEquipo(vendedor, e.texto, e.citado));
    },
    // Fotos o videos nuevos de una consulta que ya tomó alguien: se los reenvía, en paralelo a la respuesta.
    alRecibir: async (e) => {
      if (e.media) await reenviarATomador(e.jid, [e.id]);
    },
    // Stefy escribe a su manera (rioplatense, con "¡Buen día!"): sin el estilo de Isa, hasta 2 mensajes.
    estilo: { comoPersona: false, maxMensajes: 2 },
  });
  return motor;
}
