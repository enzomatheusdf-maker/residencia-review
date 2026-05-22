'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — FSRS ENGINE  ◄ READ-ONLY BLACKBOX — NUNCA ALTERAR OS PESOS
// ═══════════════════════════════════════════════════════════════════════════════

const DECAY  = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81 ≈ 0.23457
const MAX_DAYS = 120;

const W = [
  0.40255, 1.18385, 3.1262,  15.4722,
  7.2102,  0.5316,  1.0651,  0.06069,
  0.9124,  0.1542,  1.0,     1.9395,
  0.11,    0.29605, 2.2698,  0.10548, 2.9898,
];

function confidenceFactor(Q) { return 1 - Math.exp(-Q / 10); }

function deriveRating(Q, acertos) {
  if (Q < 1)                      throw new Error('Q deve ser >= 1');
  if (acertos < 0 || acertos > Q) throw new Error('Acertos fora do intervalo [0, Q]');
  const A = acertos / Q, C = confidenceFactor(Q), E = A * C + 0.5 * (1 - C);
  let rating, label;
  if      (E < 0.60) { rating = 1; label = 'Again'; }
  else if (E < 0.75) { rating = 2; label = 'Hard';  }
  else if (E < 0.90) { rating = 3; label = 'Good';  }
  else               { rating = 4; label = 'Easy';  }
  return { rating, label, E: +E.toFixed(3), C: +C.toFixed(3), A: +A.toFixed(3) };
}

function targetRetention(relevance) {
  return 0.85 + (Math.max(1, Math.min(5, Math.round(relevance))) - 1) * 0.025;
}

function retrievability(daysSince, S) {
  if (!S || daysSince <= 0) return 1.0;
  return Math.pow(1 + FACTOR * daysSince / S, DECAY);
}

function nextIntervalDays(S, R_target) {
  return Math.min(MAX_DAYS, Math.max(1, Math.round((S / FACTOR) * (Math.pow(R_target, 1 / DECAY) - 1))));
}

function initialDifficulty(rating) {
  return Math.max(1, Math.min(10, W[4] - Math.exp(W[5] * (rating - 1)) + 1));
}

function updateDifficulty(D, rating) {
  const D_easy = initialDifficulty(4);
  const D_lin  = D - W[6] * (rating - 3) * (10 - D) / 9;
  return Math.max(1, Math.min(10, W[7] * D_easy + (1 - W[7]) * D_lin));
}

function stabilityAfterRecall(D, S, R, rating) {
  return Math.max(S * (
    Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
    (Math.exp(W[10] * (1 - R)) - 1) + 1
  ) * (rating === 2 ? W[15] : 1) * (rating === 4 ? W[16] : 1), S);
}

function stabilityAfterLapse(D, S, R) {
  return Math.max(0.1,
    W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R))
  );
}

function scheduleReview(topic, Q, acertos) {
  const { rating, label, E, C, A } = deriveRating(Q, acertos);
  const R_target = targetRetention(topic.relevance ?? 3);
  let D, S, R;
  if (topic.S == null || topic.D == null) {
    S = W[rating - 1]; D = initialDifficulty(rating); R = 1.0;
  } else {
    const days = Math.max(0, (Date.now() - new Date(topic.lastReview).getTime()) / 86_400_000);
    R = retrievability(days, topic.S);
    D = updateDifficulty(topic.D, rating);
    S = rating === 1 ? stabilityAfterLapse(topic.D, topic.S, R) : stabilityAfterRecall(topic.D, topic.S, R, rating);
  }
  const interval       = nextIntervalDays(S, R_target);
  const nextReviewDate = new Date(Date.now() + interval * 86_400_000);
  return { D: +D.toFixed(4), S: +S.toFixed(4), R: +R.toFixed(4), E, A, C, rating, label, interval, R_target: +R_target.toFixed(3), nextReviewDate };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — REFERENCE DATA
// ═══════════════════════════════════════════════════════════════════════════════

const SPECIALTIES = [
  { value: 'cardiologia',       label: 'Cardiologia',           area: 'Clínica Médica' },
  { value: 'pneumologia',       label: 'Pneumologia',           area: 'Clínica Médica' },
  { value: 'gastroenterologia', label: 'Gastroenterologia',     area: 'Clínica Médica' },
  { value: 'nefrologia',        label: 'Nefrologia',            area: 'Clínica Médica' },
  { value: 'endocrinologia',    label: 'Endocrinologia',        area: 'Clínica Médica' },
  { value: 'neurologia',        label: 'Neurologia',            area: 'Clínica Médica' },
  { value: 'reumatologia',      label: 'Reumatologia',          area: 'Clínica Médica' },
  { value: 'hematologia',       label: 'Hematologia',           area: 'Clínica Médica' },
  { value: 'infectologia',      label: 'Infectologia',          area: 'Clínica Médica' },
  { value: 'dermatologia',      label: 'Dermatologia',          area: 'Clínica Médica' },
  { value: 'oncologia',         label: 'Oncologia',             area: 'Clínica Médica' },
  { value: 'geriatria',         label: 'Geriatria',             area: 'Clínica Médica' },
  { value: 'cirurgia-geral',    label: 'Cirurgia Geral',        area: 'Cirurgia' },
  { value: 'cirurgia-ped',      label: 'Cirurgia Pediátrica',   area: 'Cirurgia' },
  { value: 'cirurgia-vasc',     label: 'Cirurgia Vascular',     area: 'Cirurgia' },
  { value: 'ortopedia',         label: 'Ortopedia e Trauma',    area: 'Cirurgia' },
  { value: 'urologia',          label: 'Urologia',              area: 'Cirurgia' },
  { value: 'neurocirurgia',     label: 'Neurocirurgia',         area: 'Cirurgia' },
  { value: 'pediatria',         label: 'Pediatria Geral',       area: 'Pediatria' },
  { value: 'neonatologia',      label: 'Neonatologia',          area: 'Pediatria' },
  { value: 'ginecologia',       label: 'Ginecologia',           area: 'GO' },
  { value: 'obstetricia',       label: 'Obstetrícia',           area: 'GO' },
  { value: 'psiquiatria',       label: 'Psiquiatria',           area: 'Saúde Mental' },
  { value: 'emergencia',        label: 'Med. de Emergência',    area: 'Emergência' },
  { value: 'uti',               label: 'UTI / Intensivismo',    area: 'Emergência' },
  { value: 'anestesiologia',    label: 'Anestesiologia',        area: 'Emergência' },
  { value: 'saude-publica',     label: 'Saúde Pública',         area: 'Medicina Preventiva' },
  { value: 'epidemiologia',     label: 'Epidemiologia',         area: 'Medicina Preventiva' },
  { value: 'mfc',               label: 'Med. de Família',       area: 'Medicina Preventiva' },
  { value: 'radiologia',        label: 'Radiologia / Imagem',   area: 'Diagnóstico' },
  { value: 'patologia',         label: 'Patologia',             area: 'Diagnóstico' },
  { value: 'oftalmologia',      label: 'Oftalmologia',          area: 'Outros' },
  { value: 'otorrino',          label: 'Otorrinolaringologia',  area: 'Outros' },
  { value: 'farmacologia',      label: 'Farmacologia',          area: 'Outros' },
  { value: 'bioetica',          label: 'Bioética',              area: 'Outros' },
];

const AREA_INCIDENCE = {
  'Clínica Médica':      30,
  'Cirurgia':            20,
  'Pediatria':           13,
  'GO':                  12,
  'Medicina Preventiva':  8,
  'Emergência':           7,
  'Saúde Mental':         5,
  'Diagnóstico':          3,
  'Outros':               2,
};

const AREA_COLORS = {
  'Clínica Médica':      '#4F8EF7',
  'Cirurgia':            '#FF5A65',
  'Pediatria':           '#3DDC97',
  'GO':                  '#FF72B0',
  'Saúde Mental':        '#9B72FF',
  'Emergência':          '#FF9A3C',
  'Medicina Preventiva': '#3DD6DC',
  'Diagnóstico':         '#FFD166',
  'Outros':              '#8B8FA8',
};

function getSpecialty(value) {
  return SPECIALTIES.find(s => s.value === value) ?? { value, label: value || '—', area: 'Outros' };
}

function areaColor(area) { return AREA_COLORS[area] ?? AREA_COLORS['Outros']; }

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — STORAGE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

const KEY_TOPICS    = 'medrev_v1';
const KEY_SCHEDULE  = 'medrev_schedule_v1';
const KEY_USER      = 'medrev_user_v1';
const KEY_QUESTIONS = 'medrev_questions_v1';
const KEY_SIMULADOS = 'medrev_simulados_v1';
const KEY_STREAK    = 'medrev_streak_v1';

// ── Topics ─────────────────────────────────────────────────────────────────────
function migrateTopic(t) {
  const area = t.area ?? getSpecialty(t.subcategory ?? '').area;
  return { ...t, weight: t.weight ?? 5, subcategory: t.subcategory ?? '', area: area ?? 'Outros',
    history: (t.history ?? []).map(s => ({ ...s, errorType: s.errorType ?? null })) };
}
function loadTopics() {
  try { return (JSON.parse(localStorage.getItem(KEY_TOPICS)) ?? []).map(migrateTopic); }
  catch { return []; }
}
function saveTopics(t)  { localStorage.setItem(KEY_TOPICS, JSON.stringify(t)); }
function upsertTopic(topic) {
  const topics = loadTopics(), idx = topics.findIndex(t => t.id === topic.id);
  if (idx >= 0) topics[idx] = topic; else topics.push(topic);
  saveTopics(topics); return topics;
}
function removeTopic(id) { const t = loadTopics().filter(t => t.id !== id); saveTopics(t); return t; }
function newTopic(name, relevance, weight, area, subcategory) {
  return { id: crypto.randomUUID(), name: name.trim(), relevance: Number(relevance),
    weight: Number(weight), area: area ?? '', subcategory: subcategory ?? '',
    D: null, S: null, lastReview: null, nextReview: null, reps: 0, lapses: 0, history: [] };
}

// ── Schedule ───────────────────────────────────────────────────────────────────
function loadSchedule() {
  try { return JSON.parse(localStorage.getItem(KEY_SCHEDULE)) ?? []; } catch { return []; }
}
function saveSchedule(b) { localStorage.setItem(KEY_SCHEDULE, JSON.stringify(b)); }
function addScheduleBlock(date, time, title, type, durationMin = 60) {
  const blocks = loadSchedule();
  blocks.push({ id: crypto.randomUUID(), date, time, title, type, durationMin, completed: false });
  saveSchedule(blocks); return blocks;
}
function toggleScheduleBlock(id) {
  const blocks = loadSchedule().map(b => b.id === id ? { ...b, completed: !b.completed } : b);
  saveSchedule(blocks); return blocks;
}
function removeScheduleBlock(id) {
  const blocks = loadSchedule().filter(b => b.id !== id);
  saveSchedule(blocks); return blocks;
}
function blocksForDate(blocks, dateStr) {
  return blocks.filter(b => b.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));
}

