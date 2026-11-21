// Renders tp/tp8/content.js into TP8.docx.
// Run: node tp/tp8/build_docx.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, ImageRun,
} = require("docx");

const content = require("./content.js");
const OUT = path.join(__dirname, "TP8.docx");

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

const table = (headers, rows, ratios) => {
  const w = ratios || headers.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const widths = w.map((x) => Math.floor((PAGE_W * x) / total));
  widths[0] += PAGE_W - widths.reduce((a, b) => a + b, 0);
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

// ---------------------------------------------------------------- build
const body = [];
const bold = (t, o = {}) => new Paragraph({ spacing: { before: 160, after: 60 },
  children: [new TextRun({ text: t, bold: true, ...o })] });
const paras = (text) => String(text).split("\n\n").map((t) => p(t));

// Each run is rendered as a terminal-style PNG (assets/, see render_shots.py) from the
// literal transcript. Falls back to the text block if the image is missing.
const png = (name, width = 600) => {
  const f = path.join(__dirname, "assets", `${name}.png`);
  if (!fs.existsSync(f)) return null;
  const data = fs.readFileSync(f);
  const w = data.readUInt32BE(16), hgt = data.readUInt32BE(20);
  return new Paragraph({ spacing: { after: 160 }, keepNext: false,
    children: [new ImageRun({ type: "png", data, transformation: { width, height: Math.round((hgt * width) / w) } })] });
};

const runs = (list, name) => {
  (list || []).forEach((run, i) => {
    if (run.caption) body.push(new Paragraph({ spacing: { before: 120, after: 60 }, keepNext: true,
      children: [new TextRun({ text: run.caption, bold: true, size: 20 })] }));
    const img = png(`${name}-${i}`);
    if (img) body.push(img);
    else body.push(...transcript(run.command ? `$ ${run.command}\n${run.output}` : run.output));
  });
};

const qa = (list) => {
  (list || []).forEach(({ q, a }) => {
    body.push(bold(q));
    body.push(...paras(a));
  });
};

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
          "Todos los comandos se ejecutaron en el laboratorio Docker del repositorio " +
          "(tp/tp8/compose.yaml: un contenedor con snmpd, tcpdump y rsyslog, más las imágenes " +
          "oficiales de Prometheus y Grafana). Las imágenes de terminal (con estilo de consola " +
          "Kali) se generaron a partir de la salida literal de cada comando, no son capturas " +
          "de una ventana real. Las tres imágenes de las interfaces web de la Parte C (Prometheus " +
          "y Grafana) sí son capturas reales del navegador (Chrome headless).",
    italics: true, size: 18, color: "555555",
  })] }));

// ---- Parte A
const C = content;
body.push(h("Parte A — SNMP", HeadingLevel.HEADING_1));
body.push(h("A.1 — Consultar un agente", HeadingLevel.HEADING_2));
body.push(p(C.parteA.a1.intro));
runs(C.parteA.a1.runs, "parteA-a1");
qa(C.parteA.a1.answers);
body.push(h("A.2 — Por qué v2c es inseguro", HeadingLevel.HEADING_2));
body.push(p(C.parteA.a2.intro));
runs(C.parteA.a2.runs, "parteA-a2");
qa(C.parteA.a2.answers);
body.push(h("Contraste con SNMP v3", HeadingLevel.HEADING_2));
body.push(p(C.parteA.v3.intro));
runs(C.parteA.v3.runs, "parteA-v3");
body.push(p(C.parteA.v3.note, { run: { italics: true, size: 18, color: "555555" } }));

// ---- Parte B
body.push(h("Parte B — Syslog", HeadingLevel.HEADING_1));
body.push(p(C.parteB.intro));
runs(C.parteB.runs, "parteB");
qa(C.parteB.answers);

// ---- Parte C
body.push(h("Parte C — Observabilidad (Prometheus + Grafana)", HeadingLevel.HEADING_1));
body.push(p(C.parteC.intro));
runs(C.parteC.runs, "parteC");
body.push(bold("Interfaces web"));
C.parteC.web.forEach((w) => {
  body.push(new Paragraph({ spacing: { before: 120, after: 60 }, keepNext: true,
    children: [new TextRun({ text: w.caption, bold: true, size: 20 })] }));
  body.push(png(w.file, 560));
});
qa(C.parteC.answers);

// ---- Parte D
body.push(h("Parte D — Cierre: del dato a la defensa", HeadingLevel.HEADING_1));
qa(C.parteD.answers);

// ---- Para investigar
body.push(h("Para investigar (opcional)", HeadingLevel.HEADING_1));
body.push(h("SNMP v3", HeadingLevel.HEADING_2));
body.push(...paras(C.investigar.snmpv3));
body.push(h("NetFlow / IPFIX", HeadingLevel.HEADING_2));
body.push(...paras(C.investigar.netflow));
body.push(h("Wazuh", HeadingLevel.HEADING_2));
body.push(...paras(C.investigar.wazuh));

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
              children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes)`);
});
