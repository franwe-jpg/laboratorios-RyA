// Dumps every transcript run of content.js as JSON [{name, caption, command, output}].
// Names are stable (group-sub-index) so build_docx.js can find the rendered PNGs.
const content = require("./content.js");
const out = [];
const walk = (node, path) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.runs)) node.runs.forEach((r, i) =>
    out.push({ name: [...path, i].join("-"), ...r }));
  for (const [k, v] of Object.entries(node)) if (k !== "runs") walk(v, [...path, k]);
};
for (const [k, v] of Object.entries(content)) if (k !== "meta") walk(v, [k]);
process.stdout.write(JSON.stringify(out));