// ── User ───────────────────────────────────────────────────────────────────────
function loadUser() {
  try { return { name: '', examDate: null, dailyGoalQuestions: 50, theme: 'dark', onboarded: false,
    ...JSON.parse(localStorage.getItem(KEY_USER)) }; }
  catch { return { name: '', examDate: null, dailyGoalQuestions: 50, theme: 'dark', onboarded: false }; }
}
function saveUser(u) { localStorage.setItem(KEY_USER, JSON.stringify(u)); }

// ── Questions ─────────────────────────────────────────────────────────────────
function loadQuestions() {
  try { return JSON.parse(localStorage.getItem(KEY_QUESTIONS)) ?? []; } catch { return []; }
}
function saveQuestions(q) { localStorage.setItem(KEY_QUESTIONS, JSON.stringify(q)); }
function upsertQuestion(q) {
  const qs = loadQuestions(), idx = qs.findIndex(x => x.id === q.id);
  if (idx >= 0) qs[idx] = q; else qs.push(q);
  saveQuestions(qs); return qs;
}
function newQuestion(enunciado, options, correctIndex, area, subcategory, source, year, explanation) {
  return { id: crypto.randomUUID(), enunciado, options, correctIndex: Number(correctIndex),
    area, subcategory, source: source || '', year: year ? Number(year) : null,
    explanation: explanation || '', D: null, S: null, lastReview: null, nextReview: null,
    reps: 0, lapses: 0, relevance: 3 };
}

// ── Simulados ─────────────────────────────────────────────────────────────────
function loadSimulados() {
  try { return JSON.parse(localStorage.getItem(KEY_SIMULADOS)) ?? []; } catch { return []; }
}
function saveSimulados(s) { localStorage.setItem(KEY_SIMULADOS, JSON.stringify(s)); }
function upsertSimulado(sim) {
  const sims = loadSimulados(), idx = sims.findIndex(s => s.id === sim.id);
  if (idx >= 0) sims[idx] = sim; else sims.push(sim);
  saveSimulados(sims); return sims;
}
function newSimulado(name, questionIds, durationMinutes) {
  return { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(),
    startedAt: null, finishedAt: null, durationMinutes, questionIds,
    userAnswers: {}, status: 'pending', score: null, byArea: {}, fsrsPushed: false };
}

// ── Streak ─────────────────────────────────────────────────────────────────────
function loadStreak() {
  try { return { current: 0, longest: 0, lastActiveDate: null, history: {},
    ...JSON.parse(localStorage.getItem(KEY_STREAK)) }; }
  catch { return { current: 0, longest: 0, lastActiveDate: null, history: {} }; }
}
function saveStreak(s) { localStorage.setItem(KEY_STREAK, JSON.stringify(s)); }

// ── Export / Import ────────────────────────────────────────────────────────────
function exportData() {
  const data = { version: '3.0', exportedAt: new Date().toISOString(),
    topics: loadTopics(), schedule: loadSchedule(), user: loadUser(),
    questions: loadQuestions(), simulados: loadSimulados(), streak: loadStreak() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `medrev-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
}
function importData(file, onSuccess) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.topics || !Array.isArray(data.topics)) throw new Error('Formato inválido');
      saveTopics(data.topics);
      if (data.schedule)  saveSchedule(data.schedule);
      if (data.user)      saveUser(data.user);
      if (data.questions) saveQuestions(data.questions);
      if (data.simulados) saveSimulados(data.simulados);
      if (data.streak)    saveStreak(data.streak);
      onSuccess(); showToast('Dados importados com sucesso!');
    } catch { alert('Erro ao importar: arquivo inválido ou corrompido.'); }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — FSRS PRIORITY QUEUE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const S_MAX = 120;

function priorityScore(topic) {
  return (1 - Math.min(topic.S ?? 0, S_MAX) / S_MAX) * 0.6 + ((topic.weight ?? 5) / 10) * 0.4;
}
function isEligible(topic) {
  if (!topic.nextReview) return true;
  const today = new Date(); today.setHours(23, 59, 59, 999);
  return new Date(topic.nextReview) <= today;
}
function buildPriorityQueue(topics) {
  return topics.filter(isEligible)
    .map(t => ({ ...t, _score: +priorityScore(t).toFixed(3) }))
    .sort((a, b) => b._score - a._score);
}
function applyInterleaving(queue) {
  const result = [], remaining = [...queue];
  while (remaining.length) {
    const last2 = result.slice(-2);
    const sameSubcat = last2.length === 2 && last2[0].subcategory && last2[0].subcategory === last2[1].subcategory;
    if (sameSubcat) {
      const diffIdx = remaining.findIndex(t => t.subcategory !== last2[0].subcategory);
      if (diffIdx >= 0) { result.push(remaining.splice(diffIdx, 1)[0]); continue; }
    }
    result.push(remaining.shift());
  }
  return result;
}
function getDailyQueue(topics) { return applyInterleaving(buildPriorityQueue(topics)); }

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — SIMULADOS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// Picks N random questions, optionally filtered by area
function pickQuestions(questions, count, area) {
  let pool = area ? questions.filter(q => q.area === area) : [...questions];
  if (!pool.length) return [];
  pool = pool.sort(() => Math.random() - 0.5);
  return pool.slice(0, Math.min(count, pool.length)).map(q => q.id);
}

// After finishing a simulado: push wrong answers to FSRS pipeline
function pushWrongAnswersToFSRS(simulado) {
  if (simulado.fsrsPushed) return 0;
  const questions = loadQuestions();
  let pushed = 0;
  simulado.questionIds.forEach(qid => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    const userAnswer = simulado.userAnswers[qid];
    if (userAnswer === undefined) return; // not answered
    const isCorrect = userAnswer === q.correctIndex;
    if (!isCorrect) {
      // ── FSRS API CALL (read-only interface) ──────────────────────────────────
      const fsrsResult = scheduleReview(q, 1, 0); // Q=1, acertos=0 → Again
      q.D         = fsrsResult.D;
      q.S         = fsrsResult.S;
      q.lastReview = new Date().toISOString();
      q.nextReview = fsrsResult.nextReviewDate.toISOString();
      q.reps      += 1;
      q.lapses    += 1;
      upsertQuestion(q);
      pushed++;
    }
  });
  // Mark as pushed
  const sims = loadSimulados();
  const idx = sims.findIndex(s => s.id === simulado.id);
  if (idx >= 0) { sims[idx].fsrsPushed = true; saveSimulados(sims); }
  return pushed;
}

// Calculate simulado results by area
function calcSimuladoResults(simulado, questions) {
  const byArea = {};
  let totalCorrect = 0;
  simulado.questionIds.forEach(qid => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    const area = q.area || 'Outros';
    if (!byArea[area]) byArea[area] = { total: 0, correct: 0 };
    byArea[area].total++;
    const isCorrect = simulado.userAnswers[qid] === q.correctIndex;
    if (isCorrect) { byArea[area].correct++; totalCorrect++; }
  });
  const total = simulado.questionIds.length;
  const answered = Object.keys(simulado.userAnswers).length;
  const score = answered > 0 ? Math.round((totalCorrect / answered) * 100) : 0;
  return { byArea, score, totalCorrect, total, answered };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — STREAK & AGENDA ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function computeStreak(topics) {
  // Build set of all dates with any study activity
  const dates = new Set(topics.flatMap(t =>
    t.history.map(s => s.date.split('T')[0])
  ));
  // Also include simulado finished dates
  loadSimulados().forEach(s => {
    if (s.finishedAt) dates.add(s.finishedAt.split('T')[0]);
  });
  const today = new Date().toISOString().split('T')[0];
  let current = 0, longest = 0, run = 0;
  // Walk backwards from today
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (dates.has(key)) {
      run++;
      if (i === 0 || i === 1) current = run; // today or yesterday counts for current streak
    } else {
      if (i === 0) { /* today not done yet, check yesterday */ }
      else if (run > 0) break;
    }
    longest = Math.max(longest, run);
  }
  // Recalculate current properly
  current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (dates.has(key)) current++;
    else break;
  }
  return { current, longest };
}

function buildActivityHistory(topics) {
  // Returns { 'YYYY-MM-DD': count } for the last 56 days
  const history = {};
  topics.forEach(t => t.history.forEach(s => {
    const key = s.date.split('T')[0];
    history[key] = (history[key] || 0) + s.Q;
  }));
  loadSimulados().forEach(s => {
    if (s.finishedAt) {
      const key = s.finishedAt.split('T')[0];
      history[key] = (history[key] || 0) + (s.questionIds?.length || 0);
    }
  });
  return history;
}

// Auto-distribute: create review blocks for next 7 days based on FSRS queue
function autoDistribute(topics, schedule) {
  const queue = getDailyQueue(topics);
  if (!queue.length) return schedule;
  const today = new Date();
  const perDay = Math.ceil(queue.length / 7);
  let added = 0;
  for (let day = 0; day < 7; day++) {
    const d = new Date(today); d.setDate(d.getDate() + day);
    const dateStr = d.toISOString().split('T')[0];
    const alreadyHasReview = schedule.some(b => b.date === dateStr && b.type === 'review');
    if (alreadyHasReview) continue;
    const slice = queue.slice(day * perDay, (day + 1) * perDay);
    if (!slice.length) continue;
    const title = `Revisão FSRS (${slice.length} tópicos)`;
    schedule = addScheduleBlock(dateStr, '08:00', title, 'review', 60);
    added++;
  }
  return added;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const MONTHS_PT   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MONTHS_PT_S = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const WDAYS_PT    = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const WDAYS_S     = ['D','S','T','Q','Q','S','S'];

function todayStr()  { return new Date().toISOString().split('T')[0]; }
function fmtDate(d)  { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }); }
function daysDiff(dateStr) {
  if (!dateStr) return null;
  const a = new Date(dateStr); a.setHours(0,0,0,0);
  const b = new Date();        b.setHours(0,0,0,0);
  return Math.round((a - b) / 86_400_000);
}

function topicStatus(topic) {
  if (!topic.nextReview) return { cls:'new', diff:null };
  const diff = daysDiff(topic.nextReview);
  if (diff < 0)   return { cls:'overdue',   diff };
  if (diff === 0) return { cls:'due-today', diff };
  return               { cls:'upcoming',   diff };
}

function currentR(topic) {
  if (!topic.S || !topic.lastReview) return null;
  return retrievability(Math.max(0, (Date.now() - new Date(topic.lastReview).getTime()) / 86_400_000), topic.S);
}

function showToast(msg, ok = true) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = ok ? '#1e293b' : '#ef4444';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Populate area dropdowns
function populateAreasDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const areas = [...new Set(SPECIALTIES.map(s => s.area))];
  sel.innerHTML = `<option value="">Selecione a grande área</option>` +
    areas.map(a => `<option value="${a}">${a}</option>`).join('');
}
function populateSpecialtiesByArea(area, selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const filtered = area ? SPECIALTIES.filter(s => s.area === area) : [];
  sel.innerHTML = `<option value="">Selecione a especialidade</option>` +
    filtered.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
}
function populateAreaFilter() {
  const sel = document.getElementById('filter-area');
  if (!sel) return;
  const areas = [...new Set(SPECIALTIES.map(s => s.area))];
  sel.innerHTML = `<option value="">Todas as áreas</option>` +
    areas.map(a => `<option value="${a}">${a}</option>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — NAVIGATION & MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

function switchPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`pg-${id}`)?.classList.add('active');
  // Sidebar links
  document.querySelectorAll('.sidebar-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === id);
  });
  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    const isActive = b.dataset.page === id;
    b.classList.toggle('active', isActive);
    const svg = b.querySelector('svg');
    const span = b.querySelector('span');
    if (svg) svg.style.color = isActive ? 'rgb(59,130,246)' : '';
    if (span) span.style.color = isActive ? 'rgb(59,130,246)' : '';
  });
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}
function closeAllModals() {
  document.querySelectorAll('.modal-wrap.open').forEach(m => m.classList.remove('open'));
  document.body.style.overflow = '';
}

