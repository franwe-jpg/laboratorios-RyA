// Renders tp/tp4/content.js into TP4.docx.
// Run: node tp/tp4/build_docx.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, ImageRun,
} = require("docx");

const content = require("./content.js");
const OUT = path.join(__dirname, "TP4.docx");

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

const runBlocks = (runs) => {
  const out = [];
  for (const run of runs) {
    if (run.caption) out.push(new Paragraph({ spacing: { before: 120, after: 60 },
      children: [new TextRun({ text: run.caption, bold: true, size: 20 })] }));
    out.push(...transcript(run.command ? `$ ${run.command}\n${run.output}` : run.output));
  }
  return out;
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

const answerBlock = (answer, what) => {
  const out = [new Paragraph({ spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: "Respuesta", bold: true })] })];
  if (answer) out.push(...paras(answer));
  else out.push(pending(what || "respuesta a la consigna"));
  return out;
};

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
          "El laboratorio se armó sobre VirtualBox con dos máquinas virtuales Kali " +
          "Linux en una NAT Network aislada; todo el tráfico capturado y toda la " +
          "interceptación corresponden a tráfico propio, generado y sniffeado " +
          "exclusivamente entre esas dos VMs.",
    italics: true, size: 18, color: "555555",
  })] }));

// ---- Parte A
body.push(h("Parte A — Armado y captura pasiva", HeadingLevel.HEADING_1));
if (content.parteA.intro) body.push(...paras(content.parteA.intro));
else body.push(pending("descripción del diseño del laboratorio"));

body.push(h("A.1 — Laboratorio", HeadingLevel.HEADING_2));
if (content.parteA.lab && content.parteA.lab.runs) body.push(...runBlocks(content.parteA.lab.runs));
else body.push(pending("IP y MAC de cada VM, y verificación de conectividad (ping)"));

body.push(h("A.2 — Anatomía de una conexión", HeadingLevel.HEADING_2));
if (content.parteA.a2) {
  if (content.parteA.a2.note) body.push(...paras(content.parteA.a2.note));
  for (const img of content.parteA.a2.images || []) body.push(...figure(img));
  if (content.parteA.a2.followStream) for (const img of content.parteA.a2.followStream) body.push(...figure(img));
  else body.push(pending("captura de Follow > TCP Stream sobre el tráfico HTTP"));
  body.push(...answerBlock(content.parteA.a2.answer,
    "qué se lee en el stream y qué datos quedarían expuestos si fuera un login"));
} else body.push(pending("handshake TCP y Follow TCP Stream"));

body.push(h("A.3 — HTTP vs HTTPS", HeadingLevel.HEADING_2));
if (content.parteA.a3 && (content.parteA.a3.note || content.parteA.a3.images)) {
  if (content.parteA.a3.note) body.push(...paras(content.parteA.a3.note));
  for (const img of content.parteA.a3.images || []) body.push(...figure(img));
  body.push(...answerBlock(content.parteA.a3.answer,
    "qué se ve y qué no se ve en HTTPS, relacionado con TLS 1.3 (RFC 8446)"));
} else body.push(pending("captura de tráfico HTTPS y comparación con HTTP"));

body.push(h("A.4 — DNS en claro vs cifrado", HeadingLevel.HEADING_2));
if (content.parteA.a4 && content.parteA.a4.images) for (const img of content.parteA.a4.images) body.push(...figure(img));
body.push(...answerBlock(content.parteA.a4 && content.parteA.a4.answer,
  "qué revela el DNS tradicional, y cómo lo cierran DoT (RFC 7858) y DoH (RFC 8484)"));

// ---- Parte B
body.push(h("Parte B — ARP spoofing / MITM controlado", HeadingLevel.HEADING_1));
if (content.parteB.intro) body.push(...paras(content.parteB.intro));
else body.push(pending("descripción del ataque realizado con bettercap"));

body.push(h("B.1 — Cambio en la tabla ARP de la víctima", HeadingLevel.HEADING_2));
if (content.parteB.b1 && content.parteB.b1.images) {
  for (const img of content.parteB.b1.images) body.push(...figure(img));
  body.push(...answerBlock(content.parteB.b1.answer,
    "por qué ARP lo permite (RFC 826, sin autenticación)"));
} else body.push(pending("tabla ARP antes y durante el spoofing, y explicación"));

body.push(h("B.2 — Tráfico HTTP bajo MITM", HeadingLevel.HEADING_2));
if (content.parteB.b2 && content.parteB.b2.note) body.push(...paras(content.parteB.b2.note));
body.push(...answerBlock(content.parteB.b2 && content.parteB.b2.answer,
  "si el atacante ve el tráfico HTTP de la víctima"));

body.push(h("B.3 — Tráfico HTTPS bajo MITM", HeadingLevel.HEADING_2));
body.push(...answerBlock(content.parteB.b3 && content.parteB.b3.answer,
  "qué ve el atacante con HTTPS y por qué el MITM no alcanza para leer el contenido"));

body.push(h("B.4 — Fin del ataque y normalización", HeadingLevel.HEADING_2));
if (content.parteB.b4 && content.parteB.b4.images) for (const img of content.parteB.b4.images) body.push(...figure(img));
else body.push(pending("captura de `arp.spoof off` y la tabla ARP normalizada"));

// ---- Parte C
body.push(h("Parte C — Defensas", HeadingLevel.HEADING_1));
if (content.parteC.defenseTable) {
  body.push(table(["Ataque", "Control", "Cómo funciona"],
    content.parteC.defenseTable.map((r) => [r.attack, r.control, r.how]), [25, 25, 50]));
} else body.push(pending("tabla ataque → control → cómo funciona (DAI, Port Security)"));

body.push(h("Cierre: por qué el cifrado es la defensa definitiva", HeadingLevel.HEADING_2));
if (content.parteC.closing) body.push(...paras(content.parteC.closing));
else body.push(pending("párrafo de cierre, enlazando con A.3 y B.3"));

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
              children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes)`);
});
