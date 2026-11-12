/* Daily Edge, site de révision statique (sans serveur, sans IA). Le contenu vient de data.js (window.DATA), exporté
   depuis l'appli ; la progression vit dans le navigateur (localStorage) et s'exporte ou s'importe pour passer d'un
   appareil à l'autre. Routes : #/ · #/section/<id> · #/fiche/<id> · #/quiz[/<topic>] · #/cartes · #/examen · #/progression */
"use strict";

const D = window.DATA;
const KEY = "de." + D.cert.id + ".v1";
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 86400000;
const BOXES = [1, 3, 7, 16, 35, 90];          // jours avant le retour d'une carte, par boîte (Leitner)
const TOPICS = {}, SECTION_OF = {}, QUESTIONS = {};
D.sections.forEach((s) => s.topics.forEach((t) => { TOPICS[t.id] = t; SECTION_OF[t.id] = s; t.questions.forEach((q) => (QUESTIONS[q.id] = { ...q, topic: t.id })); }));

/* ------------------------------------------------------------------ progression (localStorage) */
function load() {
  try { return { read: {}, hist: [], cards: {}, exams: [], ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { read: {}, hist: [], cards: {}, exams: [] }; }
}
let P = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch {} }

function topicStats(tid) {
  const h = P.hist.filter((x) => x.topic === tid).slice(-10);
  return { n: h.length, ok: h.filter((x) => x.ok).length, acc: h.length ? h.filter((x) => x.ok).length / h.length : null };
}
function sectionStats(s) {
  const h = P.hist.filter((x) => SECTION_OF[x.topic]?.id === s.id).slice(-30);
  const read = s.topics.filter((t) => P.read[t.id]).length;
  return { n: h.length, acc: h.length ? h.filter((x) => x.ok).length / h.length : null, read };
}
function readiness() {
  let w = 0, sum = 0, cov = 0;
  D.sections.forEach((s) => { const st = sectionStats(s); if (st.n >= 3) { sum += s.weight * st.acc; w += s.weight; cov += s.weight; } });
  const total = D.sections.reduce((a, s) => a + s.weight, 0);
  return { score: w ? Math.round((100 * sum) / w) : null, coverage: Math.round((100 * cov) / total) };
}
function nextTopic() {
  // la fiche non lue de la section la plus lourde et la moins avancée ; sinon le sujet le plus fragile
  const sections = [...D.sections].sort((a, b) => (sectionStats(a).read / a.topics.length - sectionStats(b).read / b.topics.length) || (b.weight - a.weight));
  for (const s of sections) { const t = s.topics.find((t) => !P.read[t.id] && t.fiche); if (t) return { t, why: "Prochaine fiche · " + s.label }; }
  const weak = Object.keys(TOPICS).map((id) => ({ id, st: topicStats(id) })).filter((x) => x.st.n >= 3).sort((a, b) => a.st.acc - b.st.acc)[0];
  return weak ? { t: TOPICS[weak.id], why: `À retravailler · ${Math.round(weak.st.acc * 100)} % de bonnes réponses`, quiz: true } : null;
}

/* ------------------------------------------------------------------ mise en forme d'une fiche */
function para(text) {
  const out = [];
  for (const p of String(text || "").split(/\n{2,}/).filter(Boolean)) {
    const sentences = p.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«(])/);
    let plain = [];
    const flush = () => { if (plain.length) { out.push(`<p>${plain.join(" ")}</p>`); plain = []; } };
    for (const s of sentences) {
      const m = s.match(/^([^:;]{2,70}?)\s:\s(.+)$/s), items = m ? m[2].split(/\s;\s/) : [];
      if (m && items.length >= 3) { flush(); out.push(`<p><b>${esc(m[1])}</b></p><ul>${items.map((x) => `<li>${esc(x.replace(/[.;]\s*$/, ""))}</li>`).join("")}</ul>`); }
      else plain.push(esc(s));
    }
    flush();
  }
  return out.join("");
}
const list = (xs, tag = "ul") => xs?.length ? `<${tag}>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</${tag}>` : "";