function showPane(id) {
  ['pane-input','pane-error-taxonomy','pane-result'].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — DASHBOARD RENDERS
// ═══════════════════════════════════════════════════════════════════════════════

function renderGreeting(user, topics) {
  const h = new Date().getHours();
  const sal = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const now = new Date();
  document.getElementById('greeting-text').textContent = `${sal}, ${user.name || 'Doutor(a)'}. 👋`;
  document.getElementById('greeting-date').textContent =
    `${WDAYS_PT[now.getDay()]}, ${now.getDate()} de ${MONTHS_PT[now.getMonth()]} de ${now.getFullYear()}`;
  // Mobile streak
  const { current } = computeStreak(topics);
  const ms = document.getElementById('mobile-streak');
  if (ms && current > 0) ms.innerHTML = `🔥 <span>${current}</span>`;
  else if (ms) ms.innerHTML = '';
}

function renderExamCountdown(user) {
  const el = document.getElementById('exam-countdown');
  if (!el) return;
  if (!user.examDate) { el.innerHTML = ''; return; }
  const days = daysDiff(user.examDate);
  if (days === null || days < 0) { el.innerHTML = ''; return; }
  const color = days <= 7 ? '#ef4444' : days <= 30 ? '#f97316' : '#3b82f6';
  const bg    = days <= 7 ? 'rgba(239,68,68,0.08)' : days <= 30 ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)';
  el.innerHTML = `
    <div class="glass rounded-2xl p-4 flex items-center gap-4 mb-1" style="border-color:${color}30;background:${bg}">
      <div class="text-4xl font-black tabular-nums leading-none" style="color:${color}">${days}</div>
      <div>
        <p class="font-bold text-sm">Faltam ${days} dia${days!==1?'s':''} para o Exame</p>
        <p class="text-xs text-slate-400 mt-0.5">${fmtDate(user.examDate)}</p>
      </div>
      <div class="ml-auto w-1 h-12 rounded-full" style="background:${color}"></div>
    </div>`;
}

