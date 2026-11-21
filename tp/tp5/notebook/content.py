"""TP5 report content: narrative (markdown) plus live evidence cells.

Cells are tuples: ("md", text) or ("code", source, tags). Code cells call the
lab contract (lab/ops.py, see lab/handoff.yaml) through notebook/report.py and
render bounded Markdown; their input is hidden in the report. Narrative text
only states behaviour that lab/ops.py `validate` asserts, so it cannot drift
from the evidence rendered next to it. `None` marks a pending section.
"""

from textwrap import dedent

H = ["hide-input"]


def live(source: str):
    return ("code", dedent(source).strip(), H)


META = {
    "title": "Trabajo Práctico 5 — Firewall, IDS y Honeypot",
    "course": "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    "institution": "UNPSJB — Sede Trelew",
    "student": "Soler, Franco Martín",
    "date": "Noviembre 2026",
    "disclosure": (
        "El desarrollo de este trabajo fue asistido por la IA Claude (Anthropic). "
        "El laboratorio se armó con contenedores Docker sobre una red interna "
        "aislada, sin salida a internet; todo el tráfico de escaneo y los intentos "
        "de acceso se generaron y dirigieron exclusivamente entre esos contenedores."
    ),
}

SETUP = [
    live("""
        import sys; sys.path.insert(0, "notebook")
        from report import ops, show, table, label, code, evidence, require_lab
        RUN = ops.Run.new()
        require_lab(RUN)
    """),
]

ENCUADRE = [
    (
        "md",
        "## Encuadre y entorno de laboratorio\n\n"
        "La consigna plantea el laboratorio sobre máquinas virtuales en red "
        "*host-only*. Por recomendación de la cátedra, este trabajo lo reproduce "
        "con **contenedores Docker orquestados con Docker Compose**: cada rol "
        "(atacante, servidor, honeypot) es un contenedor con su propio *network "
        "namespace*, conectado a una red interna aislada. Para lo que evalúa el "
        "práctico el modelo es equivalente: cada contenedor tiene su propia "
        "pila TCP/IP, su propio *ruleset* de nftables y su propia interfaz, "
        "igual que una VM.\n\n"
        "Ventajas sobre las VMs de los TP3 y TP4: la topología queda descripta "
        "como código y se levanta idéntica en cada ejecución, y la evidencia "
        "(capturas, alertas, logs) se guarda como archivos estructurados en "
        "lugar de copiarse desde la terminal. Todas las tablas de resultados de "
        "este informe se generaron ejecutando las pruebas contra el laboratorio; "
        "cada una indica el archivo de evidencia que la respalda y su hash SHA-256.\n\n"
        "**Límite ético:** todo el tráfico (escaneo, intentos de login) se "
        "genera y se dirige exclusivamente dentro de esa red interna, que no "
        "tiene salida a internet ni puertos publicados en el equipo anfitrión.",
    ),
    (
        "md",
        "### Topología\n\n"
        "Se respeta la topología implícita en los comandos de la consigna: el "
        "firewall es un **firewall de host** (cadena `input` y DNAT local en el "
        "propio servidor) y Suricata analiza la interfaz de ese servidor.\n\n"
        "| Rol | Dirección | Función |\n"
        "|---|---|---|\n"
        "| Atacante | 10.0.0.5 | Genera el tráfico de prueba: `nmap`, `nc`, `curl`, `ssh` |\n"
        "| Servidor | 10.0.0.10 | Firewall nftables, SSH (administración) y servicio web interno en el puerto 8000 |\n"
        "| IDS | (interfaz del servidor) | Suricata en modo IDS sobre la interfaz `eth1` del servidor |\n"
        "| Honeypot | 10.0.0.20 | Cowrie, honeypot SSH escuchando en el puerto 22 |\n\n"
        "Red de laboratorio: `10.0.0.0/24`, interna y sin salida a internet.",
    ),
    live("""
        health, iso = ops.health(RUN), ops.isolation(RUN)
        show(
            f"**Verificación del entorno** — servicios: {label(health['verdict'])} · aislamiento: {label(iso['verdict'])}",
            table([{"Servicio": s["servicio"], "Estado": s["estado"], "Salud": s["salud"]} for s in health["services"]]),
            table([{"Flujo": c["flujo"], "Esperado": c["esperado"], "Observado": c["observado"]} for c in iso["checks"]]),
        )
    """),
]