/* ------------------------------------------------------------------ écrans */
function ring(score, pass) {
  const R = 26, C = 2 * Math.PI * R, v = Math.max(0, Math.min(100, score ?? 0)) / 100, a = (pass / 100) * 2 * Math.PI;
  const p = (r) => [32 + Math.cos(a) * r, 32 + Math.sin(a) * r].map((x) => x.toFixed(1));
  const [x1, y1] = p(R - 6), [x2, y2] = p(R + 6);
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="trk" cx="32" cy="32" r="${R}" fill="none" stroke-width="7"/>
    <circle class="val" cx="32" cy="32" r="${R}" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}"/>
    <line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="2"/></svg>`;
}
function dueCards() { const now = Date.now(); return allCards().filter((c) => P.read[c.topic] && (P.cards[c.id]?.due ?? 0) <= now); }
function allCards() { const out = []; Object.values(TOPICS).forEach((t) => (t.fiche?.cards || []).forEach((c, i) => out.push({ id: `${t.id}#${i}`, topic: t.id, q: c.q, a: c.a }))); return out; }

function home() {
  const r = readiness(), nx = nextTopic(), due = dueCards().length;
  const nq = Object.keys(QUESTIONS).length, read = Object.keys(P.read).length;
  app.innerHTML = `
    <header><p class="muted">Certification Salesforce</p><h1>${esc(D.cert.label)}</h1>
      <p class="muted num">${D.cert.questions} questions · ${D.cert.minutes} min · réussite à ${D.cert.pass_pct} % · ${Object.keys(TOPICS).length} sujets, ${nq} questions d'entraînement</p></header>
    <div class="grid2">
      <div>${nx ? `<a class="card hi" style="display:block;text-decoration:none" href="#/${nx.quiz ? "quiz/" : "fiche/"}${nx.t.id}">
          <span class="muted">${esc(nx.why)}</span><div class="next-t">${esc(nx.t.title)}</div>
          <span class="btn primary">${nx.quiz ? "5 questions ciblées" : "Lire la fiche, puis 5 questions"}</span></a>`
        : `<div class="card hi"><div class="next-t">Tout est lu</div><a class="btn primary" href="#/examen">Passer un examen blanc</a></div>`}</div>
      <div class="list">
        <div class="row ring">${ring(r.score, D.cert.pass_pct)}<b>${r.score == null ? "Score estimé : après quelques questions" : `Score estimé ${r.score} % · seuil ${D.cert.pass_pct} %`}</b>
          <small>${r.score == null ? "réponds à des questions dans deux ou trois parties" : `${r.score >= D.cert.pass_pct ? "au-dessus du seuil" : `il manque ${D.cert.pass_pct - r.score} points`} · ${r.coverage} % du programme couvert`}</small></div>
        <a class="row" href="#/quiz"><b>Quiz mélangé</b><span class="r">10</span><small>sur les fiches lues, les sujets fragiles d'abord</small></a>
        <a class="row" href="#/cartes"><b>${due ? `${due} carte${due > 1 ? "s" : ""} à réviser` : "Rien à réviser aujourd'hui"}</b><span class="r">${due}</span><small>les cartes reviennent après chaque fiche lue</small></a>
        <a class="row" href="#/examen"><b>Examen blanc</b><span class="r">60</span><small>60 questions, 105 minutes, poids officiels</small></a>
      </div>
    </div>
    <section><h2>Le programme de l'examen <span class="muted num" style="font-weight:400;font-size:.9rem">${read} / ${Object.keys(TOPICS).length} fiches lues</span></h2>
      <div class="list">${D.sections.map((s) => { const st = sectionStats(s); return `<a class="row" href="#/section/${s.id}">
        <b>${esc(s.label)}</b><span class="r">${s.weight} %${st.acc != null ? ` · ${Math.round(st.acc * 100)} % justes` : ""}</span>
        <small>${st.read} / ${s.topics.length} fiches lues</small><span class="bar"><i style="width:${(100 * st.read) / s.topics.length}%"></i></span></a>`; }).join("")}</div></section>`;
}

