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
    b1: {
      intro:
        "Comandos ejecutados dentro del contenedor arys-lab:bookworm " +
        "(docker run --rm -it -v \"$PWD/tp/tp1/work:/lab\" arys-lab:bookworm).",
      runs: [
        {
          command:
            'echo "Transferir 1000 a la cuenta 55" > orden.txt\nsha256sum orden.txt',
          output:
            "0e1280abab19bbd9cddaedf53cce80db1e7c889c46236115886c12366dcf5859  orden.txt",
        },
        {
          command:
            'echo "Transferir 9000 a la cuenta 55" > orden.txt\nsha256sum orden.txt',
          output:
            "7d943b825c066b4c87ddf9e833d3a206d449beee071b6c3a4d2941239a5b9e5f  orden.txt",
        },
      ],
      answer:
        "Cambiar un solo dígito (1000 -> 9000) produjo un hash completamente " +
        "distinto: no comparten ni un tramo reconocible, aunque el contenido del " +
        "archivo casi no cambió. Esto es el efecto avalancha del hash: una " +
        "diferencia mínima en la entrada se traduce en una salida totalmente " +
        "distinta e impredecible, nunca en un hash \"parecido\".\n\n" +
        "Esto es lo que permite detectar una violación de integridad: si guardo " +
        "el hash del archivo cuando confío en su contenido, y más tarde el hash " +
        "recalculado no coincide, sé que el archivo cambió, sin tener que comparar " +
        "el contenido byte a byte ni saber qué se modificó.\n\n" +
        "Pero el hash no sirve para deshacer el cambio. Es una función de una sola " +
        "vía: a partir del hash no se puede reconstruir el contenido original. El " +
        "hash me avisa que \"orden.txt\" fue alterado, pero no me devuelve la orden " +
        "original de 1000 ni me dice qué se modificó. Para eso hace falta otra " +
        "cosa (un backup, un control de versiones), no el hash.",
    },
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
