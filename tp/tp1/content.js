// TP1 content source. Each activity is filled in as it is completed.
// `null` marks a section still pending. The build script renders only
// what exists, so the document is always a truthful snapshot of progress.

module.exports = {
  meta: {
    title: "Trabajo Práctico 1 — Conceptos de Seguridad",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Septiembre 2026",
  },

  // ---- Parte A: inventario y tríada CIA (analysis, owner-authored) ----
  parteA: {
    assets: [
      {
        asset: "Clave privada (.pem) de acceso a la VM de producción",
        pillar: "Confidencialidad",
        justification:
          "Es la llave de entrada a producción. Si se filtra, un tercero entra con " +
          "mis mismos permisos. Perderla es recuperable rotando el par de claves; " +
          "que se filtre, no.",
      },
      {
        asset: "Clave SSH de acceso a los repositorios (frontend y backend)",
        pillar: "Confidencialidad",
        justification:
          "Si se filtra, el atacante no solo lee el código: puede modificarlo y " +
          "subirlo. La pérdida de confidencialidad de la clave se convierte en " +
          "pérdida de integridad del software.",
      },
      {
        asset: "Copias locales de bases de datos de producción",
        pillar: "Confidencialidad",
        justification:
          "Contienen datos reales de producción fuera del entorno controlado que " +
          "los protege. Es el activo de mayor exposición: si la notebook se pierde " +
          "o es comprometida, el daño ya está hecho.",
      },
      {
        asset: "Esquema de usuarios y permisos de la base de datos de producción",
        pillar: "Integridad",
        justification:
          "Define quién puede leer y quién puede escribir en producción. Si alguien " +
          "lo altera y se otorga permisos de escritura, el control de acceso deja de " +
          "existir sin que nadie se entere. Lo crítico no es que se vea, es que no " +
          "se modifique.",
      },
      {
        asset: "La VM de producción y los servicios que expone",
        pillar: "Disponibilidad",
        justification:
          "Si la VM se cae, los sistemas dejan de operar. Acá el pilar crítico se " +
          "invierte: importa menos quién ve el contenido que el servicio siga en pie.",
      },
    ],
    riskAnalysis: {
      asset: "Copias locales de bases de datos de producción",
      threat:
        "Acceso físico no autorizado al equipo: robo o extravío de la notebook, " +
        "o un tercero que aprovecha una sesión desatendida sin bloquear.",
      vulnerability:
        "Las copias se guardan sin cifrar en el disco. La contraseña del sistema " +
        "operativo protege la sesión, no el archivo: alcanza con arrancar desde " +
        "otro medio o extraer el disco para leerlo en texto plano.",
      impact: "Alto",
      likelihood: "Media",
      rationale:
        "El impacto es Alto porque las copias contienen datos personales " +
        "identificables junto con género y orientación política. La Ley 25.326 " +
        "de Protección de Datos Personales clasifica las opiniones políticas como " +
        "dato sensible, así que una filtración no solo perjudica a las personas " +
        "listadas: expone al organismo a responsabilidad legal. Además el daño es " +
        "irreversible — una clave comprometida se rota, unos datos filtrados no " +
        "vuelven.\n\n" +
        "La probabilidad es Media porque habitualmente bloqueo el equipo, lo que " +
        "reduce la ventana de una sesión desatendida. Pero el bloqueo no cubre el " +
        "escenario de robo o extravío: sin cifrado de disco, cualquiera con el " +
        "equipo en la mano llega al archivo.",
    },
  },

  // ---- Parte B: laboratorio (executed evidence) ----
  parteB: {
    b1: null,  // { intro, runs: [{caption, command, output}], answer }
    b2: null,
    b3: null,
    b4: null,
  },

  // ---- Parte C: del riesgo al control (analysis, owner-authored) ----
  parteC: {
    controls: null,      // [{ control, type, pillar, rationale }]
    justification: null, // string
  },
};
