// TP2 content source. Each activity is filled in as it is completed.
// `null` marks a section still pending. The build script renders only
// what exists, so the document is always a truthful snapshot of progress.

module.exports = {
  meta: {
    title: "Trabajo Práctico 2 — Seguridad Física",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Septiembre 2026",
  },

  // ---- Parte A: relevamiento de un entorno (analysis, owner-authored) ----
  parteA: {
    layers: {
      description:
        "Entorno: el DIT (edificio de Informática de la universidad) donde se " +
        "cursan las clases.\n\n" +
        "Perímetro: puerta de entrada al edificio.\n" +
        "Edificio: escalera y puerta de acceso al piso de aulas.\n" +
        "Sala: un recepcionista (persona administrativa) que supervisa y " +
        "controla quién entra y quién sale.\n" +
        "Rack: junto al recepcionista, el servidor y el equipo de red están " +
        "dentro de un gabinete cerrado con llave.",
      missingLayer:
        "Equipo. El servidor solo tiene protección lógica (contraseña de acceso " +
        "por SSH), pero ningún control físico propio. Si alguien ya está frente " +
        "al equipo -- el gabinete quedó abierto, fue forzado, o alguien con la " +
        "llave actúa de mala fe -- no hay nada que lo frene: puede extraer el " +
        "disco, bootear desde un USB o clonarlo, sin necesitar ninguna " +
        "contraseña. Una contraseña SSH protege el acceso remoto por red, no el " +
        "acceso físico al hardware.",
    },
    controls: [
      { control: "Puerta de entrada al edificio", type: "Preventivo" },
      { control: "Puerta de acceso al piso de aulas", type: "Preventivo" },
      { control: "Recepcionista controlando ingresos y egresos", type: "Compensatorio" },
      { control: "Gabinete cerrado con llave para el servidor", type: "Preventivo" },
      { control: "Cámaras de seguridad (CCTV)", type: "Detectivo" },
      { control: "Extintor de incendios", type: "Correctivo" },
      { control: "Cartel de \"zona vigilada por cámaras\"", type: "Disuasivo" },
      { control: "Luces exteriores del edificio encendidas de noche", type: "Disuasivo" },
      { control: "Señalización y salida de emergencia", type: "Correctivo" },
      { control: "Detector de humo en el pasillo", type: "Detectivo" },
    ],
    threats: null,       // { physicalAccess, naturalDisaster, environmental }
    findings: null,      // [{ finding, note }]  (3 items; photos/sketches handled separately)
  },

  // ---- Parte B: laboratorio (executed evidence) ----
  parteB: {
    b1: null,  // LUKS: { intro, runs: [{caption, command, output}], answer }
    b2: null,  // USBGuard
    b3: null,  // UPS / theoretical
  },

  // ---- Parte C: plan de mejora priorizado (analysis, owner-authored) ----
  parteC: {
    riskTable: null,     // [{ finding, threat, impact, likelihood, control, type, priority }]
    frameworkNote: null, // string: ISO 27001 Anexo A / NIST 800-53 mapping
    conclusion: null,    // string
  },
};