# ---- Parte A: firewall con nftables ----
PARTE_A = [
    live("""
        # Baseline without firewall, for the A.1 comparison.
        ops.fw_reset(RUN)
        PROBES = {
            "ssh": lambda: ops.probe_tcp(RUN, 22),
            "8080": lambda: ops.probe_tcp(RUN, 8080),
            "8000": lambda: ops.probe_http(RUN, 8000),
            "ping": lambda: ops.probe_ping(RUN),
        }
        before = {k: probe() for k, probe in PROBES.items()}
    """),
    (
        "md",
        "## Parte A — Firewall con nftables\n\n"
        "Sobre el servidor (10.0.0.10) se aplicaron los comandos de la consigna (como "
        "`root` dentro del contenedor, por eso sin `sudo`): una tabla `inet filtro` con "
        "una cadena `entrada` enganchada al *hook* `input` y política `drop`, más tres "
        "excepciones explícitas.\n\n"
        "```\n"
        "nft add table inet filtro\n"
        "nft add chain inet filtro entrada '{ type filter hook input priority 0; policy drop; }'\n"
        "nft add rule inet filtro entrada ct state established,related accept\n"
        "nft add rule inet filtro entrada iif lo accept\n"
        "nft add rule inet filtro entrada tcp dport 22 accept\n"
        "```",
    ),
    live("""
        applied = [ops.nft(RUN, c) for c in ops.PART_A]
        fw = ops.fw_table(RUN)
        ok = sum(a["verdict"] == "valid" for a in applied)
        show(
            f"Comandos aplicados: {ok}/{len(applied)} {label('valid' if ok == len(applied) else 'invalid')}. "
            "Resultado de `nft list table inet filtro`:",
            code(fw["table"]),
            evidence(fw),
            "> **Nota del entorno:** `nft list ruleset` lista las tablas "
            + ", ".join(f"`{t.removeprefix('table ')}`" for t in fw["all_tables"])
            + ". La tabla `ip nat` no forma parte del trabajo: la crea Docker para su DNS "
            "interno (127.0.0.11). Por eso, para revisar la configuración propia se usa "
            "`nft list table inet filtro`.",
        )
    """),
    (
        "md",
        "### A.1 — Conexión a un puerto no habilitado (8080)\n\n"
        "Cada prueba se hizo desde el atacante, primero con el servidor sin reglas y "
        "después con el *ruleset* anterior:",
    ),
    live("""
        after = {k: probe() for k, probe in PROBES.items()}
        show(table([
            {"Prueba desde el atacante": f"`{after[k]['academic_command']}`",
             "Sin firewall": f"{label(before[k]['verdict'])}: {before[k]['detail']}",
             "Con firewall": f"{label(after[k]['verdict'])}: {after[k]['detail']}"}
            for k in PROBES
        ]))
    """),
    (
        "md",
        "Sin firewall, el kernel del servidor responde con un **RST** porque no hay "
        "nada escuchando en el 8080: el atacante sabe al instante que el puerto está "
        "cerrado. Con la política `drop`, el paquete SYN no coincide con ninguna regla "
        "de aceptación y se **descarta en silencio**. No vuelve ni RST ni ICMP, así que "
        "el cliente solo puede esperar hasta el timeout, y `nmap` lo reporta como "
        "*filtered*. Lo mismo le pasa al 8000, aunque el servicio esté escuchando, y "
        "al `ping`, porque ICMP tampoco está permitido. El 22 sigue accesible porque "
        "tiene su regla de aceptación explícita.",
    ),
    (
        "md",
        "### A.2 — `ct state established,related accept` y el firewall *stateful*\n\n"
        "nftables se apoya en el *connection tracking* (conntrack) del kernel, que "
        "registra cada conexión y clasifica cada paquete según su estado: `new` "
        "(abre una conexión), `established` (pertenece a una conexión ya vista en "
        "ambos sentidos) o `related` (asociado a otra conexión, como un error ICMP o el "
        "canal de datos de FTP). La regla acepta todo lo que pertenece a una conexión "
        "ya existente sin volver a evaluarlo.\n\n"
        "Eso es lo que hace al firewall **stateful**: decide según el **contexto de la "
        "conexión** y no solo según los campos de cada paquete aislado, como haría un "
        "filtro de paquetes *stateless*. Sin esta regla, las respuestas a conexiones que "
        "inicia el propio servidor (por ejemplo, una consulta DNS saliente) chocarían "
        "con la política `drop`. Para permitirlas habría que abrir de forma permanente "
        "los puertos de origen de esas respuestas, un agujero que el filtrado con estado "
        "evita.",
    ),
    (
        "md",
        "### A.3 — *Default deny* y menor privilegio\n\n"
        "La política de la cadena es `drop`: **todo lo que no está explícitamente "
        "permitido se descarta**. Solo se enumeran tres excepciones, cada una con una "
        "justificación concreta: el tráfico de retorno de conexiones ya establecidas, "
        "la interfaz de *loopback* (comunicación local del propio sistema) y SSH para "
        "administrarlo. Es el principio de menor privilegio aplicado a la red: el "
        "servidor expone la mínima superficie necesaria, y cualquier servicio nuevo "
        "(como el 8000) queda inaccesible hasta que alguien decida abrirlo de forma "
        "explícita, como se comprobó en A.1.",
    ),
]

