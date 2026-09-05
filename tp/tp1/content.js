// TP1 content source. Each activity is filled in as it is completed.
// `null` marks a section still pending. The build script renders only
// what exists, so the document is always a truthful snapshot of progress.

module.exports = {
  meta: {
    title: "Trabajo Práctico 1 — Conceptos de Seguridad",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "TODO: Apellido, Nombre",
    date: "2026",
  },

  // ---- Parte A: inventario y tríada CIA (analysis, owner-authored) ----
  parteA: {
    assets: null,        // [{ asset, pillar, justification }]
    riskAnalysis: null,  // { asset, threat, vulnerability, impact, likelihood, rationale }
  },

  // ---- Parte B: laboratorio (executed evidence) ----
  parteB: {
    b1: null,  // { intro, runs: [{caption, command, output}], answer }
    b2: null,
    b3: null,
    b4: null,
  },

  // ---- Parte C: del riesgo al control (analysis, owner-authored) ----
  parteC: {
    controls: null,      // [{ control, type, pillar, rationale }]
    justification: null, // string
  },
};