function renderDashStats(topics, user) {
  const urgent  = topics.filter(t => { const c = topicStatus(t).cls; return c==='overdue'||c==='due-today'; }).length;
  const studied = topics.filter(t => t.S != null);
  const avgR    = studied.length ? studied.reduce((s,t) => s+(currentR(t)??0),0)/studied.length : null;
  const avgS    = studied.length ? studied.reduce((s,t) => s+t.S,0)/studied.length : null;
  const rColor  = avgR==null?'text-slate-400':avgR>=0.8?'text-emerald-400':avgR>=0.6?'text-orange-400':'text-red-400';
  const el = document.getElementById('dash-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="glass rounded-2xl p-4">
      <p class="text-2xl font-black ${urgent>0?'text-red-400':'text-slate-200'}">${urgent}</p>
      <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Para Revisar</p>
    </div>
    <div class="glass rounded-2xl p-4">
      <p class="text-2xl font-black ${rColor}">${avgR!=null?Math.round(avgR*100)+'%':'—'}</p>
      <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Retenção Média</p>
    </div>
    <div class="glass rounded-2xl p-4">
      <p class="text-2xl font-black text-slate-200">${avgS!=null?avgS.toFixed(1)+'d':'—'}</p>
      <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Estabilidade</p>
    </div>
    <div class="glass rounded-2xl p-4">
      <p class="text-2xl font-black text-slate-200">${topics.length}</p>
      <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Tópicos</p>
    </div>`;
}

function renderStreakCard(topics) {
  const el = document.getElementById('streak-card');
  if (!el) return;
  const { current, longest } = computeStreak(topics);
  const activity = buildActivityHistory(topics);
  const today = new Date(); today.setHours(0,0,0,0);
  // Last 7 days mini heatmap
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6-i));
    const key = d.toISOString().split('T')[0];
    const count = activity[key] || 0;
    const opacity = count === 0 ? 'opacity-20' : count < 20 ? 'opacity-50' : '';
    return `<div class="w-5 h-5 rounded-md bg-blue-500 ${opacity}" title="${count} questões"></div>`;
  }).join('');
  el.innerHTML = `
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Constância</p>
        <p class="text-3xl font-black text-amber-400">🔥 ${current}</p>
        <p class="text-xs text-slate-400 mt-1">dias · recorde ${longest}</p>
      </div>
    </div>
    <div class="flex gap-1 mt-3">${dots}</div>`;
}

function renderDailyGoalCard(topics, user) {
  const el = document.getElementById('daily-goal-card');
  if (!el) return;
  const goal = user.dailyGoalQuestions || 50;
  const today = todayStr();
  const done = topics.flatMap(t => t.history.filter(s => s.date.startsWith(today)))
    .reduce((s, h) => s + h.Q, 0) +
    loadSimulados().filter(s => s.finishedAt?.startsWith(today))
    .reduce((s, sim) => s + sim.questionIds.length, 0);
  const pct = Math.min(100, Math.round(done / goal * 100));
  const complete = done >= goal;
  el.innerHTML = `
    <p class="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Meta Diária</p>
    <p class="text-3xl font-black ${complete?'text-emerald-400':'text-slate-200'}">${done}<span class="text-base font-normal text-slate-400">/${goal}</span></p>
    <p class="text-xs text-slate-400 mt-1">${complete?'✓ Meta atingida!':goal-done+' questões restantes'}</p>
    <div class="h-1.5 bg-white/10 dark:bg-white/5 rounded-full mt-3 overflow-hidden">
      <div class="h-full rounded-full transition-all ${complete?'bg-emerald-400':'bg-brand'}" style="width:${pct}%"></div>
    </div>`;
}

function renderPriorityQueue(queue) {
  const el = document.getElementById('priority-queue');
  if (!el) return;
  const shown = queue.slice(0, 5);
  if (!shown.length) {
    el.innerHTML = `<div class="text-center py-6 text-slate-400 text-sm">✓ Nenhuma revisão pendente</div>`;
    return;
  }
  el.innerHTML = shown.map((t, i) => {
    const status = topicStatus(t);
    const dot = status.cls === 'overdue' ? 'bg-red-400' : status.cls === 'due-today' ? 'bg-amber-400' : 'bg-emerald-400';
    const col  = areaColor(t.area || 'Outros');
    return `<div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
      <span class="text-xs font-bold text-slate-500 w-4 shrink-0">${i+1}</span>
      <div class="w-1.5 h-1.5 rounded-full ${dot} shrink-0"></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${t.name}</p>
        <p class="text-xs text-slate-400" style="color:${col}">${t.area || '—'}</p>
      </div>
      <button class="text-xs font-semibold text-brand bg-brand/10 hover:bg-brand/20 px-3 py-1.5 rounded-lg transition-all border border-brand/20 whitespace-nowrap"
              data-action="study" data-id="${t.id}">Estudar</button>
    </div>`;
  }).join('');
  if (queue.length > 5)
    el.innerHTML += `<p class="text-xs text-slate-400 text-center mt-2 pt-2 border-t border-white/5">+${queue.length-5} tópicos na fila</p>`;
}

function renderTodayAgenda(schedule) {
  const el = document.getElementById('today-agenda');
  if (!el) return;
  const blocks = blocksForDate(schedule, todayStr());
  if (!blocks.length) {
    el.innerHTML = `<div class="text-center py-6 text-slate-400 text-sm">Nenhum bloco hoje</div>`;
    return;
  }
  const typeColor = { study:'#3b82f6', review:'#10b981', simulado:'#f59e0b' };
  el.innerHTML = blocks.map(b => `
    <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 ${b.completed?'opacity-50':''}">
      <button class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                     ${b.completed?'bg-brand border-brand text-white':'border-white/30 dark:border-white/20'}"
              data-action="toggle-block" data-id="${b.id}">${b.completed?'✓':''}</button>
      <div class="w-1 h-8 rounded-full shrink-0" style="background:${typeColor[b.type]||'#64748b'}"></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate ${b.completed?'line-through':''}">${b.title}</p>
        <p class="text-xs text-slate-400">${b.time} · ${b.durationMin||60}min</p>
      </div>
    </div>`).join('');
}

function renderDashChart(topics) {
  const el = document.getElementById('dash-chart');
  if (!el) return;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i)); d.setHours(0,0,0,0);
    return { date: d, label: WDAYS_S[d.getDay()], count: 0, isToday: i===6 };
  });
  topics.forEach(t => t.history.forEach(s => {
    const sd = new Date(s.date); sd.setHours(0,0,0,0);
    const day = days.find(d => d.date.getTime() === sd.getTime());
    if (day) day.count++;
  }));
  const max = Math.max(...days.map(d => d.count), 1);
  el.innerHTML = days.map(d => `
    <div class="flex-1 flex flex-col items-center gap-1">
      <span class="text-[0.6rem] text-slate-400">${d.count||''}</span>
      <div class="w-full flex items-end" style="height:60px">
        <div class="w-full rounded-t-md transition-all ${d.isToday?'bg-brand':'bg-brand/30'}"
             style="height:${d.count>0?Math.max(8,Math.round(d.count/max*60))+'px':'4px'}"></div>
      </div>
      <span class="text-[0.6rem] font-semibold ${d.isToday?'text-brand':'text-slate-400'}">${d.label}</span>
    </div>`).join('');
}

function renderDashDist(topics) {
  const el = document.getElementById('dash-dist');
  if (!el) return;
  const dist = { critical:0, risk:0, retained:0, solid:0, new_:0 };
  topics.forEach(t => {
    const R = currentR(t);
    if (R==null) dist.new_++;
    else if(R<0.6) dist.critical++;
    else if(R<0.8) dist.risk++;
    else if(R<0.95) dist.retained++;
    else dist.solid++;
  });
  const total = topics.length || 1;
  const pct = n => n ? `${Math.round(n/total*100)}%` : '0%';
  el.innerHTML = `
    <div class="flex h-2 rounded-full overflow-hidden mb-3 gap-0.5">
      <div class="bg-red-400 rounded-full" style="width:${pct(dist.critical)}"></div>
      <div class="bg-orange-400 rounded-full" style="width:${pct(dist.risk)}"></div>
      <div class="bg-brand rounded-full" style="width:${pct(dist.retained)}"></div>
      <div class="bg-emerald-400 rounded-full" style="width:${pct(dist.solid)}"></div>
      <div class="bg-slate-300/20 rounded-full flex-1"></div>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400"></span>Crítico — ${dist.critical}</span>
      <span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400"></span>Em risco — ${dist.risk}</span>
      <span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-brand"></span>Retido — ${dist.retained}</span>
      <span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>Sólido — ${dist.solid}</span>
      <span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-white/20"></span>Novo — ${dist.new_}</span>
    </div>`;
}

function renderPerformanceTable(topics) {
  const el = document.getElementById('perf-table-wrap');
  if (!el) return;
  if (!topics.length) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">Cadastre tópicos para ver a análise.</p>`;
    return;
  }
  const agg = {};
  topics.forEach(t => {
    const area = t.area || 'Outros';
    if (!agg[area]) agg[area] = { count:0, rSum:0, rCount:0 };
    agg[area].count++;
    const R = currentR(t);
    if (R!=null) { agg[area].rSum+=R; agg[area].rCount++; }
  });
  const rows = Object.entries(AREA_INCIDENCE).map(([area, inc]) => {
    const d = agg[area] || {count:0,rSum:0,rCount:0};
    return { area, inc, count:d.count, avgR: d.rCount>0?d.rSum/d.rCount:null };
  });
  el.innerHTML = `<table class="w-full text-xs">
    <thead><tr class="text-left text-slate-400 border-b border-white/10">
      <th class="pb-2 font-semibold">Área</th>
      <th class="pb-2 font-semibold text-right">Incidência</th>
      <th class="pb-2 font-semibold text-right">Tópicos</th>
      <th class="pb-2 font-semibold text-right">Retenção</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => {
        const rPct = r.avgR!=null ? Math.round(r.avgR*100) : null;
        const rColor = rPct==null?'text-slate-400':rPct>=80?'text-emerald-400':rPct>=60?'text-orange-400':'text-red-400';
        const col = areaColor(r.area);
        return `<tr class="border-b border-white/5 last:border-0">
          <td class="py-2 font-medium" style="color:${col}">${r.area}</td>
          <td class="py-2 text-right text-slate-300">${r.inc}%</td>
          <td class="py-2 text-right text-slate-300">${r.count}</td>
          <td class="py-2 text-right font-bold ${rColor}">${rPct!=null?rPct+'%':'—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — SIMULADOS UI
// ═══════════════════════════════════════════════════════════════════════════════

function renderSimuladosPage() {
  const simulados = loadSimulados();
  const questions = loadQuestions();
  const completed = simulados.filter(s => s.status==='completed');

  // Count
  const countEl = document.getElementById('simulados-count');
  if (countEl) countEl.textContent = `${completed.length} prova${completed.length!==1?'s':''} realizadas`;

  // Stats
  const statsEl = document.getElementById('simulados-stats');
  if (statsEl) {
    const avgScore = completed.length
      ? Math.round(completed.reduce((s,sim) => s+(sim.score||0), 0) / completed.length)
      : null;
    const totalQ = completed.reduce((s,sim) => s+sim.questionIds.length, 0);
    statsEl.innerHTML = `
      <div class="glass rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-slate-200">${completed.length}</p>
        <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Simulados</p>
      </div>
      <div class="glass rounded-2xl p-4 text-center">
        <p class="text-2xl font-black ${avgScore!=null&&avgScore>=60?'text-emerald-400':'text-red-400'}">${avgScore!=null?avgScore+'%':'—'}</p>
        <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Média Geral</p>
      </div>
      <div class="glass rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-slate-200">${totalQ}</p>
        <p class="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Questões</p>
      </div>`;
  }

  // List
  const listEl  = document.getElementById('simulados-list');
  const emptyEl = document.getElementById('simulados-empty');
  if (listEl && emptyEl) {
    if (!simulados.length) { listEl.innerHTML=''; emptyEl.classList.remove('hidden'); }
    else {
      emptyEl.classList.add('hidden');
      listEl.innerHTML = [...simulados].reverse().map(sim => {
        const scoreColor = sim.score==null?'text-slate-400':sim.score>=60?'text-emerald-400':'text-red-400';
        const statusLabel = { pending:'Pendente', running:'Em andamento', completed:'Concluído' }[sim.status] || sim.status;
        const statusColor = { pending:'text-slate-400', running:'text-amber-400', completed:'text-emerald-400' }[sim.status];
        return `<div class="glass rounded-2xl p-4 flex items-center gap-4">
          <div class="flex-1 min-w-0">
            <p class="font-semibold truncate">${sim.name}</p>
            <p class="text-xs text-slate-400 mt-0.5">${fmtDate(sim.createdAt)} · ${sim.questionIds.length} questões · ${sim.durationMinutes}min</p>
          </div>
          <div class="text-right shrink-0">
            <p class="font-black text-lg ${scoreColor}">${sim.score!=null?sim.score+'%':'—'}</p>
            <p class="text-xs font-semibold ${statusColor}">${statusLabel}</p>
          </div>
          ${sim.status==='pending' ? `<button class="text-sm font-semibold text-white bg-brand hover:bg-blue-600 px-4 py-2 rounded-xl transition-all" data-action="start-simulado" data-id="${sim.id}">Iniciar</button>` : ''}
          ${sim.status==='completed' ? `<button class="text-sm font-semibold text-slate-400 hover:text-red-400 px-2 py-2 rounded-xl transition-all" data-action="delete-simulado" data-id="${sim.id}">×</button>` : ''}
        </div>`;
      }).join('');
    }
  }

  // Questions bank
  const qCountEl = document.getElementById('questions-count');
  const qListEl  = document.getElementById('questions-list');
  if (qCountEl) qCountEl.textContent = `${questions.length} questões cadastradas`;
  if (qListEl) {
    qListEl.innerHTML = !questions.length
      ? `<p class="text-xs text-slate-400 text-center py-4">Nenhuma questão cadastrada ainda.</p>`
      : questions.slice(-20).reverse().map(q => {
          const col = areaColor(q.area);
          return `<div class="flex items-start gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium truncate">${q.enunciado.substring(0,80)}${q.enunciado.length>80?'…':''}</p>
              <p class="text-[0.6rem] mt-0.5" style="color:${col}">${q.area} · ${q.source||'—'} ${q.year||''}</p>
            </div>
            <button class="opacity-0 group-hover:opacity-100 text-xs text-red-400 transition-all" data-action="delete-question" data-id="${q.id}">×</button>
          </div>`;
        }).join('');
  }
}

// Simulado running state
const simState = {
  simulado: null,
  questions: [],
  currentIdx: 0,
  timerInterval: null,
  secondsLeft: 0,
};

function startSimulado(id) {
  const sims = loadSimulados();
  const sim  = sims.find(s => s.id === id);
  if (!sim) return;
  const questions = loadQuestions().filter(q => sim.questionIds.includes(q.id));
  if (!questions.length) { showToast('Nenhuma questão disponível para este simulado.', false); return; }
  sim.status = 'running'; sim.startedAt = new Date().toISOString();
  upsertSimulado(sim);
  simState.simulado   = sim;
  simState.questions  = questions;
  simState.currentIdx = 0;
  simState.secondsLeft = sim.durationMinutes * 60;
  renderRunningSimulado();
  openModal('modal-running-simulado');
  startSimuladoTimer();
}

function renderRunningSimulado() {
  const { simulado, questions, currentIdx, secondsLeft } = simState;
  if (!simulado) return;
  const q = questions[currentIdx];
  if (!q) return;
  document.getElementById('sim-run-name').textContent = simulado.name;
  document.getElementById('sim-progress').textContent = `${currentIdx+1}/${questions.length}`;
  document.getElementById('sim-q-num').textContent    = `Questão ${currentIdx+1}`;
  document.getElementById('sim-q-area-tag').textContent = q.area || '';
  document.getElementById('sim-q-text').textContent  = q.enunciado;
  const optEls = document.getElementById('sim-options');
  const letters = ['A','B','C','D','E'];
  const selected = simulado.userAnswers[q.id];
  optEls.innerHTML = q.options.map((opt, i) => `
    <button class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-sm text-left
                   ${selected===i?'bg-brand/15 border-brand/50 font-semibold':'bg-white/5 dark:bg-white/3 border-white/10 hover:bg-white/10'}"
            data-action="sim-answer" data-qid="${q.id}" data-idx="${i}">
      <span class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold
                   ${selected===i?'bg-brand border-brand text-white':'border-white/30'}">${letters[i]}</span>
      ${opt}
    </button>`).join('');
  updateSimTimer(secondsLeft);
}

function startSimuladoTimer() {
  clearInterval(simState.timerInterval);
  simState.timerInterval = setInterval(() => {
    simState.secondsLeft--;
    updateSimTimer(simState.secondsLeft);
    if (simState.secondsLeft <= 0) finishSimulado(true);
  }, 1000);
}

function updateSimTimer(seconds) {
  const el = document.getElementById('sim-timer');
  if (!el) return;
  const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
  el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className = `font-bold text-sm tabular-nums ${seconds < 300 ? 'timer-critical' : 'text-brand'}`;
}

function simNavNext() {
  if (simState.currentIdx < simState.questions.length - 1) {
    simState.currentIdx++;
    renderRunningSimulado();
  }
}
function simNavPrev() {
  if (simState.currentIdx > 0) {
    simState.currentIdx--;
    renderRunningSimulado();
  }
}
function simRecordAnswer(qid, idx) {
  simState.simulado.userAnswers[qid] = idx;
  upsertSimulado(simState.simulado);
  renderRunningSimulado();
}

function finishSimulado(timeUp = false) {
  clearInterval(simState.timerInterval);
  if (!simState.simulado) return;
  const questions = loadQuestions();
  const results   = calcSimuladoResults(simState.simulado, questions);
  simState.simulado.status     = 'completed';
  simState.simulado.finishedAt = new Date().toISOString();
  simState.simulado.score      = results.score;
  simState.simulado.byArea     = results.byArea;
  upsertSimulado(simState.simulado);
  const pushed = pushWrongAnswersToFSRS(simState.simulado);
  closeModal('modal-running-simulado');
  renderSimuladoResult(simState.simulado, results, pushed, timeUp);
  openModal('modal-result-simulado');
  refresh();
}

function renderSimuladoResult(sim, results, pushed, timeUp) {
  document.getElementById('res-sim-name').textContent = sim.name + (timeUp?' · Tempo esgotado':'');
  const scoreColor = results.score>=70?'text-emerald-400':results.score>=50?'text-orange-400':'text-red-400';
  document.getElementById('res-sim-score').innerHTML = `
    <div class="text-6xl font-black ${scoreColor}">${results.score}%</div>
    <p class="text-slate-400 text-sm mt-2">${results.totalCorrect}/${results.answered} acertos · ${results.total} questões</p>`;
  document.getElementById('res-sim-by-area').innerHTML =
    Object.entries(results.byArea).map(([area, data]) => {
      const pct = data.total ? Math.round(data.correct/data.total*100) : 0;
      const col = areaColor(area);
      return `<div class="flex items-center gap-3">
        <div class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${col}"></div>
        <span class="text-xs font-medium flex-1">${area}</span>
        <span class="text-xs text-slate-400">${data.correct}/${data.total}</span>
        <span class="text-xs font-bold ${pct>=60?'text-emerald-400':'text-red-400'}">${pct}%</span>
      </div>`;
    }).join('');
  document.getElementById('res-sim-fsrs-info').innerHTML =
    pushed > 0
      ? `🔄 <strong>${pushed} questão${pushed>1?'s':''} errada${pushed>1?'s':''}</strong> adicionada${pushed>1?'s':''} automaticamente à fila de revisão FSRS.`
      : `✓ Nenhuma questão errada. Desempenho excelente!`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — AGENDA UI
// ═══════════════════════════════════════════════════════════════════════════════

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = todayStr();

function renderAgendaPage(schedule, topics) {
  renderHeatmap(topics);
  renderCalendar(schedule);
  renderAgendaBlocks(schedule, calSelectedDate);
  const streakNum = document.getElementById('streak-num');
  if (streakNum) streakNum.textContent = computeStreak(topics).current;
}

function renderHeatmap(topics) {
  const el = document.getElementById('heatmap');
  if (!el) return;
  const activity = buildActivityHistory(topics);
  const today = new Date(); today.setHours(0,0,0,0);
  const cells = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const count = activity[key] || 0;
    const opacity = count===0?'opacity-10':count<10?'opacity-30':count<30?'opacity-60':'opacity-100';
    const isToday = key===todayStr();
    cells.push(`<div class="w-3 h-3 rounded-sm bg-brand ${opacity} ${isToday?'ring-1 ring-white/50':''}" title="${key}: ${count} questões"></div>`);
  }
  el.innerHTML = cells.join('');
}

function renderCalendar(schedule) {
  const titleEl = document.getElementById('cal-title');
  const gridEl  = document.getElementById('cal-grid');
  if (!titleEl || !gridEl) return;
  titleEl.textContent = `${MONTHS_PT[calMonth]} ${calYear}`;
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const today = todayStr();
  let html = WDAYS_S.map(d => `<div class="text-center text-[0.6rem] font-semibold text-slate-400 py-1">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday    = dateStr === today;
    const isSelected = dateStr === calSelectedDate;
    const hasBlock   = schedule.some(b => b.date === dateStr);
    const hasDone    = schedule.some(b => b.date === dateStr && b.completed);
    html += `<button data-action="cal-select" data-date="${dateStr}"
      class="cal-day flex flex-col items-center justify-center text-xs rounded-xl py-1 transition-all
             ${isSelected?'bg-brand text-white font-bold':isToday?'ring-2 ring-brand/50 text-brand font-semibold':'hover:bg-white/10 dark:hover:bg-white/5'}">
      ${d}
      ${hasBlock ? `<div class="w-1 h-1 rounded-full mt-0.5 ${hasDone?'bg-emerald-400':'bg-brand/60'} ${isSelected?'bg-white':''}"></div>` : '<div class="w-1 h-1 mt-0.5"></div>'}
    </button>`;
  }
  gridEl.innerHTML = html;
}

function renderAgendaBlocks(schedule, dateStr) {
  const labelEl = document.getElementById('agenda-day-label');
  const listEl  = document.getElementById('agenda-blocks');
  const emptyEl = document.getElementById('agenda-empty');
  if (!labelEl || !listEl || !emptyEl) return;
  const isToday = dateStr === todayStr();
  const d = new Date(dateStr+'T12:00:00');
  labelEl.textContent = isToday ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const blocks = blocksForDate(schedule, dateStr);
  if (!blocks.length) { listEl.innerHTML=''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  const typeColor = { study:'#3b82f6', review:'#10b981', simulado:'#f59e0b' };
  const typeLabel = { study:'Estudo', review:'Revisão FSRS', simulado:'Simulado' };
  listEl.innerHTML = blocks.map(b => `
    <div class="flex items-center gap-3 p-3 rounded-xl glass border border-white/10 ${b.completed?'opacity-60':''}">
      <button class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                     ${b.completed?'bg-brand border-brand text-white text-xs':'border-white/30 dark:border-white/20'}"
              data-action="toggle-block" data-id="${b.id}">${b.completed?'✓':''}</button>
      <div class="w-1 h-10 rounded-full shrink-0" style="background:${typeColor[b.type]||'#64748b'}"></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium ${b.completed?'line-through':''}">${b.title}</p>
        <p class="text-xs text-slate-400">${b.time} · ${b.durationMin||60}min · <span style="color:${typeColor[b.type]||'#64748b'}">${typeLabel[b.type]||b.type}</span></p>
      </div>
      <button class="text-slate-400 hover:text-red-400 transition-all" data-action="delete-block" data-id="${b.id}">×</button>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — TOPICS RENDERS
// ═══════════════════════════════════════════════════════════════════════════════

function topicCard(topic) {
  const status = topicStatus(topic), R = currentR(topic);
  const rPct   = R!=null?Math.round(R*100):null;
  const rColor = rPct==null?'text-slate-400':rPct>=80?'text-emerald-400':rPct>=60?'text-orange-400':'text-red-400';
  const dotCls = status.cls==='overdue'?'bg-red-400':status.cls==='due-today'?'bg-amber-400':status.cls==='new'?'bg-brand':'bg-emerald-400';
  const col    = areaColor(topic.area||'Outros');
  const statusLabel = { new:'NOVO', overdue:`VENCIDO ${Math.abs(status.diff||0)}d`, 'due-today':'HOJE', upcoming:`em ${status.diff}d` }[status.cls];
  return `<div class="glass rounded-2xl p-4 space-y-3" data-id="${topic.id}">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-2.5 flex-1 min-w-0">
        <div class="w-2 h-2 rounded-full ${dotCls} mt-1.5 shrink-0"></div>
        <p class="font-semibold text-sm leading-tight">${topic.name}</p>
      </div>
      <span class="text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0
                   ${status.cls==='overdue'?'text-red-400 border-red-400/30 bg-red-400/10':
                     status.cls==='due-today'?'text-amber-400 border-amber-400/30 bg-amber-400/10':
                     status.cls==='new'?'text-blue-400 border-brand/30 bg-brand/10':
                     'text-slate-400 border-slate-400/30'}">${statusLabel}</span>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-[0.65rem] font-semibold px-2 py-0.5 rounded-full" style="color:${col};background:${col}20">${topic.area||'—'}</span>
      ${topic.weight>=7?`<span class="text-[0.65rem] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">⚡ ${topic.weight}</span>`:''}
      ${topic.S!=null?`<span class="text-[0.65rem] text-slate-400">S ${topic.S.toFixed(1)}d</span>`:''}
      <span class="text-[0.65rem] font-bold ${rColor} ml-auto">${rPct!=null?rPct+'%':'—'}</span>
    </div>
    <div class="flex items-center justify-between pt-1 border-t border-white/5">
      <span class="text-[0.65rem] text-slate-400">R★ ${Math.round(targetRetention(topic.relevance)*100)}% · próx. ${fmtDate(topic.nextReview)}</span>
      <div class="flex gap-2">
        <button class="text-xs font-semibold text-white bg-brand hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-all"
                data-action="study" data-id="${topic.id}">Estudar</button>
        <button class="text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 rounded-lg transition-all"
                data-action="delete" data-id="${topic.id}">×</button>
      </div>
    </div>
  </div>`;
}

function sortTopics(topics, by, query) {
  let list = query ? topics.filter(t => t.name.toLowerCase().includes(query.toLowerCase())) : [...topics];
  const order = { new:0, overdue:1, 'due-today':2, upcoming:3 };
  return list.sort((a,b) => {
    if (by === 'name')      return a.name.localeCompare(b.name);
    if (by === 'relevance') return b.relevance - a.relevance;
    if (by === 'retention') return (currentR(a)??-1) - (currentR(b)??-1);
    if (by === 'score')     return (b._score??0) - (a._score??0);
    const oa=order[topicStatus(a).cls]??9, ob=order[topicStatus(b).cls]??9;
    if (oa!==ob) return oa-ob;
    const da=topicStatus(a).diff, db=topicStatus(b).diff;
    if (da!=null&&db!=null) return da-db;
    return a.name.localeCompare(b.name);
  });
}

function renderTopicList(topics, sortBy, query='', filterArea='') {
  const listEl  = document.getElementById('topic-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('topics-count');
  if (!listEl) return;
  let filtered = filterArea ? topics.filter(t => (t.area||getSpecialty(t.subcategory).area)===filterArea) : topics;
  const sorted = sortTopics(filtered, sortBy, query);
  if (countEl) countEl.textContent = `${topics.length} tópico${topics.length!==1?'s':''}`;
  if (!sorted.length) { listEl.innerHTML=''; emptyEl?.classList.remove('hidden'); return; }
  emptyEl?.classList.add('hidden');
  listEl.innerHTML = sorted.map(topicCard).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — STUDY SESSION (FSRS REVIEW)
// ═══════════════════════════════════════════════════════════════════════════════

function renderStudyState(topic) {
  const R = currentR(topic), rPct = R!=null?Math.round(R*100)+'%':'—';
  const rCls = R==null?'text-slate-400':R<0.6?'text-red-400':R<0.8?'text-orange-400':'text-emerald-400';
  document.getElementById('study-state').innerHTML = `
    <div class="grid grid-cols-4 gap-2 p-3 bg-white/5 dark:bg-white/3 rounded-xl mb-4">
      <div class="text-center"><p class="font-bold text-sm ${rCls}">${rPct}</p><p class="text-[0.6rem] text-slate-400 mt-0.5">Retenção</p></div>
      <div class="text-center"><p class="font-bold text-sm">${topic.D!=null?topic.D.toFixed(1):'—'}</p><p class="text-[0.6rem] text-slate-400 mt-0.5">Dificuldade</p></div>
      <div class="text-center"><p class="font-bold text-sm">${topic.S!=null?topic.S.toFixed(1)+'d':'—'}</p><p class="text-[0.6rem] text-slate-400 mt-0.5">Estabilidade</p></div>
      <div class="text-center"><p class="font-bold text-sm text-slate-300">${fmtDate(topic.nextReview)}</p><p class="text-[0.6rem] text-slate-400 mt-0.5">Próx. revisão</p></div>
    </div>`;
}

function renderStudyResult(result, topic) {
  const ratingLabel = { 1:'AGAIN', 2:'HARD', 3:'GOOD', 4:'EASY' }[result.rating];
  const ratingColor = { 1:'text-red-400 bg-red-400/10 border-red-400/30', 2:'text-orange-400 bg-orange-400/10 border-orange-400/30', 3:'text-brand bg-brand/10 border-brand/30', 4:'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' }[result.rating];
  document.getElementById('res-rating').innerHTML = `
    <div class="flex items-center gap-3 mb-3">
      <span class="px-4 py-1.5 rounded-full border text-sm font-black ${ratingColor}">${ratingLabel}</span>
      <span class="text-xs text-slate-400">E=${result.E} · A=${Math.round(result.A*100)}% · C=${Math.round(result.C*100)}%</span>
    </div>`;
  document.getElementById('res-grid').innerHTML = `
    <div class="glass rounded-xl p-3 text-center"><p class="font-bold">${result.D.toFixed(1)}</p><p class="text-xs text-slate-400">Dificuldade</p></div>
    <div class="glass rounded-xl p-3 text-center"><p class="font-bold">${result.S.toFixed(1)}d</p><p class="text-xs text-slate-400">Estabilidade</p></div>
    <div class="glass rounded-xl p-3 text-center"><p class="font-bold ${result.R<0.6?'text-red-400':result.R<0.8?'text-orange-400':'text-emerald-400'}">${Math.round(result.R*100)}%</p><p class="text-xs text-slate-400">Retenção</p></div>
    <div class="glass rounded-xl p-3 text-center"><p class="font-bold text-brand">${Math.round(result.R_target*100)}%</p><p class="text-xs text-slate-400">R★ Alvo</p></div>`;
  document.getElementById('res-next').innerHTML = `
    <div class="glass rounded-xl p-3 text-center mt-2">
      <p class="text-2xl font-black text-brand">+${result.interval} dias</p>
      <p class="text-xs text-slate-400 mt-1">Próxima revisão: ${new Date(result.nextReviewDate).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14 — APP STATE, INIT & EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

const state = {
  topics: [], schedule: [], user: { name:'', examDate:null, dailyGoalQuestions:50, theme:'dark', onboarded:false },
  dailyQueue: [], sortBy:'due', filterArea:'', searchQuery:'',
  activePage: 'dashboard', activeTopic: null, pendingResult: null,
};

function refresh() {
  state.dailyQueue = getDailyQueue(state.topics);
  const scoreMap   = Object.fromEntries(state.dailyQueue.map(t => [t.id, t._score ?? 0]));
  state.topics     = state.topics.map(t => ({ ...t, _score: scoreMap[t.id] ?? 0 }));

  renderGreeting(state.user, state.topics);
  renderExamCountdown(state.user);
  renderStreakCard(state.topics);
  renderDailyGoalCard(state.topics, state.user);
  renderDashStats(state.topics, state.user);
  renderPriorityQueue(state.dailyQueue);
  renderTodayAgenda(state.schedule);
  renderDashChart(state.topics);
  renderDashDist(state.topics);
  renderPerformanceTable(state.topics);
  renderTopicList(state.topics, state.sortBy, state.searchQuery, state.filterArea);
  renderSimuladosPage();
  renderAgendaPage(state.schedule, state.topics);
  updateSidebarUser();
}

function updateSidebarUser() {
  const avatar = document.getElementById('sb-avatar');
  const name   = document.getElementById('sb-name');
  if (avatar) avatar.textContent = (state.user.name || 'M')[0].toUpperCase();
  if (name)   name.textContent   = state.user.name || 'Médico';
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme !== 'light');
  // Update theme buttons
  const btnDark  = document.getElementById('btn-theme-dark');
  const btnLight = document.getElementById('btn-theme-light');
  if (btnDark)  btnDark.className  = `flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${theme!=='light'?'border-brand bg-brand/10 text-brand':'border-transparent bg-white/30 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`;
  if (btnLight) btnLight.className = `flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${theme==='light'?'border-brand bg-brand/10 text-brand':'border-transparent bg-white/30 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`;
}

function populateSettings() {
  const nameEl  = document.getElementById('in-settings-name');
  const dateEl  = document.getElementById('in-exam-date');
  const goalEl  = document.getElementById('in-daily-goal');
  if (nameEl) nameEl.value = state.user.name || '';
  if (dateEl) dateEl.value = state.user.examDate || '';
  if (goalEl) goalEl.value = state.user.dailyGoalQuestions || 50;
  applyTheme(state.user.theme || 'dark');
}

function init() {
  state.user     = loadUser();
  state.topics   = loadTopics();
  state.schedule = loadSchedule();

  // Apply saved theme
  applyTheme(state.user.theme || 'dark');

  // Populate dropdowns
  populateAreasDropdown('in-area');
  populateAreasDropdown('in-sim-area');
  populateAreasDropdown('in-q-area');
  populateAreaFilter();
  setDefaultBlockDate();

  switchPage('dashboard');
  refresh();
  bindEvents();

  if (!state.user.name || !state.user.onboarded) {
    openModal('modal-onboarding');
    document.getElementById('in-username')?.focus();
  } else {
    closeModal('modal-onboarding');
  }
}

function bindEvents() {

  // ── Navigation (delegate to all [data-page] elements) ──────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    const page = btn.dataset.page;
    const pages = ['dashboard','simulados','agenda','topics','settings'];
    if (!pages.includes(page)) return;
    state.activePage = page;
    switchPage(page);
    if (page === 'settings') populateSettings();
    if (page === 'simulados') renderSimuladosPage();
    if (page === 'agenda')    renderAgendaPage(state.schedule, state.topics);
  });

  // ── Modal close ─────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-wrap')) closeAllModals();
    const close = e.target.closest('[data-close]');
    if (close) closeModal(close.dataset.close);
  });
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeAllModals(); });

  // ── Delegated actions ───────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, date, idx, qid } = btn.dataset;
    if (action === 'study')         openStudyModal(id);
    if (action === 'delete')        deleteTopic(id);
    if (action === 'toggle-block')  { toggleBlock(id); refresh(); }
    if (action === 'delete-block')  { deleteBlock(id); refresh(); }
    if (action === 'start-simulado') startSimulado(id);
    if (action === 'delete-simulado') deleteSimulado(id);
    if (action === 'sim-answer')    simRecordAnswer(qid, Number(idx));
    if (action === 'cal-select')    { calSelectedDate = date; renderCalendar(state.schedule); renderAgendaBlocks(state.schedule, date); }
    if (action === 'delete-question') deleteQuestion(id);
  });

  // ── Onboarding ───────────────────────────────────────────────────────────────
  document.getElementById('form-onboarding').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('in-username').value.trim();
    if (!name) return;
    state.user = { ...state.user, name, onboarded: true };
    saveUser(state.user);
    closeModal('modal-onboarding');
    refresh();
  });

  // ── New Topic (Banco page button + Dashboard quick button) ───────────────────
  function openNewTopicModal() {
    document.getElementById('form-new').reset();
    document.getElementById('rel-val').textContent      = '3';
    document.getElementById('weight-val').textContent   = '5';
    document.getElementById('r-target-val').textContent = '90.0%';
    populateAreasDropdown('in-area');
    populateSpecialtiesByArea('', 'in-subcategory');
    document.getElementById('err-area')?.classList.add('hidden');
    document.getElementById('err-name')?.classList.add('hidden');
    openModal('modal-new');
    document.getElementById('in-name')?.focus();
  }
  document.getElementById('btn-new').addEventListener('click', openNewTopicModal);
  document.getElementById('btn-quick-topic')?.addEventListener('click', openNewTopicModal);
  document.getElementById('in-area').addEventListener('change', e => populateSpecialtiesByArea(e.target.value, 'in-subcategory'));
  document.getElementById('in-rel').addEventListener('input', e => {
    document.getElementById('rel-val').textContent     = e.target.value;
    document.getElementById('r-target-val').textContent = `${(targetRetention(Number(e.target.value))*100).toFixed(1)}%`;
  });
  document.getElementById('in-weight').addEventListener('input', e => {
    document.getElementById('weight-val').textContent = e.target.value;
  });
  document.getElementById('form-new').addEventListener('submit', e => { e.preventDefault(); submitNewTopic(); });

  // ── Topic filters ────────────────────────────────────────────────────────────
  document.getElementById('sort-select').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery, state.filterArea);
  });
  document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery, state.filterArea);
  });
  document.getElementById('filter-area').addEventListener('change', e => {
    state.filterArea = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery, state.filterArea);
  });

  // ── Study session ────────────────────────────────────────────────────────────
  ['in-q','in-hits'].forEach(id => document.getElementById(id)?.addEventListener('input', updateAccuracyBar));
  document.getElementById('form-study').addEventListener('submit', e => { e.preventDefault(); submitStudySession(); });
  document.getElementById('btn-confirm').addEventListener('click', confirmResult);
  document.getElementById('btn-redo').addEventListener('click', () => { state.pendingResult = null; showPane('pane-input'); });
  document.querySelectorAll('.taxonomy-btn').forEach(btn =>
    btn.addEventListener('click', () => selectErrorType(btn.dataset.error)));

  // ── Agenda ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-add-block')?.addEventListener('click', () => {
    document.getElementById('form-block').reset();
    setDefaultBlockDate();
    openModal('modal-block');
  });
  document.getElementById('form-block').addEventListener('submit', e => { e.preventDefault(); submitAddBlock(); });
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth=11; calYear--; }
    renderCalendar(state.schedule);
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth=0; calYear++; }
    renderCalendar(state.schedule);
  });
  document.getElementById('btn-auto-distribute')?.addEventListener('click', () => {
    const added = autoDistribute(state.topics, state.schedule);
    state.schedule = loadSchedule();
    renderAgendaPage(state.schedule, state.topics);
    showToast(typeof added === 'number' ? `${added} bloco${added!==1?'s':''} de revisão distribuídos!` : 'Sem novos blocos para distribuir.');
  });

  // ── Simulados ────────────────────────────────────────────────────────────────
  document.getElementById('btn-new-simulado')?.addEventListener('click', () => {
    document.getElementById('form-new-simulado').reset();
    populateAreasDropdown('in-sim-area');
    document.getElementById('in-sim-area').insertAdjacentHTML('afterbegin', '<option value="">Todas as áreas</option>');
    openModal('modal-new-simulado');
  });
  document.getElementById('form-new-simulado').addEventListener('submit', e => { e.preventDefault(); submitNewSimulado(); });
  document.getElementById('sim-next')?.addEventListener('click', simNavNext);
  document.getElementById('sim-prev')?.addEventListener('click', simNavPrev);
  document.getElementById('btn-finish-simulado')?.addEventListener('click', () => {
    if (confirm('Encerrar o simulado agora?')) finishSimulado(false);
  });
  document.getElementById('btn-close-result')?.addEventListener('click', () => closeModal('modal-result-simulado'));

  // ── Questions ────────────────────────────────────────────────────────────────
  document.getElementById('btn-new-question')?.addEventListener('click', () => {
    document.getElementById('form-new-question').reset();
    populateAreasDropdown('in-q-area');
    populateSpecialtiesByArea('', 'in-q-sub');
    document.querySelector('input[name="correct-opt"][value="0"]').checked = true;
    openModal('modal-new-question');
  });
  document.getElementById('in-q-area')?.addEventListener('change', e => populateSpecialtiesByArea(e.target.value, 'in-q-sub'));
  document.getElementById('form-new-question').addEventListener('submit', e => { e.preventDefault(); submitNewQuestion(); });
  document.getElementById('btn-import-questions')?.addEventListener('click', () => document.getElementById('in-import-questions').click());
  document.getElementById('in-import-questions')?.addEventListener('change', e => {
    if (!e.target.files[0]) return;
    importQuestions(e.target.files[0]);
    e.target.value = '';
  });

  // ── Settings ─────────────────────────────────────────────────────────────────
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const name     = document.getElementById('in-settings-name').value.trim();
    const examDate = document.getElementById('in-exam-date').value || null;
    const goal     = parseInt(document.getElementById('in-daily-goal').value) || 50;
    if (name) state.user.name = name;
    state.user = { ...state.user, examDate, dailyGoalQuestions: goal };
    saveUser(state.user);
    refresh();
    showToast('Ajustes salvos!');
  });
  document.getElementById('btn-theme-dark')?.addEventListener('click', () => {
    state.user.theme = 'dark'; saveUser(state.user); applyTheme('dark');
  });
  document.getElementById('btn-theme-light')?.addEventListener('click', () => {
    state.user.theme = 'light'; saveUser(state.user); applyTheme('light');
  });
  document.getElementById('btn-export').addEventListener('click', () => { exportData(); showToast('Backup exportado!'); });
  document.getElementById('in-import').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    importData(file, () => { state.topics=loadTopics(); state.schedule=loadSchedule(); state.user=loadUser(); populateSettings(); refresh(); });
    e.target.value = '';
  });
  document.getElementById('btn-optimize').addEventListener('click', () => {
    state.dailyQueue = getDailyQueue(state.topics); refresh();
    showToast('Fila de prioridades recalculada!');
  });
}