# ---- Parte B: publicación con DNAT ----
PARTE_B = [
    (
        "md",
        "## Parte B — Publicar un servicio con DNAT\n\n"
        "El servicio interno (`python3 -m http.server 8000`) se publicó en el puerto 80 "
        "con una cadena `nat` enganchada a `prerouting`, sobre el firewall de la Parte A. "
        "Al reproducir la consigna aparecieron **dos problemas**, que se documentan porque "
        "ayudan a entender cómo recorre el paquete las cadenas del kernel.\n\n"
        "### Problema 1 — Sintaxis del DNAT",
    ),
    live("""
        steps = [ops.nft(RUN, c) for c in (ops.PART_B_CHAIN, ops.PART_B_LITERAL, ops.PART_B_FIXED)]
        literal = steps[1]
        show(
            "Salida de nftables al aplicar la regla tal como figura en la consigna:",
            code(f"# {literal['command']}\\n{literal['error_detail']}"),
            table([{"Comando": f"`{s['command']}`", "Resultado": label(s["verdict"])} for s in steps]),
        )
    """),
    (
        "md",
        "`dnat` exige una dirección de destino. Hay dos formas válidas: indicarla de "
        "forma explícita (`dnat ip to 10.0.0.10:8000`, la que se usó) o, cuando el "
        "destino es el propio host, usar `redirect to :8000`.\n\n"
        "### Problema 2 — La cadena `input` descarta el tráfico ya traducido",
    ),
    live("""
        blocked80 = ops.probe_http(RUN, 80)
        show(f"Con el DNAT ya corregido, `{blocked80['academic_command']}` da {label(blocked80['verdict'])} "
             f"({blocked80['detail']}).")
    """),
    (
        "md",
        "La causa es el orden en que el kernel recorre las cadenas:\n\n"
        "1. El SYN a `:80` entra por `prerouting`, donde el DNAT reescribe el destino a `:8000`.\n"
        "2. El paquete, ya traducido, llega a la cadena `input` con `dport 8000`.\n"
        "3. Es el primer paquete de la conexión (`ct state new`): no coincide con la regla "
        "`established`, tampoco con `dport 22`, y la política `drop` lo descarta.\n\n"
        "Hay dos formas de resolverlo:\n\n"
        "| Regla agregada en `entrada` | Efecto |\n"
        "|---|---|\n"
        "| `tcp dport 8000 accept` | Funciona, pero deja el 8000 accesible **directamente**, salteando el DNAT |\n"
        "| `ct status dnat accept` (elegida) | Acepta solo las conexiones que **entraron por el DNAT**; el 8000 directo sigue bloqueado |",
    ),
    (
        "md",
        "### B.1 — Verificación desde el atacante\n\n"
        "```\n"
        "nft add rule inet filtro entrada ct status dnat accept\n"
        "```",
    ),
    live("""
        allow = ops.nft(RUN, ops.PART_B_ALLOW)
        via_dnat, direct = ops.probe_http(RUN, 80), ops.probe_http(RUN, 8000)
        ct = ops.conntrack(RUN)
        show(
            table([
                {"Prueba": f"`{r['academic_command']}`", "Resultado": f"{label(r['verdict'])}: {r['detail']}"}
                for r in (via_dnat, direct)
            ]),
            f"Tabla de conexiones del servidor (`{ct['academic_command']}`): {label(ct['verdict'])}",
            table(ct["entries"], limit=5),
            evidence(ct),
        )
    """),
    (
        "md",
        "El puerto 80 responde con el contenido del servicio interno y el 8000 directo "
        "sigue bloqueado. La tabla de conexiones muestra la traducción: la conexión "
        "original va al puerto 80 y la respuesta sale desde el 8000. El kernel deshace la "
        "traducción en la vuelta, y el cliente nunca ve el puerto interno.",
    ),
    (
        "md",
        "### B.2 — Análisis de riesgo: ¿por qué el destino del DNAT debe estar en una DMZ?\n\n"
        "Cada regla DNAT abre un camino desde una red no confiable hacia un servicio "
        "interno. Si ese servicio tiene una vulnerabilidad, el atacante gana un punto de "
        "apoyo **en la máquina de destino**. Si esa máquina está en la LAN, comparte "
        "segmento con los equipos y datos más sensibles de la organización y el "
        "movimiento lateral es directo.\n\n"
        "En una **DMZ**, el servidor publicado vive en una zona separada, y el firewall "
        "controla también el tráfico **DMZ → LAN** (normalmente denegado por defecto). "
        "Un servidor comprometido queda contenido: para llegar a la LAN, el atacante "
        "tiene que atravesar otra vez el firewall.\n\n"
        "En este laboratorio, la elección de `ct status dnat accept` en lugar de abrir el "
        "8000 aplica la misma idea a escala de un host: la única puerta expuesta es la "
        "que se publicó a propósito.",
    ),
]

