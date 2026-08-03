// Plantillas de ENCUADRE en lenguaje LLANO (sin jerga de cine): el usuario hace
// click, se rellena una frase completa y clara, y puede editarla. El texto ya
// describe la toma de forma que el modelo re-encuadre bien.
export const FRAMING_TEMPLATES: { label: string; text: string }[] = [
  {
    label: "Vista general",
    text: "una vista general de todo el lugar, mostrando el espacio completo",
  },
  {
    label: "Una zona",
    text: "una zona concreta del lugar vista más de cerca, mostrando algo del entorno alrededor",
  },
  {
    label: "Acercamiento",
    text: "un acercamiento a [escribe aquí el objeto o rincón], con el resto del lugar desenfocado al fondo",
  },
  {
    label: "Desde abajo",
    text: "el lugar visto desde abajo, con la cámara casi a ras del suelo mirando hacia arriba (se ve imponente)",
  },
  {
    label: "Desde arriba",
    text: "el lugar visto desde arriba, como una vista de pájaro mirando hacia abajo",
  },
  {
    label: "Desde la entrada",
    text: "el lugar visto desde la puerta o entrada, mirando hacia adentro",
  },
];

// Explicación simple de qué es un encuadre.
export const FRAMING_HELP =
  "Un encuadre es el mismo lugar visto desde otra posición o distancia de la cámara. Toca una opción para empezar y edítala a tu gusto.";

// Placeholder guía, en lenguaje llano.
export const FRAMING_PLACEHOLDER =
  "Escribe QUÉ parte del lugar quieres ver y DESDE DÓNDE lo mira la cámara. Ej.: «una vista general de todo el lugar» o «un acercamiento a la mesa del fondo».";