// ── Topic actions ─────────────────────────────────────────────────────────────
function submitNewTopic() {
  const nameEl = document.getElementById('in-name');
  const areaEl = document.getElementById('in-area');
  const errName = document.getElementById('err-name');
  const errArea = document.getElementById('err-area');
  let valid = true;
  if (!nameEl.value.trim()) { errName?.classList.remove('hidden'); nameEl.focus(); valid=false; }
  else errName?.classList.add('hidden');
  if (!areaEl.value)        { errArea?.classList.remove('hidden'); if(valid) areaEl.focus(); valid=false; }
  else errArea?.classList.add('hidden');
  if (!valid) return;
  const topic = newTopic(nameEl.value, document.getElementById('in-rel').value,
    document.getElementById('in-weight').value, areaEl.value, document.getElementById('in-subcategory').value);
  state.topics = upsertTopic(topic);
  closeModal('modal-new');
  refresh();
}
function deleteTopic(id) {
  const t = state.topics.find(t => t.id===id);
  if (!t || !confirm(`Excluir "${t.name}"?`)) return;
  state.topics = removeTopic(id); refresh();
}

// ── Study session actions ─────────────────────────────────────────────────────
function openStudyModal(id) {
  state.activeTopic   = state.topics.find(t => t.id===id);
  state.pendingResult = null;
  if (!state.activeTopic) return;
  document.getElementById('study-name').textContent = state.activeTopic.name;
  renderStudyState(state.activeTopic);
  document.getElementById('form-study').reset();
  document.getElementById('acc-bar').style.width = '0%';
  document.getElementById('acc-pct').textContent  = '—';
  document.getElementById('e-preview-row').classList.add('hidden');
  document.getElementById('err-study').classList.add('hidden');
  ['pane-input','pane-error-taxonomy','pane-result'].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = p==='pane-input'?'block':'none';
  });
  openModal('modal-study');
  document.getElementById('in-q')?.focus();
}
function updateAccuracyBar() {
  const Q    = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const bar  = document.getElementById('acc-bar'), pct = document.getElementById('acc-pct');
  const prev = document.getElementById('e-preview-row');
  if (!Q||Q<1||isNaN(hits)) { bar.style.width='0%'; pct.textContent='—'; prev.classList.add('hidden'); return; }
  const safeHits = Math.min(hits, Q), A = safeHits/Q;
  bar.style.width = `${A*100}%`;
  pct.textContent = `${Math.round(A*100)}%`;
  bar.style.background = A<0.60?'#ef4444':A<0.75?'#f97316':A<0.90?'#3b82f6':'#10b981';
  try {
    const { label, E } = deriveRating(Q, safeHits);
    document.getElementById('e-preview').textContent = `E=${E} → ${label.toUpperCase()}`;
    prev.classList.remove('hidden');
  } catch { prev.classList.add('hidden'); }
}
function submitStudySession() {
  const Q = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const errEl = document.getElementById('err-study');
  if (!Q||Q<1||isNaN(hits)||hits<0||hits>Q) {
    errEl.textContent = hits>Q?'Acertos não pode exceder questões.':'Preencha os campos corretamente.';
    errEl.classList.remove('hidden'); return;
  }
  errEl.classList.add('hidden');
  const result = scheduleReview(state.activeTopic, Q, hits);
  state.pendingResult = { result, Q, hits, errorType: null };
  if (result.rating === 1) {
    showPane('pane-error-taxonomy');
  } else {
    renderStudyResult(result, state.activeTopic);
    showPane('pane-result');
  }
}
function selectErrorType(errorType) {
  if (!state.pendingResult) return;
  state.pendingResult.errorType = errorType;
  renderStudyResult(state.pendingResult.result, state.activeTopic);
  showPane('pane-result');
}
function confirmResult() {
  if (!state.pendingResult || !state.activeTopic) return;
  const { result, Q, hits, errorType } = state.pendingResult;
  const updated = { ...state.activeTopic, D: result.D, S: result.S,
    lastReview: new Date().toISOString(), nextReview: result.nextReviewDate.toISOString(),
    reps: state.activeTopic.reps+1, lapses: state.activeTopic.lapses+(result.rating===1?1:0),
    history: [...state.activeTopic.history, { date: new Date().toISOString(), Q, hits,
      rating: result.rating, label: result.label, E: result.E, D: result.D, S: result.S,
      interval: result.interval, errorType: result.rating===1?errorType:null }] };
  state.topics = upsertTopic(updated);
  state.activeTopic = null; state.pendingResult = null;
  closeModal('modal-study'); refresh();
}

