# laboratorios — Espacio de prácticas de laboratorio

Repositorio de prácticas para la materia *Auditoría y Seguridad de Sistemas*
(ARyS · IF046 · UNPSJB Trelew). El material oficial de la cátedra (PDFs)
vive en `docs/`. **Todo lo resuelto en la materia vive en `tp/`** (en este
workspace, `practica/laboratorios/tp/`): ahí está cada trabajo práctico con
su fuente, su documento y su evidencia.

## Estructura

| Ruta          | Contenido                                                          |
| ------------- | ------------------------------------------------------------------ |
| `docs/`       | Material de cátedra: PDFs y material de estudio derivado en Markdown. |
| `tp/`         | Trabajos prácticos resueltos (ver más abajo).                      |
| `docker/`     | Contenedor reproducible para la parte de laboratorio de **TP1 y TP2** (TP3 y TP4 se reproducen en VM, ver abajo). |
| `scripts/`    | Checker de integridad de `docs/` (manifiesto SHA-256).             |
| `AGENTS.md`   | Reglas para agentes de IA que trabajen en este repositorio.         |

## Política de `docs/` (dos niveles)

- Los archivos **existentes** en `docs/` son inmutables: nunca se editan,
  renombran, mueven ni borran.
- **Agregar** archivos nuevos a `docs/` está permitido, pero debe pasar por
  el flujo de actualización del manifiesto (`python3 scripts/docs_guard.py update`).
- Leer de `docs/` siempre está permitido.

La integridad de la carpeta se verifica de forma determinística: un
manifiesto SHA-256 (rutas ordenadas, saltos de línea LF) más un script que
falla ante cualquier modificación o borrado de un archivo conocido, y avisa
ante archivos nuevos sin admitir. Ver `AGENTS.md` para el detalle de uso.

## Trabajos prácticos (`tp/`)

Todo el trabajo resuelto está acá, en `tp/`. Cada TP vive en su propia carpeta
(`tp/tp1/`, `tp/tp2/`, `tp/tp3/`, `tp/tp4/`) con la misma estructura:

| Archivo | Qué es |
| ------- | ------ |
| `content.js`     | El contenido del TP (respuestas, capturas de terminal, tablas) como datos estructurados. |
| `build_docx.js`  | Script que renderiza `content.js` a un `.docx` con formato. |
| `TP*.docx`       | El documento generado — es el artefacto final, no se edita a mano. |
| `assets/`        | Imágenes/croquis embebidos en el documento (si el TP lo requiere). |
| `work/`          | Carpeta de trabajo del laboratorio (montada dentro del contenedor Docker); no forma parte del entregable. |


### Cómo se reproduce la parte de laboratorio

El entorno de laboratorio **no es el mismo para todos los TP**. Hay dos modelos,
según lo que cada práctica necesita:

#### TP1 y TP2 — contenedor Docker

Los ejercicios de TP1 y TP2 (hashes, GPG, permisos, LUKS, etc.) se ejecutaron
dentro de un contenedor Docker (`docker/Dockerfile`), para que el entorno sea
reproducible: mismas versiones de herramientas, sin tocar el sistema anfitrión.
Ver `docker/README.md` para el detalle completo, incluyendo las limitaciones
conocidas (USBGuard no es reproducible en un contenedor) y los flags de
privilegios necesarios para LUKS.

```bash
docker build -f docker/Dockerfile -t arys-lab:bookworm .
mkdir -p tp/tp1/work   # o tp/tp2/work
docker run --rm -it -v "$PWD/tp/tp1/work:/lab" arys-lab:bookworm
```

Los TP1 B.1–B.4 corren con ese comando simple. El TP2 B.1 (LUKS) necesita
privilegios adicionales — el comando exacto está en `docker/README.md`.

#### TP3 y TP4 — laboratorio VirtualBox (no Docker)

TP3 (Reconocimiento y Escaneo) y TP4 (Sniffing y Análisis de Tráfico) **no se
reproducen con el contenedor**: necesitan máquinas virtuales reales con sus
interfaces de red (escaneo de puertos, ARP spoofing) que un contenedor no
puede ofrecer de forma fiel.

- **TP3**: Kali Linux (atacante) + Metasploitable 2 (blanco) sobre una red
  solo-anfitrión aislada.
- **TP4**: dos VMs Kali Linux (atacante y víctima, esta última clonada de la
  primera) sobre una **NAT Network** de VirtualBox — un segmento L2 compartido
  entre ambas, con salida a internet para generar tráfico de prueba real
  (HTTP/HTTPS) sin exponer la red del laboratorio a terceros.

La receta completa de armado de cada laboratorio (diseño de red, direcciones,
verificaciones) está documentada **dentro del propio entregable**: Parte A de
`tp/tp3/TP3.docx` y `tp/tp4/TP4.docx` respectivamente. Por eso el
`docker/Dockerfile` declara explícitamente que TP3 y TP4 quedan fuera de su
alcance.
