// TP4 content source. Each activity is filled in as it is completed.
// `null` marks a section still pending. The build script renders only
// what exists, so the document is always a truthful snapshot of progress.

module.exports = {
  meta: {
    title: "Trabajo Práctico 4 — Sniffing y Análisis de Tráfico",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Octubre 2026",
  },

  // ---- Parte A: armado y captura pasiva ----
  parteA: {
    intro:
      "El laboratorio se armó sobre VirtualBox con dos máquinas virtuales Kali " +
      "Linux, ambas conectadas a la misma Red NAT aislada (NAT Network), de " +
      "forma que comparten un único segmento L2 y a la vez tienen salida a " +
      "internet para generar tráfico de prueba contra sitios reales. " +
      "Kali-atacante actuó como VM-Atacante; el clon (Kali-víctima, con MAC " +
      "regenerada para evitar colisión con el original) actuó como VM-Víctima.",

    lab: {
      runs: [
        {
          caption: "Direccionamiento de la VM-Atacante",
          command: "ip a",
          output:
            "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n" +
            "    link/ether 08:00:27:5a:87:bc\n" +
            "    inet 10.0.2.5/24 brd 10.0.2.255 scope global dynamic eth0",
        },
        {
          caption: "Direccionamiento de la VM-Víctima",
          command: "ip a",
          output:
            "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n" +
            "    link/ether 08:00:27:9a:db:5c\n" +
            "    inet 10.0.2.6/24 brd 10.0.2.255 scope global dynamic eth0",
        },
      ],
    },

    // A.2 — anatomía de una conexión (handshake + HTTP en claro)
    a2: {
      note:
        "Captura tomada en la VM-Atacante sobre su propia interfaz (`tcpdump -i " +
        "eth0 -w /tmp/captura.pcap`) mientras se generaba, desde esa misma " +
        "máquina, una petición HTTP en claro (`curl http://neverssl.com`).",
      images: [
        {
          image: "assets/a2-terminal-tcpdump-wireshark.png",
          caption: "Terminal del atacante: captura con tcpdump y apertura en Wireshark.",
        },
        {
          image: "assets/a2-terminal-curl-neverssl.png",
          caption: "Terminal del atacante: `curl http://neverssl.com` generando el tráfico HTTP en claro.",
        },
        {
          image: "assets/a2-handshake-y-http-completo.png",
          caption:
            "Wireshark, filtro `tcp.port == 80`. Se ve el handshake de 3 vías " +
            "(SYN / SYN,ACK / ACK — paquetes 15, 20, 21), la petición en claro " +
            "`GET / HTTP/1.1` (22), la respuesta `HTTP/1.1 200 OK` (28) y el " +
            "cierre de la conexión (`FIN,ACK` 32-35).",
        },
      ],
      followStream: [
        {
          image: "assets/a2-follow-tcp-stream.png",
          caption:
            "Follow TCP Stream sobre el paquete 22: la petición del cliente " +
            "(`GET / HTTP/1.1`, `Host`, `User-Agent`) y la respuesta íntegra " +
            "del servidor (cabeceras y cuerpo HTML), ambas legibles en texto " +
            "plano sin ninguna herramienta de descifrado.",
        },
      ],
      answer:
        "Se lee perfectamente tanto la petición como la respuesta: método, " +
        "ruta, cabeceras y cuerpo completo, sin ningún tipo de ofuscación. " +
        "Si esta conexión fuera un formulario de login en HTTP (no HTTPS), " +
        "el método POST que envía las credenciales viajaría en el mismo " +
        "stream en texto plano -- usuario y contraseña incluidos en el " +
        "cuerpo de la petición, o en la URL si el formulario usara GET -- y " +
        "cualquiera con acceso al tráfico (como se demostró acá, sin " +
        "necesidad de romper ningún cifrado) podría leerlas directamente " +
        "con Follow TCP Stream.",
    },

    a3: {
      note:
        "Misma metodología que A.2, generando ahora tráfico cifrado desde el " +
        "atacante (`curl https://example.com`).",
      images: [
        { image: "assets/a3-terminal-tcpdump.png", caption: "Terminal del atacante: captura con tcpdump sobre la conexión HTTPS." },
        { image: "assets/a3-terminal-curl-https.png", caption: "Terminal del atacante: `curl https://example.com`, respuesta HTML recibida normalmente pese al cifrado." },
        {
          image: "assets/a3-tls-wireshark.png",
          caption:
            "Wireshark, filtro `tcp.port == 443`. Tras el handshake TCP (paquetes " +
            "5-7) arranca TLS 1.3: `Client Hello` (8), `Server Hello, Change " +
            "Cipher Spec` (11) y, de ahí en más, todo el intercambio etiquetado " +
            "como `Application Data` cifrada -- sin payload HTTP legible.",
        },
      ],
      answer:
        "Lo que se ve es exactamente lo mismo que en HTTP: IP y puerto de " +
        "origen y destino, timing, y el tamaño de cada paquete -- metadata de " +
        "la conexión, no el contenido. Incluso se ve en claro el nombre del " +
        "servidor al que se conecta (`Client Hello` con SNI=example.com), " +
        "porque en TLS 1.3 estándar (RFC 8446) el SNI no está cifrado por " +
        "defecto. Lo que NO se ve es nada del contenido de la conversación: " +
        "a partir del `Change Cipher Spec`, todo paquete queda marcado como " +
        "`Application Data`, un blob cifrado con las claves de sesión " +
        "negociadas en el handshake, sin método HTTP, cabeceras ni cuerpo " +
        "visibles -- a diferencia de A.2, acá Follow TCP Stream no muestra " +
        "texto legible.",
    },
    a4: {
      images: [
        {
          image: "assets/a4-dns-claro.png",
          caption:
            "Mismo pcap, filtro `dns`. La consulta `A example.com` y su " +
            "respuesta viajan en texto plano, aunque la conexión posterior " +
            "a ese sitio sea HTTPS.",
        },
      ],
      answer:
        "El DNS tradicional viaja sobre UDP sin cifrar, así que un sniffer ve " +
        "exactamente qué dominio consultás (`example.com`) incluso si después " +
        "navegás por HTTPS -- la consulta queda expuesta antes de que arranque " +
        "cualquier cifrado. Eso revela tu historial de navegación aunque el " +
        "contenido de cada página esté protegido. DoT (RFC 7858) y DoH (RFC " +
        "8484) cierran esto envolviendo la misma consulta DNS dentro de TLS " +
        "(DoT por el puerto 853 dedicado, DoH disfrazado de tráfico HTTPS " +
        "normal por el puerto 443), de modo que un sniffer solo ve una " +
        "conexión cifrada más, sin poder leer qué dominio se resolvió.",
    },
  },

  // ---- Parte B: ARP spoofing / MITM controlado ----
  parteB: {
    intro:
      "Desde la VM-Atacante, usando bettercap, se ejecutó un ARP spoofing " +
      "contra la VM-Víctima para interponerse entre ella y el gateway de la " +
      "red de laboratorio (`10.0.2.1`), y se observó qué tráfico de la " +
      "víctima queda expuesto al atacante y cuál no.",
    b1: {
      images: [
        {
          image: "assets/b1-bettercap-arranque.png",
          caption:
            "Atacante: `bettercap -iface eth0 -eval \"set arp.spoof.targets " +
            "10.0.2.6; arp.spoof on; net.sniff on\"`. Detecta el endpoint " +
            "10.0.2.6 (víctima), arranca el ARP spoofer y, más abajo, el " +
            "módulo `net.sniff.https` ya reporta el SNI de la conexión de la " +
            "víctima (`sni 10.0.2.6 > https://example.com`) sin ver el " +
            "contenido.",
        },
        {
          image: "assets/b1-victima-arp-durante.png",
          caption:
            "Víctima, `ip neigh` con el ataque activo: la entrada del gateway " +
            "`10.0.2.1` quedó con lladdr `08:00:27:dd:06:ca` -- la MAC real " +
            "del atacante, no la del gateway legítimo (`52:54:00:12:35:00`, " +
            "visible todavía en la entrada `10.0.2.3`). La víctima cree estar " +
            "hablando con el gateway y en realidad le manda todo al atacante.",
        },
      ],
      answer:
        "ARP no tiene ningún mecanismo de autenticación (RFC 826): cualquier " +
        "host en el segmento puede mandar una respuesta ARP no solicitada " +
        "(`gratuitous ARP`) diciendo \"esta IP es mi MAC\", y el receptor la " +
        "acepta sin verificar nada y actualiza su tabla. Bettercap explota " +
        "exactamente eso: le dice a la víctima que la MAC del gateway " +
        "(`10.0.2.1`) es la suya, y al mismo tiempo le dice al gateway que la " +
        "MAC de la víctima también es la suya -- quedando en el medio de " +
        "ambas conversaciones sin que ninguna de las dos partes lo note a " +
        "nivel de capa 2.",
    },

    b2: {
      note:
        "Con el ataque activo, se repitió `curl http://neverssl.com` desde la " +
        "víctima para generar tráfico HTTP en claro bajo MITM.",
      answer:
        "El `curl` quedó colgado en la terminal de la víctima, sin respuesta, " +
        "y en la terminal del atacante (`net.sniff`) no apareció tráfico " +
        "nuevo. La explicación más probable es que el ARP spoofing redirigió " +
        "correctamente el tráfico de la víctima hacia el atacante, pero el " +
        "atacante no reenvió esos paquetes hacia el gateway real -- en este " +
        "setup, el \"gateway\" de la NAT Network de VirtualBox es un router " +
        "virtual interno, no una máquina más de la red, y bettercap no logró " +
        "completar el forwarding IP necesario para que la conexión llegara a " +
        "destino y volviera. El resultado práctico es el mismo que si se " +
        "hubiera interceptado: la víctima pierde conectividad en cuanto el " +
        "atacante se interpone, que es justamente el riesgo operativo real " +
        "de un ARP spoofing mal ejecutado (no solo intercepta, puede cortar " +
        "el servicio).",
    },

    b3: {
      answer:
        "Lo que sí se pudo observar con HTTPS (ver B.1) es el **SNI** de la " +
        "conexión -- el atacante ve que la víctima habla con " +
        "`example.com` -- porque ese dato viaja sin cifrar en el `Client " +
        "Hello` de TLS 1.3 (mismo punto que A.3). Lo que el MITM **no** " +
        "logra es leer el contenido: una vez que arranca el intercambio de " +
        "claves TLS, todo lo que pasa por el atacante son bytes cifrados " +
        "con una clave de sesión que el atacante no tiene, así que aunque " +
        "esté físicamente en el medio del tráfico, no puede descifrarlo. El " +
        "MITM de capa 2 (ARP spoofing) resuelve el problema de \"estar en el " +
        "camino del tráfico\"; no resuelve el problema de \"tener la clave " +
        "para leerlo\" -- eso depende exclusivamente del cifrado de capa de " +
        "aplicación (TLS), no de nada que pase en capa 2 o 3.",
    },
    b4: {
      images: [
        {
          image: "assets/b4-arp-normalizada.png",
          caption:
            "Víctima, `ip neigh` tras `arp.spoof off`. El gateway `10.0.2.1` " +
            "volvió a `52:54:00:12:35:00` -- la misma MAC que `10.0.2.3` -- " +
            "en vez de la del atacante. La tabla se restauró sola, sin " +
            "intervención manual, porque bettercap manda ARP replies " +
            "correctivos al desactivar el spoofing.",
        },
      ],
    },
  },

  // ---- Parte C: defensas ----
  parteC: {
    defenseTable: [
      {
        attack: "ARP spoofing (Parte B)",
        control: "Dynamic ARP Inspection (DAI)",
        how:
          "El switch valida cada paquete ARP contra una tabla de bindings " +
          "IP-MAC-puerto que construye a partir de las concesiones DHCP " +
          "(DHCP Snooping). Un ARP reply que afirme una asociación IP-MAC " +
          "que no coincide con esa tabla se descarta en el puerto de acceso, " +
          "antes de llegar a la víctima -- el ataque de Parte B nunca " +
          "modificaría la tabla ARP real.",
      },
      {
        attack: "MAC flooding",
        control: "Port Security",
        how:
          "Limita cuántas direcciones MAC distintas puede anunciar un mismo " +
          "puerto del switch. Si un host intenta inundar la tabla CAM con " +
          "miles de MACs falsas (para forzar al switch a comportarse como " +
          "hub y filtrar tráfico ajeno), el puerto se bloquea o descarta el " +
          "exceso apenas se supera el límite configurado.",
      },
    ],
    closing:
      "Las defensas de capa 2 (DAI, Port Security) frenan la técnica de " +
      "ARP spoofing en sí, pero no protegen el contenido si el atacante " +
      "logra interponerse por otro medio (un switch mal configurado, un " +
      "punto de acceso WiFi comprometido, o simplemente estar en una red " +
      "pública compartida). Como se vio en A.3 y B.3, el único control que " +
      "sigue funcionando incluso cuando el atacante ya está en el medio del " +
      "tráfico es el cifrado extremo a extremo (TLS/HTTPS): no importa " +
      "cuántas capas de defensa de red fallen antes, si el contenido viaja " +
      "cifrado con una clave que el atacante no tiene, estar en el camino " +
      "del tráfico no le sirve de nada. Por eso el cifrado extremo a " +
      "extremo es la defensa definitiva, y las defensas de capa 2 son " +
      "necesarias pero no suficientes.",
  },
};