// ── Agenda actions ─────────────────────────────────────────────────────────────
function setDefaultBlockDate() {
  const inp = document.getElementById('in-block-date');
  if (inp) inp.value = todayStr();
}
function submitAddBlock() {
  const date  = document.getElementById('in-block-date').value;
  const time  = document.getElementById('in-block-time').value;
  const title = document.getElementById('in-block-title').value.trim();
  const type  = document.getElementById('in-block-type').value;
  const dur   = parseInt(document.getElementById('in-block-duration').value) || 60;
  if (!date||!time||!title) return;
  state.schedule = addScheduleBlock(date, time, title, type, dur);
  closeModal('modal-block');
  renderAgendaPage(state.schedule, state.topics);
  renderTodayAgenda(state.schedule);
}
function toggleBlock(id) {
  state.schedule = toggleScheduleBlock(id);
}
function deleteBlock(id) {
  if (!confirm('Remover este bloco?')) return;
  state.schedule = removeScheduleBlock(id);
}

// ── Simulado actions ──────────────────────────────────────────────────────────
function submitNewSimulado() {
  const name     = document.getElementById('in-sim-name').value.trim();
  const count    = parseInt(document.getElementById('in-sim-count').value) || 60;
  const duration = parseInt(document.getElementById('in-sim-duration').value) || 120;
  const area     = document.getElementById('in-sim-area').value;
  const errEl    = document.getElementById('err-sim');
  const questions = loadQuestions();
  if (!name) { errEl.textContent='Digite um nome.'; errEl.classList.remove('hidden'); return; }
  const pool = area ? questions.filter(q => q.area===area) : questions;
  if (!pool.length) { errEl.textContent='Nenhuma questão disponível. Cadastre questões primeiro.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  const qIds = pickQuestions(questions, count, area);
  const sim  = newSimulado(name, qIds, duration);
  upsertSimulado(sim);
  closeModal('modal-new-simulado');
  renderSimuladosPage();
  showToast(`Simulado criado com ${qIds.length} questões!`);
}
function deleteSimulado(id) {
  if (!confirm('Excluir este simulado?')) return;
  const sims = loadSimulados().filter(s => s.id!==id);
  saveSimulados(sims);
  renderSimuladosPage();
}

// ── Question actions ──────────────────────────────────────────────────────────
function submitNewQuestion() {
  const enunciado = document.getElementById('in-q-text').value.trim();
  const area      = document.getElementById('in-q-area').value;
  const sub       = document.getElementById('in-q-sub').value;
  const source    = document.getElementById('in-q-source').value.trim();
  const year      = document.getElementById('in-q-year').value;
  const explanation = document.getElementById('in-q-explanation').value.trim();
  const correctEl = document.querySelector('input[name="correct-opt"]:checked');
  const correctIndex = correctEl ? parseInt(correctEl.value) : 0;
  const optInputs = document.querySelectorAll('.opt-input');
  const options = Array.from(optInputs).map(i => i.value.trim());
  if (!enunciado || !area || options.some(o => !o)) {
    showToast('Preencha o enunciado, área e todas as alternativas.', false); return;
  }
  const q = newQuestion(enunciado, options, correctIndex, area, sub, source, year, explanation);
  upsertQuestion(q);
  closeModal('modal-new-question');
  renderSimuladosPage();
  showToast('Questão cadastrada!');
}
function deleteQuestion(id) {
  if (!confirm('Excluir esta questão?')) return;
  const qs = loadQuestions().filter(q => q.id!==id);
  saveQuestions(qs);
  renderSimuladosPage();
}
function importQuestions(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const arr = Array.isArray(data) ? data : data.questions;
      if (!Array.isArray(arr)) throw new Error('Formato inválido');
      const existing = loadQuestions();
      let added = 0;
      arr.forEach(q => {
        if (!q.enunciado || !q.options || !Array.isArray(q.options)) return;
        existing.push({ ...newQuestion(q.enunciado, q.options, q.correctIndex??0, q.area||'Outros', q.subcategory||'', q.source||'', q.year||null, q.explanation||''), id: q.id || crypto.randomUUID() });
        added++;
      });
      saveQuestions(existing);
      renderSimuladosPage();
      showToast(`${added} questão${added!==1?'s':''} importada${added!==1?'s':''}!`);
    } catch { showToast('Erro ao importar questões.', false); }
  };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', init);
