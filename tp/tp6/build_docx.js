// Renders tp/tp6/content.js into TP6.docx.
// Run: node tp/tp6/build_docx.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
} = require("docx");

const content = require("./content.js");
const OUT = path.join(__dirname, "TP6.docx");

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

// ---------------------------------------------------------------- build
const body = [];
const bold = (t, o = {}) => new Paragraph({ spacing: { before: 160, after: 60 },
  children: [new TextRun({ text: t, bold: true, ...o })] });
const paras = (text) => String(text).split("\n\n").map((t) => p(t));
// Each run is rendered as a terminal-style PNG (assets/, see render_shots.py) from the
// literal transcript. Falls back to the text block if the image is missing.
const png = (name) => {
  const f = path.join(__dirname, "assets", `${name}.png`);
  if (!fs.existsSync(f)) return null;
  const data = fs.readFileSync(f);
  const w = data.readUInt32BE(16), hgt = data.readUInt32BE(20);
  const width = 600;
  return new Paragraph({ spacing: { after: 160 }, keepNext: false,
    children: [new ImageRun({ type: "png", data, transformation: { width, height: Math.round((hgt * width) / w) } })] });
};
let runPath = [];
const runs = (list, name) => {
  (list || []).forEach((run, i) => {
    if (run.caption) body.push(new Paragraph({ spacing: { before: 120, after: 60 }, keepNext: true,
      children: [new TextRun({ text: run.caption, bold: true, size: 20 })] }));
    const img = png(`${name}-${i}`);
    if (img) body.push(img);
    else body.push(...transcript(run.command ? `$ ${run.command}\n${run.output}` : run.output));
  });
};
const answer = (text) => { body.push(bold("Respuesta")); body.push(...paras(text)); };

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
          "Todos los comandos se ejecutaron dentro del contenedor Docker del repositorio " +
          "(imagen arys-lab:bookworm); las claves GPG son de prueba y viven en un " +
          "directorio descartable. Las imágenes de terminal (con estilo de consola Kali) se generaron a partir de la salida literal de cada comando, ejecutado en el contenedor Debian; no son capturas de una ventana real.",
    italics: true, size: 18, color: "555555",
  })] }));

// ---- Parte A
body.push(h("Parte A — Simétrico y hash con OpenSSL", HeadingLevel.HEADING_1));
const A = content.parteA;
body.push(h("A.1 — Cifrado simétrico: ilegible y recuperable", HeadingLevel.HEADING_2));
body.push(p(A.a1.intro)); runs(A.a1.runs, 'parteA-a1'); answer(A.a1.answer);
body.push(h("A.2 — Hash: efecto avalancha", HeadingLevel.HEADING_2));
runs(A.a2.runs, 'parteA-a2'); answer(A.a2.answer);
body.push(h("A.3 — Qué aporta GCM (AEAD)", HeadingLevel.HEADING_2));
runs(A.a3.runs, 'parteA-a3'); answer(A.a3.answer);

// ---- Parte B
const B = content.parteB;
body.push(h("Parte B — Asimétrico y firma con GnuPG", HeadingLevel.HEADING_1));
body.push(h("Generación del par de claves", HeadingLevel.HEADING_2));
body.push(p(B.keygen.intro)); runs(B.keygen.runs, 'parteB-keygen');
body.push(h("B.1 — Firma válida y firma inválida", HeadingLevel.HEADING_2));
runs(B.b1.runs, 'parteB-b1'); answer(B.b1.answer);
body.push(h("B.2 — Qué clave firma y cuál verifica", HeadingLevel.HEADING_2));
answer(B.b2.answer);
body.push(h("B.3 — Propiedades que da la firma digital", HeadingLevel.HEADING_2));
answer(B.b3.answer);

// ---- Parte C
const C = content.parteC;
body.push(h("Parte C — Cifrar para un destinatario", HeadingLevel.HEADING_1));
body.push(p(C.note)); runs(C.runs, 'parteC'); answer(C.answer);

// ---- Parte D
const D = content.parteD;
body.push(h("Parte D — Un certificado TLS real (PKI)", HeadingLevel.HEADING_1));
runs(D.runs, 'parteD');
body.push(h("D.1 — Emisor, sujeto y validez", HeadingLevel.HEADING_2)); body.push(...paras(D.d1));
body.push(h("D.2 — Cadena de confianza", HeadingLevel.HEADING_2)); body.push(...paras(D.d2));
body.push(h("D.3 — Por qué el navegador confía", HeadingLevel.HEADING_2)); body.push(...paras(D.d3));

// ---- Extras
const E = content.extra;
body.push(h("Para investigar (opcional)", HeadingLevel.HEADING_1));
runs(E.runs, 'extra');
body.push(h("RSA vs Ed25519", HeadingLevel.HEADING_2)); body.push(...paras(E.rsaEd));
body.push(h("Forward secrecy y \"harvest now, decrypt later\"", HeadingLevel.HEADING_2)); body.push(...paras(E.pfs));
body.push(h("Criptografía post-cuántica", HeadingLevel.HEADING_2)); body.push(...paras(E.pqc));

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
              children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes)`);
});
