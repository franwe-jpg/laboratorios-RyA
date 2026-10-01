// Renders tp/tp3/content.js into TP3.docx.
// Run: node tp/tp3/build_docx.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, ImageRun,
} = require("docx");

const content = require("./content.js");
const OUT = path.join(__dirname, "TP3.docx");

const PAGE_W = 9026; // usable width in DXA (A4 minus 1in margins)
const MONO = "Consolas";

const p = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts,
    children: [new TextRun({ text, ...(opts.run || {}) })] });

const paras = (text) => String(text).split("\n\n").map((x) => p(x));

const h = (text, level) =>
  new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

const pending = (what) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: `[PENDIENTE] ${what}`, italics: true, color: "999999" })],
  });

const transcript = (text) => {
  const lines = String(text).replace(/\s+$/, "").split("\n");
  return lines.map((line, i) => new Paragraph({
    spacing: { after: i === lines.length - 1 ? 120 : 0 },
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
    children: [new TextRun({ text: line || " ", font: MONO, size: 17 })],
  }));
};

// Renders a list of { caption?, command?, output } blocks as shaded transcripts.
const runBlocks = (runs) => {
  const out = [];
  for (const run of runs) {
    if (run.caption) out.push(new Paragraph({ spacing: { before: 120, after: 60 },
      children: [new TextRun({ text: run.caption, bold: true, size: 20 })] }));
    out.push(...transcript(run.command ? `$ ${run.command}\n${run.output}` : run.output));
  }
  return out;
};

// `ratios` (optional) are relative column weights; defaults to equal columns.
const table = (headers, rows, ratios) => {
  const w = ratios || headers.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const widths = w.map((x) => Math.floor((PAGE_W * x) / total));
  widths[0] += PAGE_W - widths.reduce((a, b) => a + b, 0); // absorb rounding
  const cell = (text, bold, fill, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold })] })],
  });
  return new Table({
    columnWidths: widths,
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((x, i) => cell(x, true, "E8E8E8", i)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((x, i) => cell(x, false, null, i)) })),
    ],
  });
};

const answerBlock = (answer, what) => {
  const out = [new Paragraph({ spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: "Respuesta", bold: true })] })];
  if (answer) out.push(...paras(answer));
  else out.push(pending(what || "respuesta a la consigna"));
  return out;
};

// Renders a screenshot/image entry: { image, caption? }.
const figure = (entry) => {
  const out = [];
  const imgBuf = fs.readFileSync(path.join(__dirname, entry.image));
  out.push(new Paragraph({ spacing: { before: 80, after: 40 }, alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type: "png", data: imgBuf, transformation: { width: 440, height: 289 } })] }));
  if (entry.caption) out.push(new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: entry.caption, italics: true, size: 18, color: "555555" })] }));
  return out;
};

// ---------------------------------------------------------------- build
const body = [];

// Cover
body.push(new Paragraph({ spacing: { before: 1200, after: 240 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: content.meta.title, bold: true, size: 36 })] }));
[content.meta.course, content.meta.institution].forEach((t) =>
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: t, size: 24 })] })));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 },
  children: [new TextRun({ text: content.meta.student, size: 24, bold: true })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [new TextRun({ text: content.meta.date, size: 22 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 },
  children: [new TextRun({
    text: "El desarrollo de este trabajo fue asistido por la IA Claude (Anthropic). " +
          "El laboratorio se armó sobre VirtualBox con dos máquinas virtuales en una " +
          "red solo-anfitrión aislada; todo el escaneo se ejecutó contra ese entorno propio.",
    italics: true, size: 18, color: "555555",
  })] }));

// ---- Parte A
body.push(h("Parte A — Armado del laboratorio", HeadingLevel.HEADING_1));
if (content.parteA.intro) body.push(...paras(content.parteA.intro));
else body.push(pending("descripción del diseño del laboratorio"));

body.push(h("A.1 — Configuración de la red aislada", HeadingLevel.HEADING_2));
if (content.parteA.setup) body.push(...runBlocks(content.parteA.setup));
else body.push(pending("configuración de la red solo-anfitrión"));

body.push(h("A.2 — Conectividad entre atacante y blanco", HeadingLevel.HEADING_2));
if (content.parteA.evidence) {
  if (content.parteA.evidence.note) body.push(...paras(content.parteA.evidence.note));
  if (content.parteA.evidence.runs) body.push(...runBlocks(content.parteA.evidence.runs));
  for (const img of content.parteA.evidence.images || []) body.push(...figure(img));
} else body.push(pending("capturas de `ip a` en ambas máquinas y del `ping` exitoso entre ellas"));

body.push(h("A.3 — Snapshot del blanco", HeadingLevel.HEADING_2));
if (content.parteA.snapshot) {
  if (content.parteA.snapshot.note) body.push(...paras(content.parteA.snapshot.note));
  if (content.parteA.snapshot.runs) body.push(...runBlocks(content.parteA.snapshot.runs));
} else body.push(pending("snapshot limpio de la VM Metasploitable"));

// ---- Parte B
body.push(h("Parte B — Reconocimiento pasivo (OSINT)", HeadingLevel.HEADING_1));
if (content.parteB.intro) body.push(...paras(content.parteB.intro));
if (content.parteB.runs) body.push(...runBlocks(content.parteB.runs));
else body.push(pending("salidas de whois, dig y crt.sh sobre unp.edu.ar"));

