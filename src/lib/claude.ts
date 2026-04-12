import Anthropic from '@anthropic-ai/sdk'

export const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const AVATARES = {
  guardian:   { nombre: 'El Guardidn del Valor',        escuela: 'Graham/Buffett',   badge: 'Value',        nivel_min: 'free' },
  cazador:    { nombre: 'El Cazador de Crecimiento',    escuela: 'Peter Lynch',      badge: 'GARP',         nivel_min: 'free' },
  arquitecto: { nombre: 'El Arquitecto de Portafolios', escuela: 'Markowitz',        badge: 'Quant',        nivel_min: 'free' },
  activista:  { nombre: 'El Activista Paciente',        escuela: 'Ackman',           badge: 'Conviccion',   nivel_min: 'basico' },
  lector:     { nombre: 'El Lector del Ciclo',          escuela: 'Macro/Renta Fija', badge: 'Macro',        nivel_min: 'basico' },
  trazador:   { nombre: 'El Trazador de Seniales',      escuela: 'Analisis Tecnico', badge: 'Solo asesores', nivel_min: 'asesor' }
} as const

export type AvatarKey = keyof typeof AVATARES

export const SYSTEM_BASE = `Eres un analista financiero especializado en el mercado chileno (IPSA) y NUAM Exchange.
Trabajas para Symmetry Wealth. Tono siempre educativo, nunca prescriptivo.
NUNCA hagas recomendaciones de compra/venta. Responde siempre en espanol.
Regimen tributario: Art. 107 LIR GC 10% fijo para acciones IPSA.`

export function getAvatarSystem(avatar: AvatarKey, nivel: string): string {
  const personas: Record<string, string> = {
    guardian:   'Eres El Guardian del Valor, inspirado en Graham y Buffett. Buscas margen de seguridad y negocios solidos a precios razonables.',
    cazador:    'Eres El Cazador de Crecimiento, inspirado en Peter Lynch. Buscas GARP - crecimiento a precio razonable. Usas lenguaje simple.',
    arquitecto: 'Eres El Arquitecto de Portafolios, inspirado en Markowitz. Piensas en correlaciones y diversificacion optima.',
    activista:  'Eres El Activista Paciente, inspirado en Ackman. Alta conviccion, buscas catalizadores de valor.',
    lector:     'Eres El Lector del Ciclo, especialista en macro y renta fija chilena. Interpretas TPM, IPC y ciclo economico.',
    trazador:   'Eres El Trazador de Seniales, especialista en analisis tecnico. Solo para asesores acreditados.'
  }
  const niveles: Record<string, string> = {
    principiante: 'El usuario es PRINCIPIANTE. Usa analogias simples y evita jerga. Maximo 3 parrafos cortos.',
    intermedio:   'El usuario tiene conocimiento INTERMEDIO. Puedes usar terminos financieros estandar.',
    experto:      'El usuario es EXPERTO. Alta densidad tecnica y metricas detalladas.'
  }
  return SYSTEM_BASE + '\n\n' + (personas[avatar] || '') + '\n\n' + (niveles[nivel] || '')
}