# ---- Parte C: detección con Suricata ----
PARTE_C = [
    (
        "md",
        "## Parte C — Detección con un IDS (Suricata)\n\n"
        "Suricata 7.0.10 corre en modo IDS sobre la interfaz `eth1` del servidor (un "
        "contenedor *sidecar* que comparte la pila de red del servidor, el equivalente "
        "a instalarlo en la VM servidor), con el conjunto de reglas **ET Open** (más de "
        "50.000 firmas, descargadas al construir el laboratorio). Desde el atacante se "
        "repitió el escaneo de la Unidad 3, con el firewall de las partes A y B activo:\n\n"
        "```\n"
        "nmap -sS -sV 10.0.0.10\n"
        "```",
    ),
    live("""
        scan = ops.ids_scan(RUN)
        ports = scan["ports"] + [{"puerto": f"otros {scan['filtered_ports']}", "estado": "filtered",
                                  "servicio": "", "versión": "sin respuesta: descartados por la política drop"}]
        show(
            f"Escaneo completado en {scan['duration_s']:.0f} s · Suricata: {label(scan['verdict'])}",
            table([{"Puerto": p["puerto"], "Estado": p["estado"], "Servicio detectado": f"{p['servicio']} {p['versión']}".strip()}
                   for p in ports]),
            "### C.1 — Alertas generadas",
            table([{"Firma (SID)": a["sid"], "Mensaje": a["firma"], "Prioridad": a["prioridad"],
                    "Cantidad": a["cantidad"], "Sentido": a["sentido"]} for a in scan["alerts"]]),
            evidence(scan),
        )
    """),
    (
        "md",
        "**Sí, detectó el `nmap`**, pero conviene precisar qué parte. La alerta de "
        "prioridad 1 (SID 2024364) la disparan las sondas HTTP de la detección de "
        "versiones (`-sV`), que envían un `User-Agent` que contiene \"Nmap\". El barrido "
        "SYN (`-sS`) sobre los 1000 puertos **no generó ninguna alerta** con las reglas "
        "por defecto. Las alertas de prioridad 3 son informativas: describen la respuesta "
        "del servidor y no un ataque.",
    ),
    (
        "md",
        "### C.2 — IDS vs IPS\n\n"
        "El IDS **solo alertó**: el escaneo terminó normalmente y obtuvo la versión de los "
        "servicios. Suricata trabaja sobre una **copia** del tráfico (captura AF_PACKET), "
        "fuera del camino de los paquetes, así que no puede frenarlos. De hecho, ve "
        "incluso los paquetes que después descarta nftables.\n\n"
        "En modo **IPS (*inline*)**, Suricata se ubica en el camino de los paquetes (por "
        "ejemplo, recibiéndolos desde nftables con NFQUEUE) y cada paquete espera su "
        "veredicto. Con la acción `drop` en lugar de `alert`, las sondas HTTP con el "
        "*User-Agent* de Nmap se habrían **descartado** y la detección de versiones habría "
        "fallado. El barrido SYN, en cambio, igual se habría completado, porque ninguna "
        "regla lo identifica. A cambio, un IPS agrega latencia y el riesgo de bloquear "
        "tráfico legítimo ante un falso positivo.",
    ),
    (
        "md",
        "### C.3 — ¿Firmas o anomalías?\n\n"
        "Por **firmas**. La regla que disparó busca un patrón concreto y conocido en el "
        "tráfico:\n\n"
        "```\n"
        "alert http $HOME_NET any -> any any (msg:\"ET SCAN Possible Nmap User-Agent Observed\";\n"
        "  flow:established,to_server; http.user_agent; content:\"|20|Nmap\"; ... sid:2024364;)\n"
        "```\n\n"
        "Compara el campo `User-Agent` del HTTP con la cadena \" Nmap\". No hay ningún "
        "modelo de \"tráfico normal\" ni umbral estadístico, que es lo que caracteriza "
        "a la detección por anomalías. La consecuencia práctica se vio en C.1: un barrido "
        "SYN sin firma asociada pasa inadvertido.\n\n"
        "La debilidad típica de las firmas se comprobó repitiendo el escaneo con otro "
        "*User-Agent*. El texto \"Nmap\" lo envían los scripts NSE de detección de "
        "versiones (por ejemplo `http-server-header`), y nmap permite cambiarlo:\n\n"
        "```\n"
        "nmap -sS -sV --script-args http.useragent=Mozilla/5.0 10.0.0.10\n"
        "```",
    ),
    live("""
        evasion = ops.ids_scan(RUN, ["--script-args", "http.useragent=Mozilla/5.0"], label="evasion")

        def hits(result, sid):
            return sum(a["cantidad"] for a in result["alerts"] if a["sid"] == sid)

        show(
            table([
                {"Escaneo": f"`{r['academic_command']}`",
                 "Alerta 2024364 (Nmap User-Agent)": f"{label('detected' if hits(r, 2024364) else 'not_detected')} ({hits(r, 2024364)})",
                 "Alerta 2034636 (informativa)": hits(r, 2034636)}
                for r in (scan, evasion)
            ]),
            evidence(evasion),
        )
        ops.fw_reset(RUN)  # restore: the server is left without firewall rules
    """),
    (
        "md",
        "Con un solo cambio de parámetro el mismo escaneo deja de ser detectado. Una firma "
        "solo reconoce lo que ya conoce, y un atacante que sabe qué busca puede evitarla. "
        "La detección por anomalías apunta justamente a cubrir este hueco: reacciona ante "
        "un comportamiento fuera de lo normal, como un origen que toca cientos de puertos "
        "en pocos segundos, aunque no coincida con ningún patrón conocido.",
    ),
]

