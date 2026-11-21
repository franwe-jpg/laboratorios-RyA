// Renders the executed TP5 notebook (build/TP5.executed.ipynb) into TP5.docx.
// Run: node build_docx.js   (normally via `python notebook/build.py all`)
//
// The notebook is the single source: markdown cells and text/markdown or
// image/png outputs become document content; code-cell inputs are never
// rendered. Only the markdown subset used by notebook/content.py and the
// lab helpers is supported: headings, paragraphs, bold/italic/code spans,
// fenced code, pipe tables, blockquotes and flat lists.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat,
  Table, TableRow, TableCell, WidthType, ShadingType, ImageRun, BorderStyle,
} = require("docx");

const NOTEBOOK = path.join(__dirname, "build", "TP5.executed.ipynb");
const OUT = path.join(__dirname, "TP5.docx");

const PAGE_W = 9026; // usable width in DXA (A4 minus 1in margins)
const MONO = "Consolas";
const FONT = "Calibri";

// ---------------------------------------------------------------- inline
// Semantic verdict labels keep one color code across the report:
// green = allowed/valid, red = blocked/invalid, amber = detected, violet = translated.
const VERDICT_COLORS = {
  "PERMITIDO": "1E7B34", "VÁLIDO": "1E7B34", "REGISTRADO": "1E7B34", "acceso": "1E7B34",
  "BLOQUEADO": "B42318", "INVÁLIDO": "B42318", "RECHAZADO": "B42318",
  "DETECTADO": "B54708", "NO DETECTADO": "6B7280", "TRADUCIDO": "6941C6",
};

// Recursive so nested spans such as **bold with `code` or *italic*** work.
const SPAN = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*/;
const inline = (text, base = {}) => {
  const runs = [];
  let rest = String(text);
  while (rest) {
    const m = rest.match(SPAN);
    if (!m) { runs.push(new TextRun({ ...base, text: rest })); break; }
    if (m.index) runs.push(new TextRun({ ...base, text: rest.slice(0, m.index) }));
    if (m[1] !== undefined) runs.push(...inline(m[1], { ...base, bold: true, ...(VERDICT_COLORS[m[1]] ? { color: VERDICT_COLORS[m[1]] } : {}) }));
    else if (m[2] !== undefined) runs.push(new TextRun({ ...base, text: m[2], font: MONO, size: 20 }));
    else runs.push(...inline(m[3], { ...base, italics: true }));
    rest = rest.slice(m.index + m[0].length);
  }
  return runs;
};

