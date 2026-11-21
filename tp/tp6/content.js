// TP6 content source. Transcripts are literal outputs of work/lab.sh, run inside
// the arys-lab:bookworm container (see work/transcript.txt).

module.exports = {
  meta: {
    title: "Trabajo Práctico 6 — Criptografía aplicada",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Noviembre 2026",
  },

  parteA: {
    a1: {
      intro:
        "El comando de la guía (openssl enc -aes-256-gcm) falla: el subcomando enc " +
        "no soporta cifrados AEAD. Se dejó el error documentado y se usó AES-256-CTR " +
        "(también un modo de solo cifrado) para la parte de confidencialidad. GCM se " +
        "demuestra aparte en A.3 con la librería cryptography de Python.",
      runs: [
        {
          caption: "Intento con GCM, tal como indica la guía",
          command: "openssl enc -aes-256-gcm -pbkdf2 -salt -in mensaje.txt -out mensaje.enc",
          output: "enc: AEAD ciphers not supported\nenc: Use -help for summary.",
        },
        {
          caption: "Cifrado con AES-256-CTR y contenido ilegible",
          command:
            "openssl enc -aes-256-ctr -pbkdf2 -salt -in mensaje.txt -out mensaje.enc\n" +
            "ls -l mensaje.txt mensaje.enc\n" +
            "file mensaje.enc; od -A x -t x1z mensaje.enc",
          output:
            "-rw-r--r-- 1 root root 46 mensaje.enc\n" +
            "-rw-r--r-- 1 root root 30 mensaje.txt\n" +
            "mensaje.enc: openssl enc'd data with salted password\n" +
            "000000 53 61 6c 74 65 64 5f 5f 2e ed aa 66 8d d6 29 42  >Salted__...f..)B<\n" +
            "000010 f2 be e7 03 ed c6 38 0c 9a d9 7c 32 60 cb 11 66  >......8...|2`..f<\n" +
            "000020 f7 c9 08 0e aa df ba 04 49 52 68 45 20 ab        >........IRhE .<\n" +
            "00002e",
        },
        {
          caption: "Descifrado y comparación con el original",
          command:
            "openssl enc -d -aes-256-ctr -pbkdf2 -in mensaje.enc -out descifrado.txt\n" +
            "cat descifrado.txt; cmp mensaje.txt descifrado.txt && echo IDENTICOS",
          output: "Mensaje secreto de la catedra\nIDENTICOS",
        },
      ],
      answer:
        "El archivo cifrado no contiene nada legible: tras la cabecera \"Salted__\" " +
        "(que guarda la sal de la derivación de clave) todo son bytes que parecen " +
        "aleatorios, y file solo lo identifica como \"openssl enc'd data\". Con la " +
        "passphrase correcta el descifrado devuelve el mensaje, y cmp confirma que " +
        "es idéntico byte a byte al original. El archivo cifrado pesa 46 bytes: los " +
        "30 del mensaje más 16 de cabecera (8 de \"Salted__\" y 8 de sal).",
    },
    a2: {
      runs: [
        {
          command:
            "echo -n \"catedra\" | sha256sum\n" +
            "echo -n \"Catedra\" | sha256sum",
          output:
            "c88f2589287598ebe677065b4d5ed43d85be01df4b57ad80bf95ff59b197b82f  -\n" +
            "0e5a9920b8a0ef9f4847856ee2d781da116d486cc92a7b24a88ecacf7547131c  -",
        },
        {
          caption: "Cuántos bits difieren entre ambos hashes",
          command: "python3 -c \"...bin(a ^ b).count('1')...\"",
          output: "bits distintos: 131 de 256 (51.2%)",
        },
      ],
      answer:
        "Cambiar una sola letra (c por C, un único bit en la entrada) hizo que " +
        "cambiaran 131 de los 256 bits del resultado, es decir un 51 %: la mitad del " +
        "hash, que es exactamente lo que se espera de una función hash buena (efecto " +
        "avalancha). Los dos hashes no comparten ningún tramo reconocible.\n\n" +
        "Para la integridad esto significa que cualquier alteración, por mínima que " +
        "sea, se detecta: si guardo el hash de un archivo cuando confío en él y más " +
        "tarde el hash recalculado no coincide, el archivo cambió. Además, como el " +
        "resultado no \"se parece\" al original, nadie puede ajustar el contenido " +
        "poco a poco para acercarse a un hash buscado. Un hash solo no alcanza " +
        "contra un atacante activo: quien modifica el archivo puede recalcular el " +
        "hash también, por eso se lo combina con una firma o un HMAC.",
    },
    a3: {
      runs: [
        {
          caption: "Alterar un byte con un modo de solo cifrado (AES-256-CTR)",
          command:
            "# se invierte 1 bit del primer byte cifrado y se descifra\n" +
            "openssl enc -d -aes-256-ctr -pbkdf2 -in mensaje.mod -out mod.txt; echo rc=$?\n" +
            "cat mod.txt",
          output: "rc=0\nLensaje secreto de la catedra",
        },
        {
          caption: "El mismo ataque contra AES-256-GCM",
          command: "python3 gcm_demo.py",
          output:
            "ciphertext+tag (hex): 805e78d7930de97e52f6b5d1492ba76e07b893f3524621d3d1c5226c345d692c\n" +
            "                      f588892979b8ab8cfa987f903f98\n" +
            "descifrado OK       : b'Mensaje secreto de la catedra\\n'\n" +
            "ciphertext alterado : InvalidTag -> descifrado RECHAZADO",
        },
      ],
      answer:
        "Un modo de solo cifrado (CTR, CBC) protege la confidencialidad pero no " +
        "detecta modificaciones. En la primera prueba invertí un único bit del " +
        "texto cifrado y openssl descifró sin ningún error (rc=0): el mensaje " +
        "salió alterado (\"Lensaje\" en lugar de \"Mensaje\") y nadie se enteró. " +
        "Un atacante que no conoce la clave puede igual modificar el mensaje de " +
        "forma controlada.\n\n" +
        "GCM es un modo AEAD (Authenticated Encryption with Associated Data): " +
        "además de cifrar produce una etiqueta de autenticación de 16 bytes que " +
        "cubre todo el texto cifrado. En la segunda prueba alteré un bit del texto " +
        "cifrado y el descifrado se rechazó con InvalidTag, sin entregar ningún " +
        "texto. GCM aporta así confidencialidad e integridad/autenticidad en una " +
        "sola operación, y es el modo que usa TLS 1.3 (más adelante, en la Parte D, " +
        "el sitio negocia TLS_AES_256_GCM_SHA384).",
    },
  },

  parteB: {
    keygen: {
      intro:
        "El laboratorio usa un directorio GnuPG propio y descartable (GNUPGHOME " +
        "dentro de work/), de modo que no toca el llavero real. La clave se generó en " +
        "modo batch con Ed25519 (firma) y Curve25519 (cifrado), sin passphrase " +
        "porque es una clave de prueba.",
      runs: [
        {
          command: "gpg --batch --gen-key keyparams",
          output:
            "gpg: keybox '/lab/gnupg-franco/pubring.kbx' created\n" +
            "gpg: /lab/gnupg-franco/trustdb.gpg: trustdb created\n" +
            "gpg: directory '/lab/gnupg-franco/openpgp-revocs.d' created\n" +
            "gpg: revocation certificate stored as '.../30D255F241E4197831591AA7B6D563A9FB9A212A.rev'",
        },
        {
          command: "gpg --list-keys --keyid-format long",
          output:
            "pub   ed25519/B6D563A9FB9A212A 2026-11-21 [SC]\n" +
            "      30D255F241E4197831591AA7B6D563A9FB9A212A\n" +
            "uid                 [ultimate] Franco Soler (TP6 prueba) <franco.tp6@example.invalid>\n" +
            "sub   cv25519/F5F176B2DF76994C 2026-11-21 [E]",
        },
        {
          caption: "Exportación de la clave pública",
          command: "gpg --armor --export \"Franco Soler\" > mi_publica.asc\nhead -3 mi_publica.asc; wc -l mi_publica.asc",
          output:
            "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n" +
            "mDMEawGf6xYJKwYBBAHaRw8BAQdAVel1EGNUjoTtCQSIYklirgxElOBBZHNaKULl\n" +
            "14 mi_publica.asc",
        },
      ],
    },
    b1: {
      runs: [
        {
          caption: "Firma separada y verificación exitosa",
          command:
            "echo \"Acta de la clase 6\" > acta.txt\n" +
            "gpg --armor --detach-sign acta.txt\n" +
            "gpg --verify acta.txt.asc acta.txt",
          output:
            "gpg: Signature made Sat Nov 21 13:43:07 2026 UTC\n" +
            "gpg:                using EDDSA key 30D255F241E4197831591AA7B6D563A9FB9A212A\n" +
            "gpg: Good signature from \"Franco Soler (TP6 prueba) <franco.tp6@example.invalid>\" [ultimate]",
        },
        {
          caption: "Se modifica una palabra del acta (6 -> 7) y se verifica de nuevo",
          command:
            "sed -i \"s/clase 6/clase 7/\" acta.txt; cat acta.txt\n" +
            "gpg --verify acta.txt.asc acta.txt; echo rc=$?",
          output:
            "Acta de la clase 7\n" +
            "gpg: Signature made Sat Nov 21 13:43:07 2026 UTC\n" +
            "gpg:                using EDDSA key 30D255F241E4197831591AA7B6D563A9FB9A212A\n" +
            "gpg: BAD signature from \"Franco Soler (TP6 prueba) <franco.tp6@example.invalid>\" [ultimate]\n" +
            "rc=1",
        },
      ],
      answer:
        "Con el acta original la verificación da \"Good signature\". Después de " +
        "cambiar un solo carácter (6 por 7) da \"BAD signature\" y gpg termina con " +
        "código de salida 1. La firma digital se calcula sobre el hash del documento: " +
        "al verificar, gpg recalcula el hash del acta que recibe y lo compara con el " +
        "que quedó firmado. Como el efecto avalancha de la Parte A hace que el hash " +
        "cambie por completo, no coinciden y la verificación falla. La firma no dice " +
        "qué cambió, solo que el contenido ya no es el que se firmó.",
    },
    b2: {
      answer:
        "Se firma con la clave privada del firmante y se verifica con su clave " +
        "pública. Solo yo tengo mi clave privada, así que solo yo puedo producir una " +
        "firma que valide; en cambio la clave pública es de conocimiento general " +
        "(la exporté en mi_publica.asc justamente para compartirla), así que " +
        "cualquiera puede comprobar la firma sin poder falsificarla. Es el camino " +
        "inverso al del cifrado para un destinatario de la Parte C, donde se cifra " +
        "con la pública y se descifra con la privada.",
    },
    b3: {
      answer:
        "La firma digital aporta tres propiedades de la Unidad 1:\n\n" +
        "Integridad: si el documento cambia aunque sea un carácter, la verificación " +
        "falla (se vio arriba con \"BAD signature\").\n\n" +
        "Autenticidad: la firma solo pudo generarla quien posee la clave privada, " +
        "así que el documento está atado a esa identidad (verificable por quien " +
        "confía en que la clave pública pertenece al firmante).\n\n" +
        "No repudio: como la clave privada es de uso exclusivo del firmante, este no " +
        "puede negar luego haber firmado. Esto depende de que la clave privada se " +
        "mantenga realmente secreta; con un secreto compartido (HMAC, cifrado " +
        "simétrico) no se logra, porque ambas partes podrían haber generado el mensaje.\n\n" +
        "Lo que la firma no da es confidencialidad: acta.txt sigue siendo legible.",
    },
  },

  parteC: {
    runs: [
      {
        caption: "Importar la clave pública del destinatario y cifrar para él",
        command:
          "gpg --import compa_publica.asc\n" +
          "gpg --armor --encrypt --recipient \"Compa Prueba\" --trust-model always acta.txt\n" +
          "ls -l acta.txt.asc; head -4 acta.txt.asc",
        output:
          "gpg: key 21E02965AF8642F4: public key \"Compa Prueba <compa.tp6@example.invalid>\" imported\n" +
          "gpg: Total number processed: 1\n" +
          "gpg:               imported: 1\n" +
          "-rw-r--r-- 1 root root 309 acta.txt.asc\n" +
          "-----BEGIN PGP MESSAGE-----\n\n" +
          "hF4Dwtco4CoHdEgSAQdA0VQbyn3FhWmvSTorgaGyHQnal8TBMWYAlBfuCcpIkFEw\n" +
          "rmawtXKdIDoQjPUxKQJoCyfq9tCmr36OdGYY1I4dADhlqcjaBytUov/Yh0lgITkg",
      },
      {
        caption: "Intento de descifrado con MI llavero (el que cifró)",
        command: "gpg --decrypt acta.txt.asc; echo rc=$?",
        output:
          "gpg: encrypted with 255-bit ECDH key, ID C2D728E02A077448, created 2026-11-21\n" +
          "      \"Compa Prueba <compa.tp6@example.invalid>\"\n" +
          "gpg: decryption failed: No secret key\n" +
          "rc=2",
      },
      {
        caption: "Descifrado con el llavero del destinatario",
        command: "gpg --decrypt acta.txt.asc; echo rc=$?",
        output:
          "gpg: encrypted with 255-bit ECDH key, ID C2D728E02A077448, created 2026-11-21\n" +
          "      \"Compa Prueba <compa.tp6@example.invalid>\"\n" +
          "Acta de la clase 6\n" +
          "rc=0",
      },
    ],
    note:
      "Para el destinatario se generó una segunda clave de prueba (\"Compa Prueba\") " +
      "en un directorio GnuPG separado, que representa el llavero del compañero. " +
      "Se usó --trust-model always porque la clave importada no estaba certificada " +
      "en mi llavero; en uso real habría que verificar su huella antes de confiar.",
    answer:
      "Yo no puedo descifrarlo porque el archivo se cifró con la clave PÚBLICA del " +
      "destinatario (subclave ECDH, ID C2D728E02A077448) y solo la clave PRIVADA " +
      "correspondiente puede abrirlo. Esa clave privada solo existe en el llavero " +
      "del destinatario: mi llavero tiene mi par de claves y la pública de él, pero " +
      "no su privada. gpg lo dice de forma explícita: \"decryption failed: No " +
      "secret key\". Con el llavero del destinatario el mismo archivo se descifra y " +
      "devuelve el acta.\n\n" +
      "En resumen: se cifra con la pública del destinatario y se descifra con la " +
      "privada del destinatario. Eso resuelve el problema de distribución de " +
      "claves del cifrado simétrico (no hace falta compartir un secreto antes), y " +
      "tiene un efecto colateral útil: ni siquiera quien cifra puede volver a leer " +
      "el mensaje, a menos que también se incluya como destinatario.",
  },

  parteD: {
    runs: [
      {
        caption: "Issuer, subject y validez",
        command:
          "openssl s_client -connect www.unp.edu.ar:443 -servername www.unp.edu.ar </dev/null 2>/dev/null \\\n" +
          "  | openssl x509 -noout -issuer -subject -dates",
        output:
          "issuer=C = US, O = Let's Encrypt, CN = YE2\n" +
          "subject=CN = www.unp.edu.ar\n" +
          "notBefore=Sep  5 02:01:08 2026 GMT\n" +
          "notAfter=Dec  4 02:01:07 2026 GMT",
      },
      {
        caption: "Cadena enviada por el servidor y resultado de la verificación",
        command:
          "echo | openssl s_client -connect www.unp.edu.ar:443 -servername www.unp.edu.ar -showcerts \\\n" +
          "  2>/dev/null | grep -E \"^ *[0-9] s:|^ *i:|Verification|Verify return\"",
        output:
          " 0 s:CN = www.unp.edu.ar\n" +
          "   i:C = US, O = Let's Encrypt, CN = YE2\n" +
          " 1 s:C = US, O = Let's Encrypt, CN = YE2\n" +
          "   i:C = US, O = ISRG, CN = Root YE\n" +
          " 2 s:C = US, O = ISRG, CN = Root YE\n" +
          "   i:C = US, O = Internet Security Research Group, CN = ISRG Root X2\n" +
          " 3 s:C = US, O = Internet Security Research Group, CN = ISRG Root X2\n" +
          "   i:C = US, O = Internet Security Research Group, CN = ISRG Root X1\n" +
          "Verification: OK\n" +
          "Verify return code: 0 (ok)",
      },
      {
        caption: "Raíces presentes en el almacén de confianza del sistema",
        command:
          "for f in /etc/ssl/certs/ISRG_Root_X*.pem; do openssl x509 -in $f -noout -subject -issuer; done\n" +
          "grep -c \"BEGIN CERT\" /etc/ssl/certs/ca-certificates.crt",
        output:
          "subject=C = US, O = Internet Security Research Group, CN = ISRG Root X1\n" +
          "issuer=C = US, O = Internet Security Research Group, CN = ISRG Root X1\n" +
          "subject=C = US, O = Internet Security Research Group, CN = ISRG Root X2\n" +
          "issuer=C = US, O = Internet Security Research Group, CN = ISRG Root X2\n" +
          "148",
      },
    ],
    d1:
      "El certificado fue emitido por Let's Encrypt (intermedia \"YE2\", " +
      "organización Let's Encrypt, país US) para el subject CN = www.unp.edu.ar. " +
      "Es válido desde el 5 de septiembre de 2026 hasta el 4 de diciembre de 2026: " +
      "90 días, la duración corta típica de Let's Encrypt, pensada para renovarse " +
      "automáticamente. Además es un certificado de servidor, no de CA " +
      "(Basic Constraints: CA:FALSE) y su nombre alternativo (SAN) es solo " +
      "www.unp.edu.ar.",
    d2:
      "La cadena de confianza, de abajo hacia arriba:\n\n" +
      "1. Servidor (hoja): www.unp.edu.ar, emitido por \"YE2\".\n" +
      "2. Intermedia: Let's Encrypt YE2, emitida por \"Root YE\".\n" +
      "3. Intermedia: ISRG Root YE, emitida por ISRG Root X2.\n" +
      "4. Raíz: ISRG Root X2, autofirmada (issuer = subject) y presente en el " +
      "almacén de confianza del sistema.\n\n" +
      "El servidor también envía una copia de ISRG Root X2 firmada por ISRG Root X1 " +
      "(otra raíz del almacén); es un certificado cruzado, útil para clientes que " +
      "aún no tienen X2 pero sí X1. Con el almacén usado en este laboratorio, que " +
      "contiene ambas raíces, la verificación terminó en \"Verify return code: 0 (ok)\".",
    d3:
      "Mi navegador (y openssl en este caso) confía sin haber visto antes el " +
      "certificado porque confía en la raíz, no en cada sitio: el sistema operativo " +
      "o el navegador traen preinstalado un almacén de CAs raíz de confianza (148 en " +
      "el contenedor usado). Cada certificado de la cadena está firmado con la clave " +
      "privada del eslabón superior, así que verificando las firmas de abajo hacia " +
      "arriba se llega a una raíz que ya está en el almacén; además se comprueba que " +
      "el nombre del sitio coincida con el SAN y que las fechas estén vigentes. " +
      "La confianza es transitiva y descansa en las CAs: si una raíz es comprometida " +
      "o emite certificados falsos, todos confiarían en ellos, razón por la cual " +
      "existen mecanismos como la revocación y Certificate Transparency.",
  },

  extra: {
    runs: [
      {
        caption: "RSA 3072 vs Ed25519: tamaño y tiempo de generación",
        command:
          "openssl pkey -in rsa.pem -pubout -outform DER | wc -c   # RSA 3072\n" +
          "openssl pkey -in ed.pem  -pubout -outform DER | wc -c   # Ed25519\n" +
          "time openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072\n" +
          "time openssl genpkey -algorithm ED25519",
        output:
          "422\n44\n" +
          "RSA 3072:  real 0m0.308s   (la generación de RSA varía entre corridas: 0.3 s y 1.0 s)\n" +
          "Ed25519:   real 0m0.003s",
      },
      {
        caption: "Negociación TLS de www.unp.edu.ar (forward secrecy)",
        command: "openssl s_client -connect www.unp.edu.ar:443 -servername www.unp.edu.ar </dev/null",
        output:
          "Server Temp Key: X25519, 253 bits\n" +
          "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384",
      },
    ],
    rsaEd:
      "Ed25519 gana en tamaño (clave pública de 44 bytes contra 422 de RSA-3072, " +
      "que se considera de seguridad comparable, unos 128 bits) y en velocidad de " +
      "generación (milisegundos contra décimas de segundo o más; en RSA el tiempo " +
      "es aleatorio porque depende de buscar números primos). Por eso en este TP la " +
      "clave GPG se generó con Ed25519.",
    pfs:
      "Forward secrecy significa que, aunque alguien obtenga la clave privada del " +
      "servidor en el futuro, no puede descifrar sesiones pasadas: cada sesión usa un " +
      "intercambio de claves efímero (acá X25519, ver \"Server Temp Key\") que se " +
      "descarta al terminar, y la clave de largo plazo del servidor solo se usa para " +
      "autenticarse, no para proteger el tráfico. TLS 1.3 lo exige eliminando el " +
      "intercambio con RSA estático. Es la defensa contra \"harvest now, decrypt " +
      "later\": un adversario que graba hoy tráfico cifrado para descifrarlo cuando " +
      "consiga la clave privada (o un computador cuántico) no obtiene nada, porque no " +
      "hay una clave de larga vida que lo abra todo.",
    pqc:
      "Un computador cuántico lo bastante grande rompe RSA y ECC con el algoritmo de " +
      "Shor, que resuelve en tiempo polinomial la factorización y el logaritmo " +
      "discreto, que son los problemas en los que se basan. AES, en cambio, no tiene " +
      "esa estructura matemática: el mejor ataque cuántico conocido es el de Grover, " +
      "que solo da una aceleración cuadrática, es decir, reduce a la mitad los bits " +
      "efectivos de la clave; AES-256 sigue dando unos 128 bits de seguridad " +
      "efectiva. FIPS 203 estandariza ML-KEM (derivado de CRYSTALS-Kyber), un " +
      "mecanismo de encapsulación de claves basado en retículos, para reemplazar el " +
      "intercambio de claves vulnerable a Shor. Steghide no se trabajó en este TP.",
  },
};