const bSections = [
  ["b1", "B.1 — Administración del dominio, servidores de correo y de nombres",
         "quién administra el dominio y qué servidores MX y NS usa"],
  ["b2", "B.2 — Subdominios hallados por certificados públicos",
         "cinco subdominios y su interpretación"],
  ["b3", "B.3 — Reconocimiento pasivo frente a escaneo activo",
         "diferencia entre pasivo y activo, y por qué solo uno requiere autorización"],
];
for (const [key, title, what] of bSections) {
  body.push(h(title, HeadingLevel.HEADING_2));
  body.push(...answerBlock(content.parteB[key], what));
}

// ---- Parte C
body.push(h("Parte C — Escaneo del laboratorio", HeadingLevel.HEADING_1));
body.push(p(
  "Todos los comandos de esta parte se ejecutaron desde la VM Kali contra la VM " +
  "Metasploitable, dentro del segmento aislado 192.168.56.0/24. Ningún comando " +
  "de escaneo se dirigió a unp.edu.ar ni a ninguna red externa."));

body.push(h("C.1 — Servicios detectados", HeadingLevel.HEADING_2));
if (content.parteC.runs) body.push(...runBlocks(content.parteC.runs));
else body.push(pending("salidas de nmap: descubrimiento, -sS, -sV -p-, -O y -sC"));
if (content.parteC.portTable) {
  body.push(table(["Puerto", "Estado", "Servicio", "Versión"],
    content.parteC.portTable.map((r) => [r.port, r.state, r.service, r.version]),
    [14, 14, 22, 50]));
} else body.push(pending("tabla de al menos ocho servicios abiertos"));

body.push(h("C.2 — Correlación con vulnerabilidades públicas", HeadingLevel.HEADING_2));
if (content.parteC.cves) {
  body.push(table(["Servicio / versión", "CVE", "Descripción"],
    content.parteC.cves.map((r) => [r.service, r.cve, r.description]), [28, 20, 52]));
} else body.push(pending("tres servicios con su CVE de Exploit-DB o NVD"));

body.push(h("C.3 — Diferencia entre -sS y -sV", HeadingLevel.HEADING_2));
body.push(...answerBlock(content.parteC.c3, "comparación -sS vs -sV y valor de la versión"));

body.push(h("C.4 — Interpretación de un puerto filtered", HeadingLevel.HEADING_2));
body.push(...answerBlock(content.parteC.c4, "qué produce un estado filtered"));

// ---- Parte D
body.push(h("Parte D — Análisis y defensa", HeadingLevel.HEADING_1));
if (content.parteD.defenseTable) {
  body.push(table(
    ["Servicio / versión", "CVE", "Riesgo (CVSS)", "Cómo lo detectaría un defensor", "Contramedida"],
    content.parteD.defenseTable.map((r) => [r.service, r.cve, r.cvss, r.detection, r.countermeasure]),
    [20, 15, 12, 27, 26]));
} else body.push(pending("tabla de defensa para los tres servicios vulnerables"));

body.push(h("Prioridades de remediación", HeadingLevel.HEADING_2));
body.push(...answerBlock(content.parteD.priorities,
  "párrafo con las tres primeras acciones como administrador, en orden y con su justificación"));

// ---- Anexo: explotacion (fase 3)
if (content.parteAnexo) {
  const a = content.parteAnexo;
  body.push(h("Anexo — Explotacion (fase 3)", HeadingLevel.HEADING_1));
  if (a.intro) body.push(...paras(a.intro));

  body.push(h("A.1 — Obtencion de acceso: backdoor de vsftpd 2.3.4", HeadingLevel.HEADING_2));
  if (a.exploitation) {
    if (a.exploitation.note) body.push(...paras(a.exploitation.note));
    if (a.exploitation.runs) body.push(...runBlocks(a.exploitation.runs));
    if (a.exploitation.images) for (const img of a.exploitation.images) body.push(...figure(img));
    else body.push(pending("captura de las terminales A y B: disparo del backdoor y shell de root"));
  }

  body.push(h("A.2 — Post-explotacion y alcance del compromiso", HeadingLevel.HEADING_2));
  if (a.impact) {
    if (a.impact.note) body.push(...paras(a.impact.note));
    if (a.impact.images) for (const img of a.impact.images) body.push(...figure(img));
    else body.push(pending("captura del shell de root con las pruebas de impacto"));
  }

  body.push(h("A.3 — Defensa: bloqueo del vector", HeadingLevel.HEADING_2));
  if (a.defense && (a.defense.note || a.defense.runs || a.defense.images)) {
    if (a.defense.note) body.push(...paras(a.defense.note));
    if (a.defense.runs) body.push(...runBlocks(a.defense.runs));
    if (a.defense.images) for (const img of a.defense.images) body.push(...figure(img));
  } else body.push(pending("demostracion de la contramedida: el mismo ataque falla tras aplicar la defensa"));

  if (a.conclusion) {
    body.push(h("A.4 — Conclusion del anexo", HeadingLevel.HEADING_2));
    body.push(...paras(a.conclusion));
  }
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
              children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes)`);
});