# ---- Parte D: honeypot Cowrie ----
PARTE_D = [
    (
        "md",
        "## Parte D — Honeypot (Cowrie)\n\n"
        "Cowrie 3.1.7 (imagen oficial) corre como señuelo en 10.0.0.20, escuchando SSH en "
        "el puerto 22 y presentándose como `srv-backup`. No hay ningún servicio real detrás: "
        "Cowrie emula un shell de Linux y registra cada interacción. El contenedor corre "
        "sin ninguna *capability* del kernel (`cap_drop: ALL`).\n\n"
        "Desde el atacante se probaron tres contraseñas para `root` y, con la que funcionó, "
        "se ejecutaron comandos de reconocimiento:\n\n"
        "```\n"
        "ssh root@10.0.0.20      # contraseñas probadas: root, 123456, toor\n"
        "root@srv-backup:~# uname -a; whoami; cat /etc/passwd\n"
        "```",
    ),
    live("""
        hp = ops.honeypot_attack(RUN, ["root", "123456", "toor"], ["uname -a", "whoami", "cat /etc/passwd"])
        reply = next((a["respuesta"] for a in hp["attempts"] if a["respuesta"]), "")
        show(
            table([{"Contraseña": f"`{a['contraseña']}`",
                    "Resultado": f"**{a['resultado']}**" if a["resultado"] == "acceso" else a["resultado"]}
                   for a in hp["attempts"]]),
            f"Primera línea que recibió el atacante tras el acceso (`uname -a`):",
            code(reply),
        )
    """),
    (
        "md",
        "### D.1 — Qué registró Cowrie\n\n"
        "Extracto de `cowrie.json`, el registro estructurado del honeypot, con una línea "
        "JSON por evento:",
    ),
    live("""
        relevant = {"client.version", "login.failed", "login.success", "command.input"}
        show(
            f"Cowrie: {label(hp['verdict'])}",
            table([{"Hora": e["hora"], "Sesión": e["sesión"][:8], "Origen": e["origen"],
                    "Evento": e["evento"], "Detalle": e["detalle"]}
                   for e in hp["events"] if e["evento"] in relevant]),
            evidence(hp),
        )
    """),
    (
        "md",
        "Cowrie capturó todo lo que pide la consigna: la **IP de origen** (10.0.0.5), el "
        "**usuario** y **cada contraseña** probada (también las fallidas, en texto claro), "
        "los **comandos** ejecutados y además el **cliente SSH** exacto del atacante. Cada "
        "conexión tiene un identificador de sesión, lo que permite reconstruir la secuencia "
        "completa del ataque.\n\n"
        "El atacante, en cambio, ve un sistema falso: el kernel que devuelve `uname -a` lo "
        "inventa Cowrie (no es el del equipo anfitrión) y `/etc/passwd` es un archivo de "
        "utilería. Cree estar dentro de un servidor, pero no tiene acceso a nada real.\n\n"
        "> **Nota del entorno:** el registro crudo también incluye conexiones desde "
        "127.0.0.1. Las genera el chequeo de salud del contenedor (verifica que el puerto 22 "
        "responda) y se excluyeron de la tabla porque no son actividad del atacante.",
    ),
    (
        "md",
        "### D.2 — ¿Por qué casi cero falsos positivos?\n\n"
        "Porque **nadie legítimo tiene motivo para conectarse a un honeypot**. No ofrece "
        "ningún servicio real, no figura en la documentación ni en el DNS interno y ningún "
        "proceso de negocio depende de él. Legítimamente, a esa máquina solo deberían "
        "conectarse sus administradores, desde un origen conocido y para mantenimiento.\n\n"
        "Por eso, cualquier otra conexión es sospechosa por definición. Un IDS tiene que "
        "distinguir el ataque dentro de todo el tráfico legítimo, y de ahí vienen sus falsos "
        "positivos. En el honeypot ese tráfico legítimo de fondo no existe: toda la "
        "actividad registrada es, como mínimo, alguien explorando la red donde no debería.",
    ),
    (
        "md",
        "### D.3 — Propuesta de honeytoken\n\n"
        "**Honeytoken:** una credencial falsa, por ejemplo el usuario `svc_backup_admin` con "
        "su contraseña, guardada en un archivo `backup.conf` dentro de un recurso compartido "
        "interno. Debe parecer un hallazgo valioso para alguien que esté revisando la red. "
        "Esa cuenta no la usa nadie.\n\n"
        "**Alerta que dispararía:** cualquier intento de autenticación con `svc_backup_admin`, "
        "contra el directorio, SSH o el propio honeypot (agregándola a la base de usuarios "
        "de Cowrie). Genera una alerta de máxima prioridad con el origen del intento. Como "
        "nadie legítimo conoce esa credencial, que alguien la use prueba que **ya leyó el "
        "archivo**: hay un intruso o un empleado accediendo donde no debe. Indica, además, "
        "dónde estuvo, porque la credencial solo existía en ese archivo.",
    ),
]

