// TP2 content source. Each activity is filled in as it is completed.
// `null` marks a section still pending. The build script renders only
// what exists, so the document is always a truthful snapshot of progress.

module.exports = {
  meta: {
    title: "Trabajo Práctico 2 — Seguridad Física",
    course: "Auditoría y Seguridad de Sistemas · ARyS · IF046",
    institution: "UNPSJB — Sede Trelew",
    student: "Soler, Franco Martín",
    date: "Septiembre 2026",
  },

  // ---- Parte A: relevamiento de un entorno (analysis, owner-authored) ----
  parteA: {
    layers: null,        // { description, missingLayer }
    controls: null,      // [{ control, type }]  (10 items, disuasivo/preventivo/detectivo/correctivo/compensatorio)
    threats: null,       // { physicalAccess, naturalDisaster, environmental }
    findings: null,      // [{ finding, note }]  (3 items; photos/sketches handled separately)
  },

  // ---- Parte B: laboratorio (executed evidence) ----
  parteB: {
    b1: null,  // LUKS: { intro, runs: [{caption, command, output}], answer }
    b2: null,  // USBGuard
    b3: null,  // UPS / theoretical
  },

  // ---- Parte C: plan de mejora priorizado (analysis, owner-authored) ----
  parteC: {
    riskTable: null,     // [{ finding, threat, impact, likelihood, control, type, priority }]
    frameworkNote: null, // string: ISO 27001 Anexo A / NIST 800-53 mapping
    conclusion: null,    // string
  },
};
