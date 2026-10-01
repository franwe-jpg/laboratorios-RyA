// TP3 content source. Each activity is filled in as it is completed.
// `null` marks a section still pending. The build script renders only
// what exists, so the document is always a truthful snapshot of progress.

module.exports = {
  meta: {
    title: "Trabajo Práctico 3 — Reconocimiento y Escaneo",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Septiembre 2026",
  },

  // ---- Parte A: armado del laboratorio aislado ----
  parteA: {
    // Network design rationale, owner-authored.
    intro:
      "El laboratorio se armó sobre VirtualBox 7.2.16 en el equipo anfitrión " +
      "(Linux), con dos máquinas virtuales: Kali Linux 2026.2 como atacante y " +
      "Metasploitable 2 como blanco.\n\n" +
      "La VM atacante tiene dos adaptadores de red que funcionan en simultáneo, " +
      "con propósitos separados. El adaptador 1 (NAT) da salida a internet, " +
      "necesaria para actualizar el sistema y para las consultas pasivas de la " +
      "Parte B. El adaptador 2 (red solo-anfitrión, sobre el switch virtual " +
      "vboxnet0) es la red aislada del laboratorio: conecta a Kali con " +
      "Metasploitable y con el anfitrión, y con nadie más.\n\n" +
      "La separación no es un formalismo. Metasploitable 2 es una máquina " +
      "deliberadamente vulnerable -- servicios sin parchear, credenciales por " +
      "defecto y backdoors conocidos -- y exponerla a la red física o a " +
      "internet sería publicar un equipo comprometible. La red solo-anfitrión " +
      "no entrega gateway por defecto, de modo que no existe ruta desde el " +
      "segmento del laboratorio hacia afuera: todo el escaneo de la Parte C " +
      "queda confinado a 192.168.56.0/24.",

    // Verified host-side configuration (executed and captured in this session).
    setup: [
      {
        caption: "Interfaz solo-anfitrión creada en el equipo anfitrión",
        command: "vboxmanage list hostonlyifs",
        output:
          "Name:            vboxnet0\n" +
          "IPAddress:       192.168.56.1\n" +
          "NetworkMask:     255.255.255.0\n" +
          "Status:          Up\n" +
          "VBoxNetworkName: HostInterfaceNetworking-vboxnet0",
      },
      {
        caption: "Servidor DHCP del segmento aislado",
        command: "vboxmanage list dhcpservers",
        output:
          "NetworkName:    HostInterfaceNetworking-vboxnet0\n" +
          "Dhcpd IP:       192.168.56.100\n" +
          "LowerIPAddress: 192.168.56.101\n" +
          "UpperIPAddress: 192.168.56.254\n" +
          "NetworkMask:    255.255.255.0\n" +
          "Enabled:        Yes",
      },
      {
        caption: "Adaptadores de red y recursos de la VM atacante (Kali)",
        command:
          "vboxmanage showvminfo kali-linux-2026.2-virtualbox-amd64 " +
          "--machinereadable | grep -E '^(nic1|nic2|hostonlyadapter2|memory|cpus)='",
        output:
          "memory=4096\n" +
          "cpus=4\n" +
          "nic1=\"nat\"\n" +
          "hostonlyadapter2=\"vboxnet0\"\n" +
          "nic2=\"hostonly\"",
      },
    ],

    // Entregable A: `ip a` on both VMs + successful ping between them.
    evidence: {
      images: [
        {
          image: "assets/a-metasploitable-ipaddr.png",
          caption:
            "Blanco (Metasploitable 2). `ip addr` muestra una única interfaz de red, " +
            "eth0, con 192.168.56.102/24 tomada por DHCP del rango configurado. " +
            "`ip route` muestra una sola ruta, hacia la propia red del laboratorio, " +
            "sin línea `default via`: la máquina vulnerable no tiene salida.",
        },
        {
          image: "assets/a-kali-ipaddr-ping.png",
          caption:
            "Atacante (Kali Linux 2026.2). `ip a` muestra las dos interfaces: eth0 " +
            "(NAT, salida a internet) y eth1 con 192.168.56.101/24, dentro del " +
            "segmento aislado. Debajo, el ping desde Kali hacia el blanco " +
            "192.168.56.102 responde con TTL 64 y latencia inferior al milisegundo.",
        },
      ],
      note:
        "Ambas máquinas quedaron en la misma red aislada 192.168.56.0/24 y se " +
        "alcanzan entre sí. Las direcciones MAC de las tres interfaces virtuales " +
        "comienzan con el prefijo 08:00:27, el OUI registrado por Oracle para " +
        "VirtualBox: son placas Intel 82540EM emuladas sobre un conmutador " +
        "implementado en software, no hardware físico.",
    },
    snapshot: {
      note:
        "Con el blanco recién arrancado y antes de ejecutar ningún escaneo se tomó " +
        "un snapshot de la VM Metasploitable, de modo que cualquier alteración " +
        "posterior pueda revertirse a un estado conocido.",
      runs: [
        {
          command: "vboxmanage snapshot metasploiteable2 list",
          output:
            "Name: limpio-pre-escaneo (UUID: 7214edbb-d74e-491b-9de2-d54a6be8fe37) *\n" +
            "Description: Estado limpio del blanco antes de cualquier escaneo (TP3 Parte A)",
        },
      ],
    },
  },

  // ---- Parte B: reconocimiento pasivo (OSINT) sobre unp.edu.ar ----
  parteB: {
    intro:
      "Todas las consultas de esta parte se dirigen a servicios públicos de " +
      "terceros -- servidores DNS y registros de transparencia de certificados -- " +
      "y no a la infraestructura de la universidad. En ningún momento se envía " +
      "un paquete a un servidor de unp.edu.ar.",

    runs: [
      {
        caption: "Servidores de nombres, correo y datos de la zona",
        command: "dig @8.8.8.8 unp.edu.ar NS +short; dig @8.8.8.8 unp.edu.ar MX +short; dig @8.8.8.8 unp.edu.ar SOA +short",
        output:
          "chenque.unp.edu.ar.\n" +
          "unpata.unp.edu.ar.\n" +
          "10 pmg.unp.edu.ar.\n" +
          "chenque.unp.edu.ar. hostmaster.unp.edu.ar. 2026082900 3600 7200 604800 86400",
      },
      {
        caption: "Consulta ANY: sin respuesta útil",
        command: "dig @8.8.8.8 unp.edu.ar ANY +noall +answer",
        output: "(respuesta vacía)",
      },
      {
        caption: "El dominio raíz no publica registro A; el sitio vive en www",
        command: "dig @8.8.8.8 unp.edu.ar A +short; dig @8.8.8.8 www.unp.edu.ar A +short",
        output:
          "(respuesta vacía)\n" +
          "nginx-pm.unp.edu.ar.\n" +
          "170.210.88.211",
      },
      {
        caption: "WHOIS: el registro consultado no tiene datos de la zona edu.ar",
        command: "whois unp.edu.ar",
        output: "(sin respuesta; la consulta queda esperando indefinidamente)",
      },
      {
        caption: "Delegación de edu.ar, obtenida del propio DNS",
        command: "dig @8.8.8.8 edu.ar SOA +short; dig @8.8.8.8 edu.ar NS +short",
        output:
          "a.riu.edu.ar. hostmaster.riu.edu.ar. 2026092509 7200 3600 1209600 3600\n" +
          "a.riu.edu.ar.\n" +
          "b.riu.edu.ar.\n" +
          "ns1.uba.ar.\n" +
          "noc.uncu.edu.ar.\n" +
          "unlp.unlp.edu.ar.\n" +
          "ns2.switch.ch.",
      },
      {
        caption: "Subdominios por transparencia de certificados (112 únicos; extracto)",
        command:
          "curl -s \"https://crt.sh/?q=%25.unp.edu.ar&output=json\" | " +
          "jq -r '.[].name_value' | sed 's/^\\*\\.//' | sort -u",
        output:
          "pfsense.unp.edu.ar\n" +
          "intranet.fi.mdn.unp.edu.ar\n" +
          "ipam.unp.edu.ar\n" +
          "ctrlacc.mdn.unp.edu.ar\n" +
          "git.fi.mdn.unp.edu.ar\n" +
          "webmail1.unp.edu.ar\n" +
          "smtp.fi.mdn.unp.edu.ar\n" +
          "adguard.dztw.unp.edu.ar\n" +
          "campusactualizado.unp.edu.ar\n" +
          "nube.dztw.unp.edu.ar\n" +
          "koha.dztw.unp.edu.ar\n" +
          "rdi-test.unp.edu.ar\n" +
          "prueba-intra-biblio.unp.edu.ar\n" +
          "diego-prueba.dztw.unp.edu.ar\n" +
          "[... 98 subdominios más]",
      },
    ],

    b1:
      "La administración de unp.edu.ar se resuelve en tres niveles de delegación, " +
      "todos verificables por DNS y sin whois.\n\n" +
      "El dominio de primer nivel .ar lo administra NIC Argentina (Dirección " +
      "Nacional del Registro de Dominios de Internet), con servidores d.dns.ar, " +
      "e.dns.ar y f.dns.ar, más a.lactld.org de la asociación latinoamericana de " +
      "ccTLD.\n\n" +
      "La zona intermedia edu.ar NO la administra NIC Argentina, sino RIU (Red de " +
      "Interconexión Universitaria). Su registro SOA indica servidor primario " +
      "a.riu.edu.ar y contacto hostmaster@riu.edu.ar. Sus servidores secundarios " +
      "son de otras universidades -- ns1.uba.ar (Buenos Aires), noc.uncu.edu.ar " +
      "(Cuyo), unlp.unlp.edu.ar (La Plata) -- y uno internacional, ns2.switch.ch, " +
      "la red académica suiza: un esquema de hospedaje recíproco entre redes " +
      "universitarias.\n\n" +
      "Finalmente la zona unp.edu.ar la administra la propia universidad. Su SOA " +
      "declara como servidor primario chenque.unp.edu.ar y como contacto " +
      "administrativo hostmaster@unp.edu.ar (en un registro SOA la arroba del " +
      "correo se escribe como punto). El serial 2026082900 sigue el formato de " +
      "fecha: la zona se modificó por última vez el 29/08/2026, revisión 00. El " +
      "segundo servidor de nombres es unpata.unp.edu.ar.\n\n" +
      "El correo entra por un único servidor: pmg.unp.edu.ar, con prioridad 10. " +
      "El nombre sugiere Proxmox Mail Gateway, una pasarela de filtrado de correo " +
      "colocada delante del servidor real.\n\n" +
      "Limitación documentada: la consulta whois unp.edu.ar no devuelve resultado. " +
      "No se trata de un error del entorno. Se verificó que whois google.com y " +
      "whois nic.ar sí responden desde la misma red, de modo que el protocolo y el " +
      "puerto 43 funcionan. El motivo es que el cliente whois dirige toda consulta " +
      ".ar a whois.nic.ar, y ese registro no contiene la zona edu.ar: su servicio " +
      "RDAP devuelve 404 tanto para unp.edu.ar como para uba.edu.ar, mientras que " +
      "responde 200 para nic.ar y mendoza.gov.ar. El registro que sí tiene esos " +
      "datos, RIU, no publica servicio whois ni RDAP: ni whois.riu.edu.ar ni " +
      "rdap.riu.edu.ar existen en DNS. La conclusión precisa es que todo dominio " +
      "registrado tiene datos de registración, pero no todo registro los publica " +
      "por WHOIS.",

    b2:
      "La consulta a crt.sh devolvió 112 subdominios únicos. Cinco destacados:\n\n" +
      "1. pfsense.unp.edu.ar -- pfSense es una distribución de firewall y router. " +
      "El nombre expone qué producto protege la red perimetral, dato que orienta a " +
      "un atacante hacia las vulnerabilidades conocidas de esa plataforma.\n\n" +
      "2. intranet.fi.mdn.unp.edu.ar -- una intranet es por definición un servicio " +
      "de uso interno. Que aparezca en un certificado público revela su existencia " +
      "y su nombre exacto.\n\n" +
      "3. ipam.unp.edu.ar -- IPAM (IP Address Management) es una herramienta de " +
      "inventario de direccionamiento. Un sistema así concentra el mapa de la red " +
      "interna: rangos, VLANs y asignaciones.\n\n" +
      "4. ctrlacc.mdn.unp.edu.ar -- el nombre abrevia control de acceso, y conecta " +
      "con la Unidad 2 (seguridad física) si administra accesos a instalaciones.\n\n" +
      "5. webmail1.unp.edu.ar -- correo web. El sufijo numérico sugiere que hay o " +
      "hubo más de una instancia, y un portal de correo es blanco habitual de " +
      "campañas de phishing y de prueba de credenciales.\n\n" +
      "Un patrón adicional vale la pena señalar: hay varios subdominios de entornos " +
      "de prueba y desarrollo publicados junto a los productivos -- rdi-test, " +
      "jitsitest, testing-biblio, prueba-intra-biblio, diego-prueba, jitsi-dev. " +
      "Los entornos no productivos suelen recibir menos parches, conservar datos " +
      "de prueba y tener credenciales débiles, de modo que representan una " +
      "superficie de ataque desproporcionada respecto de su importancia.\n\n" +
      "Cabe aclarar por qué esta información existe: desde 2018 los navegadores " +
      "exigen que todo certificado TLS se publique en registros de transparencia " +
      "de certificados, auditables y públicos. El objetivo es detectar " +
      "certificados emitidos de forma fraudulenta. El efecto colateral es que " +
      "cualquiera puede reconstruir el inventario de nombres de una organización " +
      "sin tocar su infraestructura. No hay forma de optar por salirse: es el " +
      "precio de un ecosistema de certificados auditable.",

    b3:
      "El reconocimiento pasivo consiste en obtener información del blanco a " +
      "partir de fuentes de terceros, sin enviarle ningún paquete. Todo lo hecho " +
      "en esta parte cumple esa condición: las consultas dig se dirigieron al " +
      "resolver público 8.8.8.8 de Google, y la de subdominios a crt.sh, un " +
      "agregador de registros de transparencia de certificados. Ninguno de esos " +
      "servidores pertenece a la universidad. Desde el punto de vista de la " +
      "UNPSJB, esta actividad es indistinguible de no haber ocurrido: no queda " +
      "registro en sus logs porque nunca llegó tráfico.\n\n" +
      "El escaneo activo, en cambio, envía paquetes construidos directamente " +
      "contra los sistemas del blanco y observa cómo responden. Un SYN scan abre " +
      "conexiones a cada puerto; la detección de versiones dialoga con cada " +
      "servicio. Esa interacción queda registrada en los logs del blanco y es " +
      "detectable por un IDS.\n\n" +
      "La diferencia legal se apoya en esa distinción técnica. Bajo la Ley 26.388, " +
      "el artículo 153 bis penaliza el acceso indebido a un sistema informático de " +
      "acceso restringido, aunque no se cause daño. El escaneo activo constituye " +
      "una interacción no autorizada con sistemas ajenos y cae bajo ese encuadre. " +
      "El reconocimiento pasivo, en cambio, consulta información que terceros " +
      "publican deliberadamente: registros DNS que existen para ser resueltos por " +
      "cualquiera, y certificados que la normativa del ecosistema TLS obliga a " +
      "publicar. Consultar un dato público en el servidor de un tercero no es " +
      "acceder al sistema del blanco.\n\n" +
      "Por eso la Parte C de este trabajo se ejecuta exclusivamente contra el " +
      "laboratorio propio y aislado, y nunca contra unp.edu.ar.",
  },

  // ---- Parte C: escaneo del laboratorio contra Metasploitable ----
  parteC: {
    runs: [
      {
        caption: "Descubrimiento de hosts vivos en el segmento aislado",
        command: "nmap -sn 192.168.56.0/24",
        output:
          "Nmap scan report for ThinkPad.local (192.168.56.1)   [anfitrion]\n" +
          "Nmap scan report for 192.168.56.100                  [servidor DHCP]\n" +
          "Nmap scan report for 192.168.56.102                  [Metasploitable]\n" +
          "Nmap scan report for 192.168.56.101                  [Kali, este equipo]\n" +
          "Nmap done: 256 IP addresses (4 hosts up) scanned in 6.60 seconds",
      },
      {
        caption: "Escaneo de todos los puertos con deteccion de versiones",
        command: "sudo nmap -sS -sV -p- 192.168.56.102 -oA escaneo_completo",
        output:
          "Not shown: 65505 closed tcp ports (reset)\n" +
          "PORT      STATE SERVICE     VERSION\n" +
          "21/tcp    open  ftp         vsftpd 2.3.4\n" +
          "22/tcp    open  ssh         OpenSSH 4.7p1 Debian 8ubuntu1 (protocol 2.0)\n" +
          "23/tcp    open  telnet      Linux telnetd\n" +
          "25/tcp    open  smtp        Postfix smtpd\n" +
          "53/tcp    open  domain      ISC BIND 9.4.2\n" +
          "80/tcp    open  http        Apache httpd 2.2.8 ((Ubuntu) DAV/2)\n" +
          "139/tcp   open  netbios-ssn Samba smbd 3.X - 4.X (workgroup: WORKGROUP)\n" +
          "445/tcp   open  netbios-ssn Samba smbd 3.X - 4.X (workgroup: WORKGROUP)\n" +
          "512/tcp   open  exec        netkit-rsh rexecd\n" +
          "513/tcp   open  login       OpenBSD or Solaris rlogind\n" +
          "514/tcp   open  shell       Netkit rshd\n" +
          "1099/tcp  open  java-rmi    GNU Classpath grmiregistry\n" +
          "1524/tcp  open  bindshell   Metasploitable root shell\n" +
          "2049/tcp  open  nfs         2-4 (RPC #100003)\n" +
          "2121/tcp  open  ftp         ProFTPD 1.3.1\n" +
          "3306/tcp  open  mysql       MySQL 5.0.51a-3ubuntu5\n" +
          "3632/tcp  open  distccd     distccd v1 ((GNU) 4.2.4 (Ubuntu 4.2.4-1ubuntu4))\n" +
          "5432/tcp  open  postgresql  PostgreSQL DB 8.3.0 - 8.3.7\n" +
          "5900/tcp  open  vnc         VNC (protocol 3.3)\n" +
          "6000/tcp  open  X11         (access denied)\n" +
          "6667/tcp  open  irc         UnrealIRCd\n" +
          "6697/tcp  open  irc         UnrealIRCd\n" +
          "8009/tcp  open  ajp13       Apache Jserv (Protocol v1.3)\n" +
          "8180/tcp  open  http        Apache Tomcat/Coyote JSP engine 1.1\n" +
          "8787/tcp  open  drb         Ruby DRb RMI (Ruby 1.8; path /usr/lib/ruby/1.8/drb)\n" +
          "41000/tcp open  nlockmgr    1-4 (RPC #100021)\n" +
          "44871/tcp open  mountd      1-3 (RPC #100005)\n" +
          "48532/tcp open  java-rmi    GNU Classpath grmiregistry\n" +
          "49681/tcp open  status      1 (RPC #100024)\n" +
          "Service Info: OSs: Unix, Linux; CPE: cpe:/o:linux:linux_kernel\n" +
          "Nmap done: 1 IP address (1 host up) scanned in 132.64 seconds",
      },
      {
        caption: "Deteccion de sistema operativo",
        command: "sudo nmap -O 192.168.56.102",
        output:
          "Running: Linux 2.6.X\n" +
          "OS CPE: cpe:/o:linux:linux_kernel:2.6\n" +
          "OS details: Linux 2.6.9 - 2.6.33\n" +
          "Network Distance: 1 hop",
      },
      {
        caption: "Scripts de descubrimiento (extracto): la version exacta de Samba y el FTP anonimo",
        command: "nmap -sC 192.168.56.102",
        output:
          "21/tcp  open  ftp\n" +
          "|_ftp-anon: Anonymous FTP login allowed (FTP code 230)\n" +
          "80/tcp  open  http\n" +
          "|_http-title: Metasploitable2 - Linux\n" +
          "3306/tcp open mysql\n" +
          "|   Version: 5.0.51a-3ubuntu5\n" +
          "Host script results:\n" +
          "| smb-os-discovery:\n" +
          "|   OS: Unix (Samba 3.0.20-Debian)\n" +
          "|   Computer name: metasploitable\n" +
          "| smb-security-mode:\n" +
          "|_  message_signing: disabled (dangerous, but default)",
      },
    ],

    portTable: [
      { port: "21/tcp", state: "abierto", service: "ftp", version: "vsftpd 2.3.4" },
      { port: "22/tcp", state: "abierto", service: "ssh", version: "OpenSSH 4.7p1 Debian 8ubuntu1" },
      { port: "23/tcp", state: "abierto", service: "telnet", version: "Linux telnetd" },
      { port: "25/tcp", state: "abierto", service: "smtp", version: "Postfix smtpd" },
      { port: "53/tcp", state: "abierto", service: "domain", version: "ISC BIND 9.4.2" },
      { port: "80/tcp", state: "abierto", service: "http", version: "Apache httpd 2.2.8 (Ubuntu) DAV/2" },
      { port: "111/tcp", state: "abierto", service: "rpcbind", version: "RPC #100000 v2" },
      { port: "139/tcp", state: "abierto", service: "netbios-ssn", version: "Samba smbd 3.0.20-Debian" },
      { port: "445/tcp", state: "abierto", service: "netbios-ssn", version: "Samba smbd 3.0.20-Debian" },
      { port: "512/tcp", state: "abierto", service: "exec", version: "netkit-rsh rexecd" },
      { port: "513/tcp", state: "abierto", service: "login", version: "rlogind" },
      { port: "514/tcp", state: "abierto", service: "shell", version: "Netkit rshd" },
      { port: "1099/tcp", state: "abierto", service: "java-rmi", version: "GNU Classpath grmiregistry" },
      { port: "1524/tcp", state: "abierto", service: "bindshell", version: "Metasploitable root shell (backdoor)" },
      { port: "2049/tcp", state: "abierto", service: "nfs", version: "RPC #100003 v2-4" },
      { port: "2121/tcp", state: "abierto", service: "ftp", version: "ProFTPD 1.3.1" },
      { port: "3306/tcp", state: "abierto", service: "mysql", version: "MySQL 5.0.51a-3ubuntu5" },
      { port: "3632/tcp", state: "abierto", service: "distccd", version: "distccd v1 (GCC 4.2.4)" },
      { port: "5432/tcp", state: "abierto", service: "postgresql", version: "PostgreSQL 8.3.0 - 8.3.7" },
      { port: "5900/tcp", state: "abierto", service: "vnc", version: "VNC protocol 3.3" },
      { port: "6000/tcp", state: "abierto", service: "X11", version: "(acceso denegado)" },
      { port: "6667/tcp", state: "abierto", service: "irc", version: "UnrealIRCd" },
      { port: "6697/tcp", state: "abierto", service: "irc", version: "UnrealIRCd" },
      { port: "8009/tcp", state: "abierto", service: "ajp13", version: "Apache Jserv v1.3" },
      { port: "8180/tcp", state: "abierto", service: "http", version: "Apache Tomcat/Coyote JSP 1.1 (Tomcat 5.5)" },
      { port: "8787/tcp", state: "abierto", service: "drb", version: "Ruby DRb RMI (Ruby 1.8)" },
      { port: "41000/tcp", state: "abierto", service: "nlockmgr", version: "RPC #100021 v1-4" },
      { port: "44871/tcp", state: "abierto", service: "mountd", version: "RPC #100005 v1-3" },
      { port: "49681/tcp", state: "abierto", service: "status", version: "RPC #100024 v1" },
    ],

    cves: [
      {
        service: "vsftpd 2.3.4 (puerto 21)",
        cve: "CVE-2011-2523",
        description:
          "El paquete de vsftpd 2.3.4 distribuido entre el 30/06 y el 03/07 de 2011 " +
          "fue troyanizado: al enviar un usuario que contiene la cadena \":)\" se abre " +
          "un shell de root en el puerto 6200/tcp. Ejecucion remota de comandos sin " +
          "autenticacion. CVSS v2 10.0, CVSS v3 9.8 (critica).",
      },
      {
        service: "Samba 3.0.20 (puertos 139/445)",
        cve: "CVE-2007-2447",
        description:
          "Con la opcion \"username map script\" activada, smbd (Samba 3.0.0 a 3.0.25rc3) " +
          "pasa el nombre de usuario a un shell sin sanitizar. Un nombre con " +
          "metacaracteres ejecuta comandos arbitrarios en el servidor, sin necesidad " +
          "de credenciales validas. La version exacta 3.0.20 la confirmo el script " +
          "smb-os-discovery. CVSS v2 6.0.",
      },
      {
        service: "UnrealIRCd (puertos 6667/6697)",
        cve: "CVE-2010-2075",
        description:
          "El paquete de UnrealIRCd 3.2.8.1 distribuido en ciertos mirrors entre " +
          "noviembre de 2009 y junio de 2010 contiene una modificacion maliciosa en " +
          "la macro DEBUG3_DOLOG_SYSTEM que permite a un atacante remoto ejecutar " +
          "comandos arbitrarios sin autenticacion. CVSS v2 7.5.",
      },
    ],

    c3:
      "La diferencia esta en la columna SERVICE frente a la columna VERSION, y es " +
      "la diferencia entre suponer y confirmar.\n\n" +
      "El escaneo -sS es un SYN scan: envia un paquete SYN a cada puerto y decide " +
      "su estado por la respuesta (SYN/ACK = abierto, RST = cerrado). Es rapido y " +
      "silencioso -- resolvio el blanco en 2,75 segundos -- pero NO dialoga con el " +
      "servicio. La columna SERVICE que muestra (\"ftp\", \"ssh\", \"irc\") no es una " +
      "deteccion: es una simple consulta a la tabla /etc/services, que asocia por " +
      "convencion el numero de puerto a un nombre. Dice que en el 21 SUELE haber FTP, " +
      "no que haya FTP ni cual.\n\n" +
      "El escaneo -sV agrega deteccion de versiones: una vez que el puerto esta " +
      "abierto, nmap efectivamente se conecta al servicio, lee su banner y lo " +
      "compara contra su base de firmas. Por eso pasa de \"ftp\" a \"vsftpd 2.3.4\", " +
      "y de \"irc\" a \"UnrealIRCd\". Ese dialogo cuesta tiempo: el mismo barrido con " +
      "-sV sobre los 65.535 puertos tardo 132 segundos, casi cincuenta veces mas.\n\n" +
      "La version es decisiva para un atacante porque una vulnerabilidad no existe " +
      "contra \"un servidor FTP\" en abstracto, sino contra una version concreta de " +
      "un producto concreto. \"ftp en el puerto 21\" no se puede explotar: no se sabe " +
      "que atacar. \"vsftpd 2.3.4\" se mapea de inmediato a CVE-2011-2523 y a un " +
      "exploit publico. La deteccion de version es el puente entre un puerto abierto " +
      "y una vulnerabilidad accionable; sin ella, el escaneo describe la superficie " +
      "pero no la debilita.\n\n" +
      "Un matiz sobre el -sS: suele llamarse escaneo sigiloso (stealth) o " +
      "half-open, pero el nombre es historico y hoy induce a error. El SYN scan " +
      "no completa el saludo TCP de tres pasos -- responde el SYN/ACK con un RST " +
      "en vez de un ACK -- de modo que la conexion nunca se establece. Como no se " +
      "establece, muchos servicios de la capa de aplicacion no la escriben en su " +
      "log: ese es todo el sigilo, esquivar el registro del servicio. NO significa " +
      "que no quede auditoria. En la capa de red el escaneo es plenamente visible: " +
      "un firewall con logging anota cada SYN, y un IDS (Unidad 5) detecta de " +
      "inmediato el patron de 65.535 SYN desde una sola IP en dos minutos -- de " +
      "hecho ese barrido es mas llamativo para un IDS que una conexion legitima " +
      "aislada. El sigilo tenia sentido en los anios 90, cuando el registro vivia " +
      "casi solo en la aplicacion; contra un servidor con IDS y monitoreo " +
      "centralizado (Unidad 8) un SYN scan es tan detectable como cualquier otro. " +
      "La evasion real se apoya en otras tecnicas: -T0 (lento, para no superar " +
      "umbrales de frecuencia), fragmentacion de paquetes y seniuelos -D.",

    c4:
      "En este laboratorio NO aparecio ningun puerto filtered: los 65.535 puertos " +
      "quedaron clasificados como abiertos (29) o cerrados. La propia salida lo " +
      "indica: \"Not shown: 65505 closed tcp ports (reset)\". Esa palabra reset es la " +
      "clave -- cada puerto cerrado respondio activamente con un paquete RST.\n\n" +
      "La distincion entre los tres estados se apoya en la respuesta al sondeo:\n\n" +
      "- abierto: el puerto contesta el SYN con SYN/ACK. Hay un servicio escuchando.\n" +
      "- cerrado: el puerto contesta con RST. Es alcanzable, pero no hay servicio.\n" +
      "- filtered: no llega ninguna respuesta, o llega un ICMP unreachable. Un " +
      "cortafuegos o filtro de paquetes en el camino descarto el sondeo, y nmap no " +
      "puede determinar si detras hay o no un servicio.\n\n" +
      "Lo que produce un estado filtered es, por lo tanto, un filtrado en la ruta: " +
      "una regla de firewall que descarta (DROP) el paquete en silencio, en el " +
      "propio blanco o en un equipo intermedio. En este laboratorio no aparecio " +
      "porque Kali y Metasploitable estan en el mismo segmento host-only, sin ningun " +
      "cortafuegos entre ambos, y Metasploitable no trae reglas de iptables por " +
      "defecto -- de ahi que cada puerto responda de forma definitiva. Para " +
      "provocar un filtered habria que interponer un filtro, por ejemplo una regla " +
      "iptables -j DROP sobre un puerto: ese puerto pasaria de cerrado (RST) a " +
      "filtered (sin respuesta). La diferencia entre RST y silencio es, para el " +
      "atacante, la diferencia entre saber y no saber que hay detras.",
  },

  // ---- Parte D: analisis y defensa ----
  parteD: {
    defenseTable: [
      {
        service: "vsftpd 2.3.4",
        cve: "CVE-2011-2523",
        cvss: "10.0 (v2) / 9.8 (v3)",
        detection:
          "Un IDS de red (Unidad 5) alerta ante la conexion al puerto 6200/tcp, " +
          "que ningun servicio legitimo usa. En el host, la aparicion de un proceso " +
          "shell hijo de vsftpd es anomala y visible en el monitoreo (Unidad 8).",
        countermeasure:
          "Actualizar vsftpd a una version limpia desde el repositorio oficial. El " +
          "backdoor solo existe en ese paquete manipulado; cualquier version del " +
          "repositorio de la distribucion lo elimina de raiz.",
      },
      {
        service: "Samba 3.0.20",
        cve: "CVE-2007-2447",
        cvss: "6.0 (v2)",
        detection:
          "El monitoreo de logs (Unidad 8) muestra nombres de usuario con " +
          "metacaracteres de shell en los intentos de autenticacion contra smbd. Un " +
          "IDS (Unidad 5) con firmas para esta CVE detecta la carga en la peticion " +
          "MS-RPC.",
        countermeasure:
          "Actualizar Samba a 3.0.25 o superior. Como mitigacion inmediata, " +
          "desactivar la opcion \"username map script\" en smb.conf, que es la que " +
          "habilita el vector.",
      },
      {
        service: "UnrealIRCd",
        cve: "CVE-2010-2075",
        cvss: "7.5 (v2)",
        detection:
          "El servicio IRC no forma parte de los servicios previstos del servidor: " +
          "su sola presencia en el escaneo es un hallazgo. Un IDS (Unidad 5) detecta " +
          "el patron del backdoor en el trafico hacia 6667/6697.",
        countermeasure:
          "Desinstalar UnrealIRCd: es un servicio que no deberia estar corriendo en " +
          "este servidor. Cerrar los puertos 6667/6697 en el firewall (Unidad 5) " +
          "como defensa en profundidad.",
      },
    ],

    priorities:
      "Si fuera el administrador de este servidor, mis tres primeras acciones, en " +
      "orden, serian estas.\n\n" +
      "Primero, aislar el servidor en la red antes de tocar nada. El escaneo revelo " +
      "tres backdoors de ejecucion remota sin autenticacion (vsftpd, UnrealIRCd y el " +
      "root shell explicito en el puerto 1524), ademas de servicios en texto plano " +
      "como telnet y los r-services. No puedo asumir que el equipo no este ya " +
      "comprometido, de modo que la prioridad cero es contener: segmentarlo por " +
      "firewall (Unidad 5) para cortar cualquier acceso en curso mientras se " +
      "remedia.\n\n" +
      "Segundo, cerrar y desinstalar todo lo que no cumple una funcion legitima. La " +
      "cantidad de servicios expuestos -- IRC, distccd, bindshell, X11, VNC, dos " +
      "servidores FTP -- es en si misma el problema de fondo: cada puerto abierto es " +
      "superficie de ataque. Reducir el servidor a los pocos servicios que realmente " +
      "necesita elimina la mayoria de las vulnerabilidades sin parchear ninguna, " +
      "porque un servicio que no corre no se puede explotar.\n\n" +
      "Tercero, parchear lo que queda. Los servicios que sobreviven a la poda del " +
      "paso anterior -- tipicamente SSH, el servidor web, la base de datos -- se " +
      "actualizan a versiones soportadas y se les revisa la configuracion. Recien " +
      "aca tiene sentido invertir esfuerzo en parches, porque se aplica sobre una " +
      "superficie ya reducida.\n\n" +
      "El orden responde a una logica de contencion antes que de reparacion: primero " +
      "detener el sangrado (aislar), luego eliminar la causa mayoritaria (reducir " +
      "servicios), y por ultimo endurecer lo que debe seguir funcionando (parchear). " +
      "Parchear un servicio que no deberia existir seria esfuerzo mal invertido.",
  },

  // ---- Anexo: explotacion (fase 3) -- fuera del alcance del TP, laboratorio propio ----
  parteAnexo: {
    intro:
      "Este anexo excede lo que pide el TP3, que cubre las fases 1 y 2 " +
      "(reconocimiento y escaneo). Se incluye como extension: la fase 3 (obtener " +
      "acceso), ejecutada exclusivamente contra la VM Metasploitable propia, en la " +
      "red aislada, con un snapshot previo para revertir. El objetivo es didactico: " +
      "mostrar que un puerto abierto con una version vulnerable no es un dato " +
      "abstracto, sino un acceso real, y cerrar el ciclo atacando y despues " +
      "defendiendo el mismo servicio.",

    exploitation: {
      note:
        "Se explota el backdoor de vsftpd 2.3.4 (CVE-2011-2523). No hizo falta " +
        "Metasploit: el backdoor se dispara a mano con netcat, lo que muestra el " +
        "mecanismo desnudo. El paquete troyanizado de vsftpd, al recibir un nombre " +
        "de usuario que contiene la cadena \":)\", abre un shell de root en el puerto " +
        "6200. Se usan dos terminales: una activa el backdoor conectandose al FTP " +
        "(puerto 21), la otra se conecta al shell de root que quedo escuchando en " +
        "el 6200.",
      runs: [
        {
          caption: "Terminal A: disparar el backdoor por el puerto 21",
          command: "nc 192.168.56.102 21",
          output:
            "220 (vsFTPd 2.3.4)\n" +
            "USER pwned:)\n" +
            "331 Please specify the password.\n" +
            "PASS x",
        },
        {
          caption: "Terminal B: conectarse al shell de root abierto en el 6200",
          command: "nc 192.168.56.102 6200",
          output:
            "id\n" +
            "uid=0(root) gid=0(root)",
        },
      ],
      images: [
        {
          image: "assets/anexo-1a-trigger.png",
          caption:
            "Terminal A. Con netcat se abre una conexion cruda al puerto 21 y se " +
            "envia a mano el usuario \"pwned:)\". La cadena \":)\" es el gatillo del " +
            "backdoor; el servidor pide contrasenia y, al recibirla, abre un shell " +
            "de root escuchando en el puerto 6200.",
        },
        {
          image: "assets/anexo-1b-root-recovery.png",
          caption:
            "Terminal B. Conexion al puerto 6200: el comando id devuelve " +
            "uid=0(root). Ademas, tail /etc/passwd no muestra el usuario backdoor y " +
            "ls /root/ no muestra HACKEADO.txt: son los artefactos del ataque " +
            "anterior, que la restauracion del snapshot elimino. El agujero, sin " +
            "embargo, sigue presente -- por eso el exploit funciona de nuevo.",
        },
      ],
    },

    impact: {
      note:
        "Con acceso de root se demuestran acciones de post-explotacion. Un atacante " +
        "leeria /etc/shadow (los hashes de contrasenia de todos los usuarios, que " +
        "luego se crackean offline con John the Ripper o Hashcat, como describe la " +
        "teoria de la unidad). Aqui se muestran dos acciones concretas: dejar una " +
        "tarjeta de visita y crear un usuario de persistencia.",
      images: [
        {
          image: "assets/anexo-2b-calling-card.png",
          caption:
            "Tarjeta de visita escrita en /root/HACKEADO.txt. El directorio /root " +
            "solo admite escritura de root, de modo que la sola existencia del " +
            "archivo ahi prueba el nivel de privilegio obtenido. Pertenece a " +
            "root:root.",
        },
        {
          image: "assets/anexo-2a-backdoor-user.png",
          caption:
            "Persistencia: se crea el usuario backdoor con UID 0 y GID 0 " +
            "(backdoor:x:0:0::/root:/bin/bash). Es un segundo root. Su proposito es " +
            "conservar el acceso aunque se cierre el vector original -- un adelanto " +
            "de la fase 4 (mantener acceso). Por esto, ante un equipo comprometido, " +
            "no alcanza con parchear el fallo: hay que asumir que el atacante dejo " +
            "puertas adicionales y reinstalar desde un estado limpio.",
        },
      ],
    },

    defense: {
      note:
        "Cerrado el ataque, se aplica la defensa sobre el mismo servicio. La " +
        "contramedida definitiva para CVE-2011-2523 es reemplazar el paquete " +
        "troyanizado por una version limpia de vsftpd; como este es un laboratorio " +
        "aislado de 2008 sin acceso a repositorios, se demuestra un control de capa " +
        "de red equivalente y verificable aqui: bloquear el vector con el firewall " +
        "del propio servidor (iptables, Unidad 5), como defensa en profundidad.\n\n" +
        "Se agregan dos reglas que descartan (DROP) todo paquete entrante a los " +
        "puertos 21 (el vector del ataque) y 6200 (por donde el backdoor entrega el " +
        "shell). El servicio vsftpd sigue corriendo, pero los paquetes nunca le " +
        "llegan: el firewall los descarta antes.",
      runs: [
        {
          caption: "En el blanco: reglas de firewall que bloquean el vector",
          command: "sudo iptables -A INPUT -p tcp --dport 21 -j DROP; sudo iptables -A INPUT -p tcp --dport 6200 -j DROP; sudo iptables -L INPUT -n",
          output:
            "Chain INPUT (policy ACCEPT)\n" +
            "target  prot opt source     destination\n" +
            "DROP    tcp  --  0.0.0.0/0  0.0.0.0/0  tcp dpt:21\n" +
            "DROP    tcp  --  0.0.0.0/0  0.0.0.0/0  tcp dpt:6200",
        },
      ],
      images: [
        {
          image: "assets/anexo-3a-firewall.png",
          caption:
            "Consola de Metasploitable: las reglas DROP activas sobre los puertos " +
            "21 y 6200 en la cadena INPUT del firewall iptables.",
        },
        {
          image: "assets/anexo-3b-blocked.png",
          caption:
            "Desde Kali, el mismo ataque ahora falla. netcat contra el puerto 21 " +
            "devuelve \"Connection timed out\" en lugar del banner 220 (vsFTPd " +
            "2.3.4). Y nmap reporta 21/tcp como filtered, no ya como open: la " +
            "demostracion empirica de la consigna C.4 -- una regla DROP en el camino " +
            "convierte un puerto de open (o closed) en filtered, porque el sondeo se " +
            "descarta en silencio y el escaner no recibe respuesta.",
        },
      ],
    },

    conclusion:
      "El anexo recorre el ciclo completo del hacking etico sobre un mismo " +
      "servicio: se reconocio vsftpd 2.3.4 en el escaneo (fase 2), se lo exploto " +
      "para obtener root (fase 3), y finalmente se lo defendio bloqueando el vector " +
      "y verificando que el ataque deja de funcionar.\n\n" +
      "Dos aprendizajes quedan en evidencia. Primero, restaurar el snapshot " +
      "recupero el sistema -- borro el usuario backdoor y la tarjeta -- pero no " +
      "cerro la vulnerabilidad: el exploit volvio a funcionar sobre la maquina " +
      "restaurada. Recuperar no es parchear. Segundo, la misma herramienta y el " +
      "mismo conocimiento sirven para atacar y para defender; la diferencia es el " +
      "proposito y la autorizacion. Todo este anexo se ejecuto sobre un laboratorio " +
      "propio y aislado, con permiso, que es la unica condicion bajo la cual esta " +
      "practica es licita.",
  },
};