# ---- Para investigar (opcional) ----
OPCIONALES = [
    (
        "md",
        "## Para investigar (opcional)\n\n"
        "### Migrar reglas de iptables a nftables\n\n"
        "El paquete `iptables` incluye `iptables-translate`, que convierte una regla de "
        "iptables a su equivalente en nftables. Se tradujeron en el servidor las reglas "
        "equivalentes a las de las partes A y B:",
    ),
    live("""
        rules = [
            "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
            "-A INPUT -i lo -j ACCEPT",
            "-A INPUT -p tcp --dport 22 -j ACCEPT",
            "-t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 10.0.0.10:8000",
        ]
        show(table([{"iptables": f"`{t['iptables']}`", "nftables": f"`{t['nftables']}`"}
                    for t in (ops.translate(RUN, r) for r in rules)]))
    """),
    (
        "md",
        "Qué cambia en la sintaxis:\n\n"
        "- **No hay tablas ni cadenas predefinidas.** En iptables, `INPUT` o `PREROUTING` "
        "ya existen. En nftables se crean, y se elige a qué *hook* se enganchan, con qué "
        "prioridad y qué política tienen, como se hizo en las partes A y B.\n"
        "- **Una sola herramienta para todas las familias.** iptables, ip6tables, arptables "
        "y ebtables se reemplazan por `nft`. La familia `inet` cubre IPv4 e IPv6 con un "
        "mismo *ruleset*; la traducción usa `ip` porque iptables solo maneja IPv4.\n"
        "- **Coincidencias nativas en lugar de módulos.** `-m conntrack --ctstate` pasa a "
        "ser `ct state`, sin cargar módulos de extensión.\n"
        "- **Contadores opcionales.** iptables cuenta siempre; en nftables el contador se "
        "pide con `counter`, por eso la traducción lo agrega en cada regla.\n"
        "- **Sintaxis más legible y estructuras propias.** Por ejemplo, `tcp dport { 22, 80 }` "
        "agrupa puertos en un *set* en lugar de repetir reglas, y `nft -f` carga un "
        "*ruleset* completo de forma atómica.\n\n"
        "`iptables-translate` no traduce el cambio de política (`-P INPUT DROP`): en "
        "nftables la política es una propiedad de la cadena, que se declara al crearla "
        "(`policy drop;`).",
    ),
    (
        "md",
        "### Qué agrega un NGFW y por qué no tiene definición normativa\n\n"
        "Un firewall *stateful* como el de la Parte A decide con información de capa 3 y 4: "
        "direcciones, puertos, protocolo y estado de la conexión. Un **NGFW** (*Next-"
        "Generation Firewall*) agrega, sobre esa base:\n\n"
        "- **Identificación de aplicaciones** (capa 7), sin importar el puerto. Por ejemplo, "
        "distingue una aplicación de transferencia de archivos que viaja por el 443 de la "
        "navegación web normal.\n"
        "- **Identidad de usuario**, integrada con el directorio, para escribir reglas por "
        "usuario o grupo en lugar de por IP.\n"
        "- **IPS integrado**, es decir, lo que en la Parte C hizo Suricata, pero *inline* y en "
        "el mismo equipo.\n"
        "- **Inspección de tráfico TLS**, filtrado de URL e inteligencia de amenazas.\n\n"
        "No tiene una definición normativa porque el término nació como **categoría de "
        "mercado** de la consultora Gartner, no en un organismo de estándares. La guía de "
        "NIST sobre firewalls (SP 800-41) describe tecnologías concretas (filtrado de "
        "paquetes, inspección de estado, firewalls de aplicación y *proxies*), pero no define "
        "\"NGFW\", y no hay RFC que lo haga. Cada fabricante decide qué funciones incluye bajo "
        "ese nombre, así que dos NGFW pueden tener capacidades bastante distintas.",
    ),
    (
        "md",
        "### Diseño de red bajo Zero Trust (NIST SP 800-207)\n\n"
        "El modelo perimetral divide la red en \"afuera\" (no confiable) y \"adentro\" "
        "(confiable): una vez que un equipo está en la LAN, se confía en él. Zero Trust "
        "elimina esa **confianza implícita por ubicación en la red**. Ningún acceso se "
        "concede por estar \"adentro\": cada solicitud a cada recurso se autentica y "
        "autoriza según la identidad del usuario, el estado del dispositivo y el contexto. "
        "En SP 800-207, un **Policy Decision Point** (motor y administrador de políticas) "
        "decide, y un **Policy Enforcement Point** aplica la decisión delante del recurso.\n\n"
        "La **microsegmentación** es uno de los enfoques que propone el estándar para "
        "implementarlo: en lugar de una única frontera, se ubica un punto de control delante "
        "de cada recurso o grupo pequeño de recursos, con políticas granulares también para "
        "el tráfico interno (este-oeste). Así, un equipo comprometido de la LAN no puede "
        "moverse libremente hacia el resto.\n\n"
        "El firewall de este trabajo ilustra la diferencia a pequeña escala. No es un "
        "firewall perimetral: está **en el propio servidor**, y su política `drop` no "
        "distingue si la conexión viene de afuera o de la misma red. Cada recurso con su "
        "propio control y *default deny* es la idea básica de la microsegmentación. Lo que "
        "Zero Trust agrega es que esa decisión dependa de la identidad y del contexto, no "
        "solo de la IP y el puerto.",
    ),
]

SECTIONS = [
    ("Encuadre", ENCUADRE),
    ("Parte A — Firewall con nftables", PARTE_A),
    ("Parte B — Publicar un servicio con DNAT", PARTE_B),
    ("Parte C — Detección con un IDS (Suricata)", PARTE_C),
    ("Parte D — Honeypot (Cowrie)", PARTE_D),
    ("Para investigar (opcional)", OPCIONALES),
]