// Joins paragraph lines; a trailing double space is a hard line break.
const inlineLines = (lines, base) => {
  const runs = [];
  lines.forEach((line, i) => {
    const hard = line.endsWith("  ");
    runs.push(...inline(line.trim() + (hard || i === lines.length - 1 ? "" : " "), base));
    if (hard && i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
  });
  return runs;
};

// ---------------------------------------------------------------- blocks
const codeBlock = (lines) => lines.map((line, i) => new Paragraph({
  spacing: { after: i === lines.length - 1 ? 120 : 0 },
  keepNext: i < lines.length - 1, keepLines: true,
  shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
  children: [new TextRun({ text: line.replace(/\t/g, "    ") || " ", font: MONO, size: 17 })],
}));

const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const table = (lines) => {
  const header = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow);
  // Column widths follow content length, clamped so no column collapses
  // below its longest word (avoids mid-word wrapping like "Ataca-nte").
  const cells = (i) => [header[i], ...rows.map((r) => r[i] || "")].map((c) => c.replace(/[*`]/g, ""));
  const CHAR = 115, PAD = 260; // approx. DXA per 10pt character, cell margins
  const minW = header.map((_, i) => Math.max(...cells(i).flatMap((c) => c.split(/\s+/).map((x) => x.length))) * CHAR + PAD);
  const want = header.map((_, i) => Math.min(Math.max(...cells(i).map((c) => c.length)), 60));
  const total = want.reduce((a, b) => a + b, 0);
  let widths = want.map((x, i) => Math.max(Math.floor((PAGE_W * x) / total), minW[i]));
  // Give back the overflow from columns that have room above their minimum.
  const over = widths.reduce((a, b) => a + b, 0) - PAGE_W;
  if (over > 0) {
    const slack = widths.map((x, i) => x - minW[i]);
    const room = slack.reduce((a, b) => a + b, 0);
    widths = widths.map((x, i) => x - Math.floor((over * slack[i]) / room));
  }
  widths[0] += PAGE_W - widths.reduce((a, b) => a + b, 0);
  // Short tables stay on one page: every row but the last keeps with the next.
  const together = rows.length <= 15;
  const cell = (text, bold, fill, i, keep) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ keepNext: keep, children: inline(text, { bold, size: 20 }) })],
  });
  return [
    new Table({
      columnWidths: widths,
      width: { size: PAGE_W, type: WidthType.DXA },
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: header.map((x, i) => cell(x, true, "E8E8E8", i, true)) }),
        ...rows.map((r, n) => new TableRow({ cantSplit: true,
          children: header.map((_, i) => cell(r[i] || "", false, null, i, together && n < rows.length - 1)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
};

let listInstance = 0;
const list = (items, ordered) => {
  listInstance += 1;
  return items.map((item, n) => new Paragraph({
    spacing: { after: n === items.length - 1 ? 160 : 60 },
    numbering: { reference: ordered ? "numbers" : "bullets", level: 0, instance: listInstance },
    children: inline(item),
  }));
};

const HEADINGS = { 1: HeadingLevel.TITLE, 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2, 4: HeadingLevel.HEADING_3 };

const markdown = (src) => {
  const out = [];
  const lines = String(src).split("\n");
  let i = 0;
  const take = (pred) => { const acc = []; while (i < lines.length && pred(lines[i])) acc.push(lines[i++]); return acc; };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      i++;
      const code = take((l) => !l.startsWith("```"));
      i++;
      out.push(...codeBlock(code));
    } else if (/^#{1,4} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const title = line.replace(/^#+ /, "");
      out.push(...flushShots(), new Paragraph({ heading: HEADINGS[level], children: inline(title) }));
      currentSection = plain(title);
      i++;
    } else if (line.startsWith("|")) {
      out.push(...table(take((l) => l.startsWith("|"))));
    } else if (line.startsWith(">")) {
      const quote = take((l) => l.startsWith(">")).map((l) => l.replace(/^> ?/, ""));
      out.push(new Paragraph({
        spacing: { before: 60, after: 120 }, indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "AAAAAA", space: 8 } },
        children: inlineLines(quote, { color: "444444" }),
      }));
    } else if (/^\d+\. /.test(line)) {
      out.push(...list(take((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, "")), true));
    } else if (/^- /.test(line)) {
      out.push(...list(take((l) => /^- /.test(l)).map((l) => l.slice(2)), false));
    } else {
      const para = take((l) => l.trim() && !/^(```|#{1,4} |\||>|\d+\. |- )/.test(l));
      if (para.length === 1 && /^\*Sección pendiente\.\*$/.test(para[0].trim())) {
        out.push(new Paragraph({ spacing: { after: 120 },
          children: [new TextRun({ text: "[PENDIENTE] Sección en desarrollo.", italics: true, color: "999999" })] }));
      } else {
        out.push(new Paragraph({ spacing: { after: 120 }, children: inlineLines(para) }));
      }
    }
  }
  return out;
};

const image = (b64) => {
  const data = Buffer.from(b64, "base64");
  // PNG IHDR holds width/height at bytes 16-23; scale to at most 15 cm wide.
  const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
  const width = Math.min(w, 560);
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 120 },
    children: [new ImageRun({ type: "png", data, transformation: { width, height: Math.round((h * width) / w) } })] });
};

// ---------------------------------------------------------------- terminal shots
// Kali-style captures of the academic commands (shots/capture.py records their
// literal output, shots/render.py draws them). Each one is appended at the end
// of the report section whose heading matches its `section`.
const SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, "shots", "transcript.json"), "utf8"));
const plain = (t) => t.replace(/[*`]/g, "").trim();
let currentSection = null;
let shotNumber = 0;
const placed = new Set();

function flushShots() {
  const out = [];
  for (const shot of SHOTS.filter((x) => plain(x.section) === currentSection)) {
    const data = fs.readFileSync(path.join(__dirname, "assets", `${shot.name}.png`));
    const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
    shotNumber += 1;
    placed.add(shot.name);
    out.push(new Paragraph({ spacing: { before: 160, after: 60 }, keepNext: true,
      children: [new TextRun({ text: `Captura ${shotNumber} — ${shot.caption}`, bold: true, size: 20 })] }));
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [new ImageRun({ type: "png", data, transformation: { width: 600, height: Math.round((h * 600) / w) } })] }));
  }
  return out;
}

// ---------------------------------------------------------------- build
const nb = JSON.parse(fs.readFileSync(NOTEBOOK, "utf8"));
const meta = nb.metadata.tp5;
const body = [];

body.push(new Paragraph({ spacing: { before: 1200, after: 240 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: meta.title, bold: true, size: 36 })] }));
[meta.course, meta.institution].forEach((t) =>
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: t, size: 24 })] })));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 },
  children: [new TextRun({ text: meta.student, size: 24, bold: true })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [new TextRun({ text: meta.date, size: 22 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 },
  children: [new TextRun({ text: meta.disclosure, italics: true, size: 18, color: "555555" })] }));

for (const cell of nb.cells) {
  const tags = (cell.metadata && cell.metadata.tags) || [];
  if (tags.includes("cover")) continue;
  const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source;
  if (cell.cell_type === "markdown") { body.push(...markdown(src)); continue; }
  for (const o of cell.outputs || []) {
    const data = o.data || {};
    if (data["image/png"]) body.push(image(data["image/png"]));
    else if (data["text/markdown"]) body.push(...markdown([].concat(data["text/markdown"]).join("")));
  }
}

body.push(...flushShots());
const missing = SHOTS.filter((x) => !placed.has(x.name)).map((x) => `${x.name} -> "${x.section}"`);
if (missing.length) throw new Error(`terminal shots without a matching section: ${missing.join(", ")}`);

const heading = (size) => ({
  run: { font: FONT, size, bold: true, color: "1F1F1F" },
  paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, keepLines: true },
});

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } },
      title: heading(36),
      heading1: heading(30),
      heading2: heading(25),
      heading3: heading(23),
    },
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 },
    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: body }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${path.basename(OUT)} (${buf.length} bytes)`);
});
