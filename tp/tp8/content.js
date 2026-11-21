// TP8 content source. Every transcript run is a literal output of work/lab.sh,
// executed inside the tp8-lab container (see compose.yaml) and captured in
// work/transcript.txt, delimited by @@CMD / @@OUT / @@END markers.

const fs = require("fs");
const path = require("path");

const T = [];
for (const block of fs.readFileSync(path.join(__dirname, "work", "transcript.txt"), "utf8")
  .split("@@CMD\n").slice(1)) {
  const [command, rest] = block.split("\n@@OUT\n");
  T.push({ command, output: rest.split("\n@@END")[0].replace(/\s+$/, "") });
}
if (T.length !== 23) throw new Error(`expected 23 transcript runs, got ${T.length}`);
const run = (i, caption) => ({ caption, command: T[i].command, output: T[i].output });

module.exports = {
  meta: {
    title: "Trabajo Práctico 8 — Monitoreo",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Noviembre 2026",
  },

  parteA: {
    a1: {
      intro:
        "El agente SNMP (snmpd) y las herramientas de consulta (snmp) corren en el " +
        "contenedor del laboratorio. Se agregó la community v2c \"catedra\" de solo " +
        "lectura, se reinició el agente y se consultó desde la misma máquina.",
      runs: [
        run(0, "Community v2c de solo lectura (solo para el laboratorio)"),
        run(1, "Reinicio del agente"),
        run(2, "Recorrido de la MIB con snmpwalk (primeras 20 líneas)"),
        run(3, "Consulta puntual: sysDescr.0"),
        run(4, "Consulta puntual: sysUpTime.0"),
        run(5, "Consulta de varios OIDs a la vez"),
      ],
      answers: [
        {
          q: "1. ¿Qué información expone snmpwalk? Mostrá 5 OIDs y qué representan.",
          a:
            "Expone el árbol de objetos que el agente publica, empezando por el grupo " +
            "\"system\" (1.3.6.1.2.1.1) de la MIB-II. Cinco OIDs de la salida:\n\n" +
            "• sysDescr.0 (1.3.6.1.2.1.1.1.0): descripción del equipo; acá el kernel y la " +
            "arquitectura (\"Linux kali 7.0.0-43-generic ... x86_64\"). Para un atacante es " +
            "información de reconocimiento valiosa.\n\n" +
            "• sysObjectID.0 (1.3.6.1.2.1.1.2.0): identificador del tipo de agente dentro del " +
            "árbol de empresas; acá NET-SNMP-MIB::netSnmpAgentOIDs.10, es decir Net-SNMP sobre Linux.\n\n" +
            "• sysUpTimeInstance (1.3.6.1.2.1.1.3.0): tiempo desde el último arranque del agente, " +
            "en centésimas de segundo (Timeticks).\n\n" +
            "• sysContact.0 y sysLocation.0 (1.3.6.1.2.1.1.4.0 y .6.0): responsable y ubicación " +
            "física configurados (fsoler@kali y Laboratorio ARyS - UNPSJB Trelew).\n\n" +
            "• sysName.0 (1.3.6.1.2.1.1.5.0): nombre del equipo (kali).\n\n" +
            "Más abajo la misma salida lista sysORID/sysORDescr, que son los módulos MIB que el " +
            "agente soporta (SNMPv2-MIB, TCP-MIB, UDP-MIB, IP-MIB, etc.).",
        },
        {
          q: "2. Identificá el manager, el agente y la MIB en lo que hiciste.",
          a:
            "Manager: las herramientas snmpwalk y snmpget, que son quienes preguntan (y a quien " +
            "le llegaría un trap). Agente: el demonio snmpd, que escucha en UDP/161, y responde " +
            "con los valores del equipo. MIB: la base de información que define qué objetos " +
            "existen y cómo se nombran: SNMPv2-MIB, DISMAN-EVENT-MIB, IP-MIB, etc. Es la " +
            "que permite que el manager traduzca 1.3.6.1.2.1.1.1.0 a sysDescr.0 (se instalaron " +
            "con snmp-mibs-downloader; sin ellas solo se ven OIDs numéricos). En este " +
            "laboratorio manager y agente están en la misma máquina (localhost); en un " +
            "entorno real serían equipos distintos.",
        },
      ],
    },

    a2: {
      intro:
        "Se capturó con tcpdump el tráfico SNMP sobre la interfaz de loopback mientras se hacía " +
        "una consulta v2c, y se analizó el archivo con tshark (la versión de consola de " +
        "Wireshark, mismo motor de disección) en vez de abrir la interfaz gráfica.",
      runs: [
        run(6, "Captura de una consulta v2c"),
        run(7, "Campo community de cada paquete SNMP"),
        run(8, "Detalle del primer paquete (get-request)"),
        run(9, "La community también aparece buscando bytes crudos en el archivo"),
      ],
      answers: [
        {
          q: "1. ¿Pudiste ver la community string \"catedra\" en texto plano en la captura? Mostralo.",
          a:
            "Sí. tshark la muestra en el campo community de los dos paquetes (la consulta y " +
            "la respuesta), y grep encuentra la cadena \"catedra\" directamente en los bytes " +
            "del .pcap, sin ninguna herramienta de disección. No hizo falta romper nada: " +
            "viaja tal cual dentro del datagrama UDP.",
        },
        {
          q: "2. Explicá por qué es un problema grave y cómo lo resuelve SNMP v3 (USM).",
          a:
            "En v1 y v2c la community es la única \"credencial\" y viaja sin cifrar: quien pueda " +
            "capturar tráfico en cualquier punto del camino (ARP spoofing, un switch con espejo " +
            "de puertos, un equipo comprometido) obtiene la clave y puede consultar —y si la " +
            "community es de lectura/escritura, modificar— el equipo. Además el mensaje " +
            "tampoco lleva integridad ni autenticación del origen, y la community suele ser " +
            "compartida y estar en valores por defecto (public/private). Es exactamente el " +
            "escenario de sniffing de la Unidad 4.\n\n" +
            "SNMP v3 reemplaza la community por el User-based Security Model (USM): usuarios " +
            "con autenticación (HMAC con SHA, que prueba quién envía e impide la modificación del " +
            "mensaje) y privacidad (cifrado del contenido, acá AES), más el control de acceso " +
            "por vista (VACM). Los tres niveles son noAuthNoPriv, authNoPriv y authPriv.",
        },
      ],
    },

    v3: {
      intro:
        "Para contrastar, se creó un usuario v3 de solo lectura (SHA + AES, nivel authPriv), se " +
        "repitió la consulta y se capturó igual.",
      runs: [
        run(10, "Alta del usuario v3 y reinicio del agente"),
        run(11, "Consulta y captura v3 (authPriv)"),
        run(12, "Dentro del paquete v3 solo se ve el motor, el usuario y datos cifrados"),
        run(13, "Búsqueda de cadenas conocidas en la captura v3 (0 coincidencias)"),
      ],
      note:
        "Los dos primeros paquetes de la captura son el descubrimiento del engine ID (sin " +
        "usuario, sin cifrar); la consulta real viaja en encryptedPDU. La contraseña de " +
        "autenticación y la de privacidad nunca se transmiten.",
    },
  },

  parteB: {
    intro:
      "El contenedor corre rsyslog. Como /var/log/syslog no muestra la severidad de cada " +
      "línea, se agregó una regla que además escribe los mensajes user.* en un archivo propio " +
      "con la severidad numérica y textual.",
    runs: [
      run(14, "Regla de rsyslog para registrar la severidad"),
      run(15, "Generación de mensajes con distintas severidades"),
      run(16, "Los dos mensajes en /var/log/syslog"),
      run(17, "Los mismos mensajes con su severidad"),
    ],
    answers: [
      {
        q: "1. Ubicá tus dos mensajes y su severidad. Enumerá la escala 0–7.",
        a:
          "Mensajes: \"Prueba INFO desde el TP8\" tiene severidad 6 (info) y \"Prueba ERROR " +
          "desde el TP8\" tiene severidad 3 (err); ambos de facilidad user. En /var/log/syslog " +
          "aparecen sin la severidad, por eso la regla de la salida anterior. (El remitente " +
          "figura como \"root\" porque logger usa por defecto el nombre de usuario como tag.)\n\n" +
          "Escala de severidades de syslog (RFC 5424): 0 Emergency (sistema inutilizable), " +
          "1 Alert (acción inmediata), 2 Critical, 3 Error, 4 Warning, 5 Notice (normal pero " +
          "significativo), 6 Informational, 7 Debug. Menor número significa mayor gravedad.",
      },
      {
        q: "2. ¿Por qué centralizar los logs (y protegerlos con TLS/6514) es clave contra el borrado de huellas?",
        a:
          "Un log que vive solo en el equipo es lo primero que un atacante con privilegios borra " +
          "o edita (truncar /var/log, borrar el historial) para ocultar su paso, que es la fase " +
          "de borrado de huellas de la Unidad 3. Si cada evento se envía en el momento a un " +
          "servidor aparte y endurecido, el atacante puede apagar el agente pero ya no puede " +
          "reescribir lo que ya salió, y además queda evidencia con valor forense y de " +
          "correlación entre equipos. TLS (puerto 6514, RFC 5425) protege ese envío: " +
          "confidencialidad (los logs contienen usuarios, IPs, a veces datos sensibles), " +
          "integridad (nadie lo modifica en tránsito) y autenticación mutua con certificados " +
          "(que el servidor sea el legítimo y que el log lo envíe un equipo conocido). El syslog " +
          "clásico sobre UDP/514 no ofrece nada de eso y además puede perder mensajes.",
      },
    ],
  },

  parteC: {
    intro:
      "Prometheus y Grafana se levantaron con las imágenes oficiales (prom/prometheus y " +
      "grafana/grafana) mediante Docker Compose, en la misma red que el contenedor del " +
      "laboratorio. Primero se consultaron sus APIs HTTP desde ese contenedor (transcripts) y " +
      "luego se verificó lo mismo en las interfaces web (puertos 9090 y 3000), con un panel " +
      "de Grafana que grafica process_resident_memory_bytes, una métrica propia de Prometheus.",
    runs: [
      run(18, "Prometheus y Grafana en línea"),
      run(19, "Métrica up en Prometheus"),
      run(20, "Targets de Prometheus"),
      run(21, "Alta de Prometheus como data source en Grafana"),
      run(22, "Consulta de up a través de Grafana"),
    ],
    web: [
      { file: "parteC-web-prom-up", caption: "Interfaz web de Prometheus (localhost:9090): consulta up" },
      { file: "parteC-web-grafana-ds", caption: "Grafana (localhost:3000): Prometheus agregado como data source" },
      { file: "parteC-web-grafana-dash", caption: "Grafana: panel con la serie de process_resident_memory_bytes y panel de up" },
    ],
    answers: [
      {
        q: "1. Mostrá la métrica up en Prometheus. ¿Qué representa?",
        a:
          "La consulta devuelve up{job=\"prometheus\", instance=\"localhost:9090\"} = 1. " +
          "up es una métrica sintética que Prometheus genera por cada target en cada scrape: " +
          "vale 1 si el scrape se completó bien y 0 si falló (el equipo no responde, timeout, " +
          "error HTTP). Es el chequeo de disponibilidad más básico y la base de las alertas " +
          "del tipo \"el servicio X dejó de responder\". Acá el único target es el propio " +
          "Prometheus, como indica el enunciado.",
      },
      {
        q: "2. Relacioná este stack con SNMP: ¿qué rol cumple Prometheus y cuál Grafana?",
        a:
          "Prometheus cumple el rol que en SNMP cumple el manager al hacer polling: consulta " +
          "periódicamente (modelo pull, acá cada 5 segundos) a los targets, y además guarda " +
          "los valores como series de tiempo y permite consultarlas con PromQL y definir " +
          "alertas. Los targets exponen métricas por HTTP, equivalente al agente con su MIB. " +
          "Grafana no recolecta nada: solo visualiza, tomando Prometheus como data source " +
          "(como se vio en la consulta a través de Grafana). Para monitorear equipos que solo " +
          "hablan SNMP existe un puente, snmp_exporter, que traduce OIDs a métricas de Prometheus.",
      },
      {
        q: "3. Nombrá los tres pilares de la observabilidad y qué herramienta viste de cada uno.",
        a:
          "Métricas: valores numéricos agregados en el tiempo (CPU, memoria, up); en este " +
          "laboratorio Prometheus las recolecta y Grafana las muestra (SNMP aporta datos del " +
          "mismo tipo). Logs: registros de eventos discretos con su contexto; se vieron con " +
          "Syslog/rsyslog en la Parte B. Trazas: el recorrido de una petición a través de " +
          "varios servicios, con el tiempo de cada tramo; es el pilar que este laboratorio " +
          "no cubre (herramientas típicas: OpenTelemetry con Jaeger o Tempo).",
      },
    ],
  },

  parteD: {
    answers: [
      {
        q: "1. ¿Qué alimentarías a un SIEM y para qué? Relacionalo con el IDS de la Unidad 5.",
        a:
          "Los tres datos del laboratorio, por razones distintas. Logs (syslog con TLS): son la " +
          "materia prima del SIEM; autenticaciones fallidas, uso de sudo, cambios de configuración " +
          "y, sobre todo, los eventos de otros equipos para poder correlacionarlos (un login " +
          "fallido en un servidor más un escaneo en el firewall). Métricas: sirven para detectar " +
          "anomalías de comportamiento (picos de tráfico o CPU, caída de un servicio con up = 0) " +
          "y para dar contexto a una alerta. SNMP: estado del equipamiento de red, traps ante " +
          "cambios de interfaz o reinicios, y cualquier consulta SNMP inesperada, que es una señal " +
          "de reconocimiento, como la community capturada en la Parte A.\n\n" +
          "El IDS de la Unidad 5 (Snort o Suricata) genera alertas sobre tráfico malicioso, pero " +
          "visto solo, es una fuente más. Su salida (en syslog o JSON) se envía al SIEM, que la " +
          "cruza con el resto: una alerta del IDS sobre un escaneo de puertos, combinada con " +
          "logins fallidos en ese mismo host y una métrica fuera de rango, se convierte en un " +
          "incidente priorizado y no en tres avisos sueltos. El IDS detecta, el SIEM correlaciona " +
          "y da contexto.",
      },
      {
        q: "2. ¿Cómo cierra el monitoreo el ciclo detectar → responder → mejorar (seguridad como proceso)?",
        a:
          "Detectar: sin monitoreo no hay visibilidad; las métricas, los logs y las alertas son " +
          "los que hacen que un incidente se note en minutos y no meses después. Responder: las " +
          "alertas disparan el procedimiento (aislar el equipo, revocar credenciales, bloquear " +
          "una IP), y los logs centralizados son la evidencia para saber qué pasó, desde cuándo " +
          "y qué alcance tuvo, algo imposible si el atacante pudo borrarlos. Mejorar: el " +
          "análisis posterior al incidente alimenta correcciones (pasar de SNMP v2c a v3, " +
          "endurecer una regla de firewall, ajustar un umbral de alerta, agregar una fuente de logs) y " +
          "el ciclo vuelve a empezar con más información. Por eso la seguridad es un proceso " +
          "continuo y no un producto que se instala una vez (Unidad 1): el monitoreo es el " +
          "sensor que mantiene ese ciclo en marcha.",
      },
    ],
  },

  investigar: {
    snmpv3:
      "Qué cambia respecto de v2c, comprobado en la Parte A: en vez de una community compartida " +
      "hay usuarios (USM) con contraseñas de autenticación y privacidad que nunca se envían; el " +
      "mensaje lleva integridad y autenticación del origen (HMAC-SHA), el contenido viaja cifrado " +
      "(AES) y el agente exige el nivel de seguridad configurado por usuario. En la captura v3 solo " +
      "se ven el engine ID, el nombre de usuario y un encryptedPDU; la búsqueda de cadenas conocidas " +
      "da 0 coincidencias. El costo: más configuración (usuarios, claves, engine IDs) y algo más de " +
      "procesamiento.",
    netflow:
      "NetFlow (Cisco) e IPFIX (estándar IETF) no registran paquetes sino flujos: la conversación " +
      "resumida con IP y puerto de origen y destino, protocolo, bytes, paquetes y tiempos, que " +
      "exporta un router o switch a un colector. Ocupa mucho menos que una captura completa y no " +
      "guarda el contenido, pero alcanza para ver quién habla con quién y cuánto. Sirve para " +
      "detectar anomalías: un equipo que de pronto envía gigas a un destino externo (exfiltración), " +
      "un escaneo (muchos flujos cortos a muchos puertos), un DDoS o un host comprometido que se " +
      "conecta a un C2.",
    wazuh:
      "Wazuh es una plataforma open source de SIEM y XDR. Un agente instalado en cada equipo recolecta " +
      "logs, controla la integridad de archivos, detecta rootkits y evalúa vulnerabilidades y configuración; " +
      "un servidor analiza esos eventos con reglas y decodificadores y los correlaciona entre fuentes " +
      "(por ejemplo, varios logins fallidos seguidos de uno exitoso desde otra IP), y un indexador con " +
      "dashboard permite buscarlos y generar alertas. Es el rol del SIEM descripto en la Parte D, en " +
      "su versión abierta.",
  },
};
