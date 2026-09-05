// Renders tp/tp1/content.js into TP1.docx.
// Run: node tp/tp1/build_docx.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} = require("docx");

const content = require("./content.js");
const OUT = path.join(__dirname, "TP1.docx");

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

// Terminal transcript block: monospace, shaded, one paragraph per line
// (docx forbids \n inside a TextRun).
const transcript = (text) => {
  const lines = String(text).replace(/\s+$/, "").split("\n");
  return lines.map((line, i) => new Paragraph({
    spacing: { after: i === lines.length - 1 ? 120 : 0 },
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
    children: [new TextRun({ text: line || " ", font: MONO, size: 17 })],
  }));
};

const table = (headers, rows) => {
  const colW = Math.floor(PAGE_W / headers.length);
  const widths = headers.map(() => colW);
  const cell = (text, bold, fill) => new TableCell({
    width: { size: colW, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold })] })],
  });
  return new Table({
    columnWidths: widths,
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((x) => cell(x, true, "E8E8E8")) }),
      ...rows.map((r) => new TableRow({ children: r.map((x) => cell(x, false)) })),
    ],
  });
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
body.push(h("Parte A — El inventario y la tríada", HeadingLevel.HEADING_1));
body.push(h("A.1 / A.2 — Activos y pilar CIA crítico", HeadingLevel.HEADING_2));
if (content.parteA.assets) {
  body.push(table(["Activo", "Pilar CIA crítico", "Justificación"],
    content.parteA.assets.map((a) => [a.asset, a.pillar, a.justification])));
} else body.push(pending("tabla de cinco activos con su pilar CIA crítico"));

body.push(h("A.3 — Análisis de riesgo del activo principal", HeadingLevel.HEADING_2));
if (content.parteA.riskAnalysis) {
  const r = content.parteA.riskAnalysis;
  body.push(table(["Campo", "Valor"], [
    ["Activo", r.asset], ["Amenaza", r.threat], ["Vulnerabilidad", r.vulnerability],
    ["Impacto", r.impact], ["Probabilidad", r.likelihood],
  ]));
  body.push(new Paragraph({ spacing: { before: 120 } }));
  body.push(p(r.rationale));
} else body.push(pending("amenaza, vulnerabilidad y estimación de riesgo"));

// ---- Parte B
body.push(h("Parte B — La tríada en acción (laboratorio)", HeadingLevel.HEADING_1));
body.push(p(
  "Todos los comandos se ejecutaron dentro del contenedor Docker del repositorio " +
  "(imagen arys-lab:bookworm, Debian bookworm-slim), lo que fija las versiones de las " +
  "herramientas y aísla el laboratorio del sistema anfitrión. Los bloques monoespaciados " +
  "reproducen la transcripción literal de la terminal."));

const bSections = [
  ["b1", "B.1 — Integridad: funciones de hash"],
  ["b2", "B.2 — Confidencialidad: cifrado simétrico"],
  ["b3", "B.3 — Confidencialidad e integridad: control de acceso"],
  ["b4", "B.4 — Disponibilidad: el backup que se prueba"],
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
  if (s.answer) {
    body.push(new Paragraph({ spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: "Respuesta", bold: true })] }));
    for (const para of s.answer.split("\n\n")) body.push(p(para));
  }
}

// ---- Parte C
body.push(h("Parte C — Del riesgo al control", HeadingLevel.HEADING_1));
if (content.parteC.controls) {
  body.push(table(["Control", "Tipo", "Pilar CIA", "Fundamento"],
    content.parteC.controls.map((c) => [c.control, c.type, c.pillar, c.rationale])));
} else body.push(pending("tabla de dos controles propuestos"));
if (content.parteC.justification) {
  body.push(new Paragraph({ spacing: { before: 160 } }));
  body.push(p(content.parteC.justification));
} else body.push(pending("párrafo de justificación de prioridad"));

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
              children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes)`);
});
