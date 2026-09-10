// Renders tp/tp2/content.js into TP2.docx.
// Run: node tp/tp2/build_docx.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, ImageRun,
} = require("docx");

const content = require("./content.js");
const OUT = path.join(__dirname, "TP2.docx");

const PAGE_W = 9026; // usable width in DXA (A4 minus 1in margins)
const MONO = "Consolas";

const p = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts,
    children: [new TextRun({ text, ...(opts.run || {}) })] });

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

const answerBlock = (answer) => {
  const out = [new Paragraph({ spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: "Respuesta", bold: true })] })];
  if (answer) for (const para of answer.split("\n\n")) out.push(p(para));
  else out.push(pending("respuesta a la consigna"));
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
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 },
  children: [new TextRun({ text: content.meta.date, size: 22 })] }));

// ---- Parte A
body.push(h("Parte A — Relevamiento de un entorno", HeadingLevel.HEADING_1));

body.push(h("A.1 — Capas de defensa en profundidad", HeadingLevel.HEADING_2));
if (content.parteA.layers) {
  body.push(p(content.parteA.layers.description));
  body.push(new Paragraph({ spacing: { before: 60 },
    children: [new TextRun({ text: "Capa faltante: ", bold: true }),
               new TextRun({ text: content.parteA.layers.missingLayer })] }));
} else body.push(pending("diagrama/descripción de capas y capa faltante"));

body.push(h("A.2 — Diez controles observados", HeadingLevel.HEADING_2));
if (content.parteA.controls) {
  body.push(table(["Control", "Tipo"],
    content.parteA.controls.map((c) => [c.control, c.type]), [65, 35]));
} else body.push(pending("tabla de diez controles clasificados"));

body.push(h("A.3 — Amenazas por familia", HeadingLevel.HEADING_2));
if (content.parteA.threats) {
  const t = content.parteA.threats;
  body.push(table(["Familia", "Descripción"], [
    ["Acceso físico no autorizado", t.physicalAccess],
    ["Desastres naturales", t.naturalDisaster],
    ["Alteraciones del entorno", t.environmental],
  ], [30, 70]));
} else body.push(pending("amenazas identificadas por las tres familias"));

body.push(h("A.4 — Tres hallazgos de mayor riesgo", HeadingLevel.HEADING_2));
if (content.parteA.findings) {
  content.parteA.findings.forEach((f, i) => {
    body.push(new Paragraph({ spacing: { before: 160 },
      children: [new TextRun({ text: `${i + 1}. ${f.finding}`, bold: true })] }));
    if (f.image) {
      const imgPath = path.join(__dirname, f.image);
      const imgBuf = fs.readFileSync(imgPath);
      body.push(new Paragraph({ spacing: { before: 80, after: 80 }, alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: "png", data: imgBuf, transformation: { width: 440, height: 289 } })] }));
    }
    body.push(p(f.note));
  });
} else body.push(pending("tres hallazgos con foto o croquis"));

// ---- Parte B
body.push(h("Parte B — Controles sobre el equipo (laboratorio)", HeadingLevel.HEADING_1));
body.push(p(
  "Los comandos se ejecutaron dentro del contenedor Docker del repositorio " +
  "(imagen arys-lab:bookworm), salvo donde se indica lo contrario por requerir " +
  "privilegios o hardware no disponible en un contenedor."));

const bSections = [
  ["b1", "B.1 — Cifrado de disco con LUKS"],
  ["b2", "B.2 — Bloqueo de puertos USB con USBGuard"],
  ["b3", "B.3 — Monitoreo de energía"],
];
for (const [key, title] of bSections) {
  body.push(h(title, HeadingLevel.HEADING_2));
  const s = content.parteB[key];
  if (!s) { body.push(pending("ejecución y respuesta de la consigna")); continue; }
  if (s.intro) body.push(p(s.intro));
  for (const run of s.runs || []) {
    if (run.caption) body.push(new Paragraph({ spacing: { before: 120, after: 60 },
      children: [new TextRun({ text: run.caption, bold: true, size: 20 })] }));
    body.push(...transcript(run.command ? `$ ${run.command}\n${run.output}` : run.output));
  }
  body.push(...answerBlock(s.answer));
}

// ---- Parte C
body.push(h("Parte C — Plan de mejora priorizado", HeadingLevel.HEADING_1));
if (content.parteC.riskTable) {
  body.push(table(
    ["Hallazgo", "Amenaza", "Impacto", "Prob.", "Control propuesto", "Tipo", "Prioridad"],
    content.parteC.riskTable.map((r) =>
      [r.finding, r.threat, r.impact, r.likelihood, r.control, r.type, r.priority]),
    [20, 16, 8, 8, 22, 12, 14]));
} else body.push(pending("tabla de tratamiento del riesgo, ordenada por riesgo"));

body.push(h("Trazabilidad normativa", HeadingLevel.HEADING_2));
if (content.parteC.frameworkNote) body.push(p(content.parteC.frameworkNote));
else body.push(pending("mapeo a ISO 27001 Anexo A cláusula 7 / NIST 800-53 PE"));

body.push(h("Conclusión", HeadingLevel.HEADING_2));
if (content.parteC.conclusion) body.push(p(content.parteC.conclusion));
else body.push(pending("párrafo de conclusión: un solo control, cuál y por qué"));

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
              children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes)`);
});