function section(id) {
  const s = D.sections.find((x) => x.id === id); if (!s) return home();
  app.innerHTML = `<div class="narrow"><p><a class="muted" href="#/">&larr; Le programme</a></p><h1>${esc(s.label)}</h1><p class="muted">${s.weight} % de l'examen</p>
    <div class="list">${s.topics.map((t) => { const st = topicStats(t.id); return `<a class="row" href="#/fiche/${t.id}"><b>${esc(t.title)}</b>
      <span class="r">${P.read[t.id] ? "lue" : "à lire"}${st.n ? ` · ${st.ok}/${st.n}` : ""}</span><small>${t.questions.length} questions d'entraînement</small></a>`; }).join("")}</div></div>`;
}

function fiche(id) {
  const t = TOPICS[id], f = t?.fiche; if (!t) return home();
  if (!f) { app.innerHTML = `<div class="narrow card"><h1>${esc(t.title)}</h1><p class="muted">Cette fiche n'a pas encore été rédigée.</p><a class="btn primary" href="#/quiz/${id}">Faire les questions</a></div>`; return; }
  const s = SECTION_OF[id];
  app.innerHTML = `<article class="narrow">
    <div class="f-bar"><a href="#/section/${s.id}">&larr; ${esc(s.label)}</a></div>
    <h1>${esc(t.title)}</h1><p class="f-one">${esc(f.one_liner)}</p>
    <div class="zone">Comprendre</div>
    <div class="f-sec">
      ${f.prime ? `<div class="f-box soft"><h2>Before you read, try this</h2><p>${esc(f.prime)}</p></div>` : ""}
      <h2>Why it matters</h2>${para(f.need)}
      ${f.analogy ? `<div class="f-box"><h2>The mental picture</h2><p>${esc(f.analogy)}</p></div>` : ""}
      <h2>Understand</h2>${para(f.core)}
      ${f.worked?.length ? `<h2>Worked example</h2>${list(f.worked, "ol")}` : ""}
      ${f.contrast ? `<div class="f-two"><div class="f-box"><h2>Applies</h2><p>${esc(f.contrast.applies)}</p></div><div class="f-box"><h2>Does not apply</h2><p>${esc(f.contrast.does_not)}</p></div></div>` : ""}
    </div>
    <div class="zone">Pour l'examen</div>
    <div class="f-sec">
      ${f.remember?.length ? `<h2>The things to remember</h2><ol>${f.remember.map((x) => x.q ? `<li><details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p>${x.why ? `<p class="muted">Why: ${esc(x.why)}</p>` : ""}</details></li>` : `<li>${esc(x.a)}</li>`).join("")}</ol>` : ""}
      <h2>Exam traps</h2>${list(f.traps)}
      ${f.setup?.length ? `<h2>Where it is configured</h2>${list(f.setup, "ol")}` : ""}
      ${f.compare?.length ? `<h2>Do not confuse</h2>${f.compare.map((c) => `<div class="f-box"><p><b>${esc(c.a)}</b> or <b>${esc(c.b)}</b></p><p>${esc(c.diff)}</p></div>`).join("")}` : ""}
      ${f.signals?.length ? `<h2>If the scenario says… think of…</h2><ul>${f.signals.map((x) => `<li>${esc(x.if)} → <b>${esc(x.then)}</b></li>`).join("")}</ul>` : ""}
      ${f.scenario?.situation ? `<div class="f-box"><h2>An exam-style case</h2><p>${esc(f.scenario.situation)}</p><details><summary>Answer in mind? See the solution</summary><p>${esc(f.scenario.answer)}</p></details></div>` : ""}
    </div>
    <div class="actions" style="margin-top:24px"><button class="btn primary" id="done">Fiche lue · ${t.questions.length ? "5 questions" : "terminer"}</button><a class="btn" href="#/section/${s.id}">Plus tard</a></div>
  </article>`;
  window.scrollTo(0, 0);
  $("#done").onclick = () => { P.read[id] = Date.now(); (f.cards || []).forEach((c, i) => { const k = `${id}#${i}`; P.cards[k] ??= { box: 0, due: Date.now() + DAY }; }); save(); location.hash = t.questions.length ? `#/quiz/${id}` : "#/"; };
}

