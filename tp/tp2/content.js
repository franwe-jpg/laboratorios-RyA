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
    threats: {
      physicalAccess:
        "Alguien ajeno a la institución ingresa al gabinete del servidor -- " +
        "llave sustraída, gabinete forzado, o aprovechando un horario de bajo " +
        "control (de noche o fin de semana) -- y sustrae el equipo o algún " +
        "componente (disco, memoria).",
      naturalDisaster:
        "Una tormenta con lluvia intensa, asociada a viento patagónico, provoca " +
        "una filtración de agua por el techo o una ventana cercana a la sala del " +
        "servidor, dañando el equipamiento por contacto con humedad.",
      environmental:
        "Un corte de energía eléctrica, seguido de un pico de tensión al " +
        "restablecerse el suministro sin protección adecuada (UPS o supresor de " +
        "picos), daña la fuente de alimentación del servidor.",
    },
    findings: [
      {
        finding: "El gabinete del servidor no se cierra con llave",
        image: "assets/hallazgo1.png",
        note:
          "La compuerta del gabinete permanece habitualmente abierta y no se usa " +
          "ningún candado. Esto anula por completo la capa de \"rack\" del " +
          "relevamiento de A.1: cualquiera que llegue hasta ahí tiene acceso " +
          "directo al servidor.",
      },
      {
        finding: "Tomacorriente sobrecargado con zapatillas encadenadas",
        image: "assets/hallazgo2.png",
        note:
          "Varias zapatillas conectadas en cadena sobre una única toma de pared. " +
          "Es una amenaza autoinfligida de la familia \"alteraciones del " +
          "entorno\": aumenta el riesgo de sobrecarga y de incendio eléctrico, " +
          "sin que medie ningún factor externo.",
      },
      {
        finding: "El puesto de control queda sin supervisión",
        image: "assets/hallazgo3.png",
        note:
          "Cuando el recepcionista se ausenta, no hay ningún control de acceso " +
          "activo en su lugar ni forma de registrar quién entró o salió durante " +
          "esa ventana de tiempo.",
      },
    ],
  },

  // ---- Parte B: laboratorio (executed evidence) ----
  parteB: {
    b1: {
      intro:
        "El contenedor arys-lab:bookworm no tiene privilegios para manipular " +
        "loop devices ni dispositivos de mapeo por defecto. Se ejecutó con: " +
        "--cap-add=SYS_ADMIN --device /dev/loop-control --device /dev/loop42 " +
        "--device /dev/mapper/control --device-cgroup-rule=\"b <major " +
        "device-mapper>:* rmw\" --security-opt apparmor=unconfined (ver README " +
        "de docker/ para el detalle de cada flag). luksOpen usó --disable-keyring " +
        "porque el keyring del kernel no está disponible dentro del contenedor.",
      runs: [
        {
          caption: "Creación del archivo-disco y del dispositivo de loop",
          command:
            "dd if=/dev/zero of=disco_lab.img bs=1M count=2048\n" +
            "losetup /dev/loop42 disco_lab.img",
          output:
            "2048+0 records in\n2048+0 records out\n" +
            "2147483648 bytes (2.1 GB, 2.0 GiB) copied, 1.49 s, 1.4 GB/s",
        },
        {
          caption: "Cifrado (luksFormat) y apertura (luksOpen)",
          command:
            "cryptsetup luksFormat /dev/loop42\n" +
            "cryptsetup luksOpen --disable-keyring /dev/loop42 caja_fuerte",
          output:
            "WARNING!\n========\n" +
            "This will overwrite data on /dev/loop42 irrevocably.\n\n" +
            "Are you sure? (Type 'yes' in capital letters): YES\n" +
            "Enter passphrase for /lab/disco_lab.img: \n" +
            "Verify passphrase: \n" +
            "Enter passphrase for /lab/disco_lab.img: ",
        },
        {
          caption: "Formateo, montaje y prueba de escritura/lectura",
          command:
            "mkfs.ext4 /dev/mapper/caja_fuerte\n" +
            "mkdir -p /mnt/caja && mount /dev/mapper/caja_fuerte /mnt/caja\n" +
            "echo \"secreto de laboratorio\" > /mnt/caja/secreto.txt\n" +
            "cat /mnt/caja/secreto.txt",
          output:
            "mke2fs 1.47.0 (5-Feb-2023)\n" +
            "Creating filesystem with 520192 4k blocks and 130048 inodes\n" +
            "Filesystem UUID: 6f085a99-5da9-402d-9320-6f4329fa9294\n" +
            "[... salida de mke2fs omitida ...]\n\n" +
            "secreto de laboratorio",
        },
        {
          caption: "Inspección del header LUKS (luksDump)",
          command: "cryptsetup luksDump /dev/loop42",
          output:
            "LUKS header information\n" +
            "Version:        2\n" +
            "UUID:           1704997b-ccdf-4145-b356-1bebac59fb0b\n\n" +
            "Data segments:\n  0: crypt\n" +
            "        cipher: aes-xts-plain64\n" +
            "        sector: 512 [bytes]\n\n" +
            "Keyslots:\n  0: luks2\n" +
            "        Key:        512 bits\n" +
            "        Cipher:     aes-xts-plain64\n" +
            "        PBKDF:      argon2id",
        },
        {
          caption: "Cierre y prueba de inaccesibilidad sin la passphrase",
          command:
            "umount /mnt/caja\n" +
            "cryptsetup luksClose caja_fuerte\n" +
            "mount /dev/loop42 /mnt/caja",
          output:
            "mount: /mnt/caja: unknown filesystem type 'crypto_LUKS'.",
        },
      ],
      answer:
        "El cifrado de disco completo (LUKS) neutraliza el ataque de robo de " +
        "medio apagado: si roban la notebook o el disco apagados, o se extrae el " +
        "disco físicamente para leerlo en otra máquina, el contenido es " +
        "indistinguible de ruido -- el sistema ni siquiera reconoce el tipo de " +
        "sistema de archivos, como se ve en el último comando (\"unknown " +
        "filesystem type 'crypto_LUKS'\").\n\n" +
        "Lo que NO neutraliza es un ataque contra el equipo encendido y " +
        "desbloqueado: mientras la sesión está abierta (después de luksOpen y " +
        "montado), el sistema operativo ve el contenido en texto plano como " +
        "cualquier archivo normal, tal como se demostró al leer secreto.txt en " +
        "el paso anterior. Un atacante con acceso a la sesión activa, o que la " +
        "roba en caliente, no encuentra ninguna barrera del cifrado de disco.",
    },
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