/* ------------------------------------------------------------------ quiz et examen */
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let Q = null;
function pickMixed(n) {
  const pool = Object.values(QUESTIONS).filter((q) => P.read[q.topic]);
  const src = pool.length >= n ? pool : Object.values(QUESTIONS);
  const lastOk = {}; P.hist.forEach((h) => (lastOk[h.qid] = h.ok));
  return shuffle(src).sort((a, b) => (topicStats(a.topic).acc ?? 0) - (topicStats(b.topic).acc ?? 0) + ((lastOk[a.id] === true) - (lastOk[b.id] === true))).slice(0, n);
}
function pickExam(n) {
  const total = D.sections.reduce((a, s) => a + s.weight, 0), out = [];
  D.sections.forEach((s) => { const k = Math.round((n * s.weight) / total); out.push(...shuffle(s.topics.flatMap((t) => t.questions.map((q) => QUESTIONS[q.id]))).slice(0, k)); });
  return shuffle(out).slice(0, n);
}
function startQuiz(kind, topic) {
  const qs = kind === "exam" ? pickExam(60) : topic ? shuffle(TOPICS[topic].questions.map((q) => QUESTIONS[q.id])).slice(0, 5) : pickMixed(10);
  if (!qs.length) { app.innerHTML = `<div class="narrow card"><p>Pas encore de questions ici.</p><a class="btn" href="#/">Retour</a></div>`; return; }
  Q = { kind, topic, qs, i: 0, sel: new Set(), shown: false, res: [], t0: Date.now(), end: kind === "exam" ? Date.now() + D.cert.minutes * 60000 : null };
  renderQ();
}
function renderQ() {
  const q = Q.qs[Q.i]; if (!q) return finish();
  const need = q.correct.length, exam = Q.kind === "exam";
  app.innerHTML = `<div class="narrow card">
    <div class="q-top"><a class="muted" href="#/" id="quit">&larr; Arrêter</a>${exam ? `<span class="timer" id="timer"></span>` : ""}<span class="muted num">${Q.i + 1} / ${Q.qs.length}</span></div>
    ${exam ? "" : `<div class="dots" style="margin-top:10px">${Q.qs.map((_, k) => `<i class="${k < Q.i ? (Q.res[k]?.ok ? "ok" : "ko") : k === Q.i ? "cur" : ""}"></i>`).join("")}</div>`}
    <p class="muted" style="margin:12px 0 0">${esc(TOPICS[q.topic].title)}</p>
    <div class="q-stem">${esc(q.stem)}</div>
    ${need > 1 ? `<p class="q-choose">Choose ${need} answers.</p>` : ""}
    <div class="opts">${q.options.map((o, k) => {
      const cls = Q.shown ? (q.correct.includes(k) ? "right" : Q.sel.has(k) ? "wrong" : "") : Q.sel.has(k) ? "sel" : "";
      return `<button class="opt ${cls}" data-k="${k}" ${Q.shown ? "disabled" : ""}><span class="k">${"ABCDEF"[k]}</span><span>${esc(o)}</span>${Q.shown && (q.correct.includes(k) || Q.sel.has(k)) ? `<span class="why">${esc(q.explanations[k])}</span>` : ""}</button>`;
    }).join("")}</div>
    ${Q.shown ? `<div class="verdict ${Q.res[Q.i].ok ? "ok" : "ko"}"><b>${Q.res[Q.i].ok ? "Correct." : "Incorrect."}</b> ${esc(q.takeaway || "")}</div>` : ""}
    <div class="actions" style="margin-top:16px">${Q.shown || exam ? `<button class="btn primary" id="next" ${!exam || Q.sel.size ? "" : ""}>${Q.i + 1 < Q.qs.length ? "Question suivante" : exam ? "Terminer l'examen" : "Voir le bilan"}</button>`
      : `<button class="btn primary" id="check" ${Q.sel.size === need ? "" : "disabled"}>Valider</button>`}</div></div>`;
  app.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
    const k = +b.dataset.k;
    if (need === 1) Q.sel = new Set([k]); else Q.sel.has(k) ? Q.sel.delete(k) : Q.sel.size < need && Q.sel.add(k);
    renderQ();
  }));
  $("#check")?.addEventListener("click", () => { record(q); Q.shown = true; renderQ(); });
  $("#next")?.addEventListener("click", () => { if (exam) record(q); Q.i += 1; Q.sel = new Set(); Q.shown = false; renderQ(); });
  if (exam) tick();
  window.scrollTo(0, 0);
}
function record(q) {
  const ok = Q.sel.size === q.correct.length && q.correct.every((k) => Q.sel.has(k));
  Q.res[Q.i] = { q, ok, sel: [...Q.sel] };
  P.hist.push({ qid: q.id, topic: q.topic, ok, at: Date.now(), exam: Q.kind === "exam" || undefined });
  if (P.hist.length > 5000) P.hist = P.hist.slice(-5000);
  save();
}
let timerId = null;
function tick() {
  clearInterval(timerId);
  const el = $("#timer"); if (!el) return;
  const upd = () => { const left = Math.max(0, Q.end - Date.now()); el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`; el.classList.toggle("low", left < 300000); if (!left) { clearInterval(timerId); finish(); } };
  upd(); timerId = setInterval(upd, 1000);
}
function finish() {
  clearInterval(timerId);
  const done = Q.res.filter(Boolean), ok = done.filter((x) => x.ok).length, n = Q.qs.length, pct = Math.round((100 * ok) / n);
  if (Q.kind === "exam") {
    const by = D.sections.map((s) => { const r = done.filter((x) => SECTION_OF[x.q.topic].id === s.id); const tot = Q.qs.filter((q) => SECTION_OF[q.topic].id === s.id).length; return { s, ok: r.filter((x) => x.ok).length, tot }; });
    P.exams.push({ at: Date.now(), pct, by: by.map((b) => ({ id: b.s.id, ok: b.ok, tot: b.tot })), minutes: Math.round((Date.now() - Q.t0) / 60000) }); save();
    app.innerHTML = `<div class="narrow"><div class="card"><p class="muted">Examen blanc · ${Math.round((Date.now() - Q.t0) / 60000)} min</p>
      <div class="score ${pct >= D.cert.pass_pct ? "pass" : "fail"}">${pct} %</div><p>${ok} / ${n} justes · seuil ${D.cert.pass_pct} % · ${pct >= D.cert.pass_pct ? "réussi" : `il manque ${Math.ceil((D.cert.pass_pct * n) / 100) - ok} bonnes réponses`}</p></div>
      <h2 style="margin-top:20px">Par partie</h2><div class="list">${by.map((b) => `<div class="row"><b>${esc(b.s.label)}</b><span class="r">${b.tot ? Math.round((100 * b.ok) / b.tot) : "·"} %</span><small>${b.ok} / ${b.tot} · ${b.s.weight} % de l'examen</small><span class="bar"><i style="width:${b.tot ? (100 * b.ok) / b.tot : 0}%"></i></span></div>`).join("")}</div>
      ${reviewList(done.filter((x) => !x.ok))}
      <div class="actions" style="margin-top:20px"><a class="btn primary" href="#/">Retour au cours</a></div></div>`;
  } else {
    app.innerHTML = `<div class="narrow"><div class="card"><p class="muted">Bilan</p><div class="score">${ok} / ${n}</div>
      <p>${ok === n ? "Tout juste. Passe à la fiche suivante." : "Relis les explications des erreurs ci-dessous : c'est là que tu apprends."}</p></div>
      ${reviewList(done.filter((x) => !x.ok))}
      <div class="actions" style="margin-top:20px"><a class="btn primary" href="#/">Retour au cours</a>${Q.topic ? `<a class="btn" href="#/fiche/${Q.topic}">Relire la fiche</a>` : `<a class="btn" href="#/quiz">Un autre quiz</a>`}</div></div>`;
  }
  window.scrollTo(0, 0);
}
function reviewList(wrong) {
  if (!wrong.length) return "";
  return `<h2 style="margin-top:20px">À revoir</h2><div class="list">${wrong.map((x) => `<details class="row" style="display:block"><summary>${esc(x.q.stem.slice(0, 140))}${x.q.stem.length > 140 ? "…" : ""}</summary>
    <p><b>Answer:</b> ${x.q.correct.map((k) => esc(x.q.options[k])).join(" · ")}</p><p class="muted">${esc(x.q.correct.map((k) => x.q.explanations[k]).join(" "))}</p><p>${esc(x.q.takeaway || "")}</p></details>`).join("")}</div>`;
}

/* ------------------------------------------------------------------ cartes (Leitner) */
let C = null;
function cards() {
  const due = shuffle(dueCards());
  if (!due.length) { app.innerHTML = `<div class="narrow card"><h1>Rien à réviser aujourd'hui</h1><p class="muted">Les cartes d'une fiche arrivent le lendemain de sa lecture, puis reviennent à 1, 3, 7, 16, 35 et 90 jours.</p><a class="btn" href="#/">Retour</a></div>`; return; }
  C = { due, i: 0, shown: false, ok: 0 }; renderCard();
}
function renderCard() {
  const c = C.due[C.i];
  if (!c) { app.innerHTML = `<div class="narrow card"><h1>Révision terminée</h1><p>${C.ok} / ${C.due.length} sues.</p><a class="btn primary" href="#/">Retour</a></div>`; return; }
  app.innerHTML = `<div class="narrow card"><div class="q-top"><a class="muted" href="#/">&larr; Arrêter</a><span class="muted num">${C.i + 1} / ${C.due.length}</span></div>
    <p class="muted" style="margin-top:12px">${esc(TOPICS[c.topic].title)}</p><div class="q-stem">${esc(c.q)}</div>
    ${C.shown ? `<div class="verdict">${esc(c.a)}</div><div class="actions" style="margin-top:16px"><button class="btn primary" id="knew">Je savais</button><button class="btn" id="again">À revoir</button></div>`
      : `<div class="actions"><button class="btn primary" id="show">Voir la réponse</button></div>`}</div>`;
  $("#show")?.addEventListener("click", () => { C.shown = true; renderCard(); });
  const answer = (ok) => { const st = P.cards[c.id] || { box: 0 }; st.box = ok ? Math.min(BOXES.length - 1, st.box + 1) : 0; st.due = Date.now() + BOXES[st.box] * DAY; P.cards[c.id] = st; save(); C.ok += ok; C.i += 1; C.shown = false; renderCard(); };
  $("#knew")?.addEventListener("click", () => answer(true)); $("#again")?.addEventListener("click", () => answer(false));
}

/* ------------------------------------------------------------------ progression : bilan, export, import */
function progression() {
  const r = readiness(), n = P.hist.length, ok = P.hist.filter((x) => x.ok).length;
  app.innerHTML = `<div class="narrow"><h1>Ta progression</h1>
    <div class="list"><div class="row"><b>Score estimé</b><span class="r">${r.score ?? "·"} %</span><small>${r.coverage} % du programme couvert</small></div>
      <div class="row"><b>Questions répondues</b><span class="r">${n}</span><small>${n ? Math.round((100 * ok) / n) : 0} % de bonnes réponses</small></div>
      <div class="row"><b>Fiches lues</b><span class="r">${Object.keys(P.read).length} / ${Object.keys(TOPICS).length}</span><small>cartes en révision : ${Object.keys(P.cards).length}</small></div>
      ${P.exams.slice(-5).reverse().map((e) => `<div class="row"><b>Examen blanc du ${new Date(e.at).toLocaleDateString("fr-FR")}</b><span class="r ${e.pct >= D.cert.pass_pct ? "pass" : "fail"}">${e.pct} %</span><small>${e.minutes} min</small></div>`).join("")}</div>
    <h2 style="margin-top:24px">Passer d'un appareil à l'autre</h2>
    <p class="hint">Ta progression est enregistrée dans ce navigateur seulement. Pour la reprendre ailleurs (PC du travail, téléphone), copie le code ci-dessous et colle-le sur l'autre appareil.</p>
    <div class="actions" style="margin:10px 0"><button class="btn" id="exp">Copier ma progression</button><button class="btn" id="imp">Importer</button><button class="btn" id="reset">Tout effacer</button></div>
    <textarea class="io" id="io" placeholder="Colle ici un code de progression, puis « Importer »"></textarea>
    <p class="hint" style="margin-top:8px">Contenu exporté le ${esc(D.built)} depuis Daily Edge.</p></div>`;
  $("#exp").onclick = async () => { const s = btoa(unescape(encodeURIComponent(JSON.stringify(P)))); $("#io").value = s; try { await navigator.clipboard.writeText(s); $("#exp").textContent = "Copié"; } catch { $("#io").select(); } };
  $("#imp").onclick = () => { try { const o = JSON.parse(decodeURIComponent(escape(atob($("#io").value.trim())))); P = { ...load(), ...o }; save(); progression(); } catch { alert("Code illisible."); } };
  $("#reset").onclick = () => { if (confirm("Effacer toute ta progression sur cet appareil ?")) { P = { read: {}, hist: [], cards: {}, exams: [] }; save(); progression(); } };
}

/* ------------------------------------------------------------------ routeur et thème */
function route() {
  clearInterval(timerId);
  const [, page, id] = (location.hash.replace(/^#\/?/, "/").split("/"));
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === (page || "home") || (!page && a.dataset.nav === "home") || (["section", "fiche"].includes(page) && a.dataset.nav === "home")));
  if (page === "section") return section(id);
  if (page === "fiche") return fiche(id);
  if (page === "quiz") return startQuiz("quiz", id);
  if (page === "examen") return examIntro();
  if (page === "cartes") return cards();
  if (page === "progression") return progression();
  home();
}
function examIntro() {
  const last = P.exams.at(-1);
  app.innerHTML = `<div class="narrow card"><h1>Examen blanc</h1><p>${Math.min(60, Object.keys(QUESTIONS).length)} questions tirées selon les poids officiels, ${D.cert.minutes} minutes, sans correction avant la fin. Seuil : ${D.cert.pass_pct} %.</p>
    ${last ? `<p class="muted">Dernier essai : ${last.pct} % le ${new Date(last.at).toLocaleDateString("fr-FR")}.</p>` : ""}
    <div class="actions"><button class="btn primary" id="go">Commencer</button><a class="btn" href="#/">Plus tard</a></div></div>`;
  $("#go").onclick = () => startQuiz("exam");
}
const THEMES = ["auto", "light", "dark"], TL = { auto: "Thème : auto", light: "Thème : jour", dark: "Thème : nuit" };
function theme(t) { if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; $("#theme").textContent = TL[t]; try { localStorage.setItem("de.theme", t); } catch {} }
$("#theme").onclick = () => { let cur = "auto"; try { cur = localStorage.getItem("de.theme") || "auto"; } catch {} theme(THEMES[(THEMES.indexOf(cur) + 1) % 3]); };
try { theme(localStorage.getItem("de.theme") || "auto"); } catch { theme("auto"); }
window.addEventListener("hashchange", route);
route();
