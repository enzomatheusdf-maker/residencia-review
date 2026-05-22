'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// ALGORITHM — FSRS-4.5 (NUNCA ALTERAR OS PESOS)
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
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

const KEY_TOPICS   = 'medrev_v1';
const KEY_SCHEDULE = 'medrev_schedule_v1';
const KEY_USER     = 'medrev_user_v1';

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

// Incidência estatística por área em provas de residência médica (soma = 100)
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

function getSpecialty(value) {
  return SPECIALTIES.find(s => s.value === value) ?? { value, label: value || '—', area: 'Outros' };
}

function migrateTopic(t) {
  const area = t.area ?? getSpecialty(t.subcategory ?? '').area;
  return {
    ...t,
    weight:      t.weight      ?? 5,
    subcategory: t.subcategory ?? '',
    area:        area          ?? 'Outros',
    history: (t.history ?? []).map(s => ({ ...s, errorType: s.errorType ?? null })),
  };
}

function loadTopics() {
  try { return (JSON.parse(localStorage.getItem(KEY_TOPICS)) ?? []).map(migrateTopic); }
  catch { return []; }
}
function saveTopics(topics) { localStorage.setItem(KEY_TOPICS, JSON.stringify(topics)); }

function upsertTopic(topic) {
  const topics = loadTopics();
  const idx = topics.findIndex(t => t.id === topic.id);
  if (idx >= 0) topics[idx] = topic; else topics.push(topic);
  saveTopics(topics); return topics;
}

function removeTopic(id) {
  const topics = loadTopics().filter(t => t.id !== id);
  saveTopics(topics); return topics;
}

function newTopic(name, relevance, weight, area, subcategory) {
  return {
    id: crypto.randomUUID(), name: name.trim(),
    relevance: Number(relevance), weight: Number(weight),
    area: area ?? '', subcategory: subcategory ?? '',
    D: null, S: null, lastReview: null, nextReview: null,
    reps: 0, lapses: 0, history: [],
  };
}

function loadSchedule() {
  try { return JSON.parse(localStorage.getItem(KEY_SCHEDULE)) ?? []; } catch { return []; }
}
function saveSchedule(blocks) { localStorage.setItem(KEY_SCHEDULE, JSON.stringify(blocks)); }

function addScheduleBlock(date, time, title, type) {
  const blocks = loadSchedule();
  blocks.push({ id: crypto.randomUUID(), date, time, title, type, completed: false });
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
function todayBlocks(blocks) {
  const today = new Date().toISOString().split('T')[0];
  return blocks.filter(b => b.date === today).sort((a, b) => a.time.localeCompare(b.time));
}

function loadUser() {
  try { return { name: '', examDate: null, ...JSON.parse(localStorage.getItem(KEY_USER)) }; }
  catch { return { name: '', examDate: null }; }
}
function saveUser(user) { localStorage.setItem(KEY_USER, JSON.stringify(user)); }

// ── Export / Import ────────────────────────────────────────────────────────────

function exportData() {
  const data = {
    version: '2.0', exportedAt: new Date().toISOString(),
    topics: loadTopics(), schedule: loadSchedule(), user: loadUser(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `medrev-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file, onSuccess) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.topics || !Array.isArray(data.topics)) throw new Error('Formato inválido');
      saveTopics(data.topics);
      if (data.schedule) saveSchedule(data.schedule);
      if (data.user)     saveUser(data.user);
      onSuccess();
      showToast('Dados importados com sucesso!');
    } catch {
      alert('Erro ao importar: arquivo inválido ou corrompido.');
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE — Motor de Fila de Prioridade + Intercalação
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
  return topics
    .filter(isEligible)
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
// UI — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const a = new Date(dateStr); a.setHours(0,0,0,0);
  const b = new Date();        b.setHours(0,0,0,0);
  return Math.round((a - b) / 86_400_000);
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtDateLong(date) {
  return new Date(date).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}

const WEEK_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const WDAYS_PT  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

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

const AREA_COLORS = {
  'Clínica Médica':      { c:'#4F8EF7', bg:'rgba(79,142,247,0.12)'  },
  'Cirurgia':            { c:'#FF5A65', bg:'rgba(255,90,101,0.12)'  },
  'Pediatria':           { c:'#3DDC97', bg:'rgba(61,220,151,0.12)'  },
  'GO':                  { c:'#FF72B0', bg:'rgba(255,114,176,0.12)' },
  'Saúde Mental':        { c:'#9B72FF', bg:'rgba(155,114,255,0.12)' },
  'Emergência':          { c:'#FF9A3C', bg:'rgba(255,154,60,0.12)'  },
  'Medicina Preventiva': { c:'#3DD6DC', bg:'rgba(61,214,220,0.12)'  },
  'Diagnóstico':         { c:'#FFD166', bg:'rgba(255,209,102,0.12)' },
  'Outros':              { c:'#8B8FA8', bg:'rgba(139,143,168,0.12)' },
};

function areaStyle(area) {
  const col = AREA_COLORS[area] ?? AREA_COLORS['Outros'];
  return `color:${col.c};background:${col.bg}`;
}

function statusBadge(status) {
  if (status.cls === 'new')       return `<span class="badge badge-status-new">NOVO</span>`;
  if (status.cls === 'overdue')   return `<span class="badge badge-status-overdue">VENCIDO ${Math.abs(status.diff)}d</span>`;
  if (status.cls === 'due-today') return `<span class="badge badge-status-today">HOJE</span>`;
  return `<span class="badge badge-status-upcoming">em ${status.diff}d</span>`;
}
function sBadge(S) {
  if (S == null) return '';
  const cls = S < 3 ? 'badge-s-low' : S < 14 ? 'badge-s-mid' : 'badge-s-ok';
  return `<span class="badge ${cls}">S ${S.toFixed(1)}d</span>`;
}
function rBadge(R) {
  if (R == null) return '';
  const pct = Math.round(R * 100);
  return `<span class="badge ${pct<60?'badge-r-low':pct<80?'badge-r-mid':'badge-r-ok'}">R ${pct}%</span>`;
}
function areaBadge(subcategory) {
  if (!subcategory) return '';
  const sp = getSpecialty(subcategory);
  return `<span class="badge badge-area" style="${areaStyle(sp.area)}">${sp.label}</span>`;
}
function weightBadge(weight) {
  if (!weight || weight < 7) return '';
  return `<span class="badge badge-hy">⚡ ${weight}</span>`;
}
function ratingChipSmall(label) {
  return `<span class="badge rating-${label.toLowerCase()}" style="font-size:0.6rem">${label.toUpperCase()}</span>`;
}

function calculateStreak(topics) {
  const dates = new Set(topics.flatMap(t => t.history.map(s => s.date.split('T')[0])));
  let streak = 0;
  const d = new Date(); d.setHours(0,0,0,0);
  for (let i = 0; i < 365; i++) {
    const key = new Date(d.getTime() - i * 86_400_000).toISOString().split('T')[0];
    if (dates.has(key)) streak++; else break;
  }
  return streak;
}

function showToast(msg, isError = false) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.background = isError ? 'var(--red)' : 'var(--green)';
  t.style.color = isError ? '#fff' : '#000';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('show')); });
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

// ── Daily Goal ────────────────────────────────────────────────────────────────

function calcDailyGoal(topics, user) {
  const urgent = topics.filter(t => { const c = topicStatus(t).cls; return c === 'overdue' || c === 'due-today'; });
  if (!urgent.length) return 0;
  const avgLapseRate = urgent.reduce((s, t) => s + (t.reps > 0 ? t.lapses / t.reps : 0.3), 0) / urgent.length;
  const qPerTopic    = Math.max(5, Math.round(10 * (1 + avgLapseRate * 0.6)));
  if (user.examDate) {
    const daysLeft     = Math.max(1, Math.ceil((new Date(user.examDate).setHours(23,59,59,999) - Date.now()) / 86_400_000));
    const topicsPerDay = Math.max(1, Math.ceil(urgent.length / daysLeft));
    return Math.min(300, Math.max(10, topicsPerDay * qPerTopic));
  }
  return Math.min(150, Math.max(10, Math.ceil(urgent.length * 0.25) * qPerTopic));
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI — Render Functions
// ═══════════════════════════════════════════════════════════════════════════════

function renderGreeting(user, topics) {
  const h   = new Date().getHours();
  const sal = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const now = new Date();
  const sub = `${WDAYS_PT[now.getDay()]}, ${now.getDate()} de ${MONTHS_PT[now.getMonth()]}`;
  const streak = calculateStreak(topics);
  const urgent = topics.filter(t => { const s = topicStatus(t).cls; return s==='overdue'||s==='due-today'; }).length;
  document.getElementById('greeting').innerHTML = `
    <div class="greeting-hello">${sal}, ${user.name || 'Doutor(a)'}.</div>
    <div class="greeting-sub">
      ${sub}
      ${streak > 0 ? `<span class="streak-badge">🔥 ${streak} dia${streak>1?'s':''} de constância</span>` : ''}
      ${urgent > 0 ? `<span style="color:var(--orange);font-size:0.8rem">${urgent} revisão${urgent>1?'s':''} pendente${urgent>1?'s':''}</span>` : ''}
    </div>`;
}

function renderExamCountdown(user) {
  const el = document.getElementById('exam-countdown');
  if (!el) return;
  if (!user.examDate) {
    el.innerHTML = `
      <div class="countdown-widget countdown-empty">
        <span style="font-size:0.8rem;color:var(--text-muted)">Sem data de exame configurada.</span>
        <button class="btn-ghost" style="font-size:0.72rem;padding:0.3rem 0.7rem" data-page="settings">⚙ Configurar</button>
      </div>`;
    return;
  }
  const examTs  = new Date(user.examDate).setHours(23, 59, 59, 999);
  const days    = Math.ceil((examTs - Date.now()) / 86_400_000);
  const cls     = days <= 0 ? 'c-red' : days <= 7 ? 'c-red' : days <= 30 ? 'c-orange' : 'c-accent';
  const examFmt = new Date(user.examDate + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  if (days <= 0) {
    el.innerHTML = `<div class="countdown-widget"><div class="countdown-days c-red">—</div><div><div class="countdown-main">Exame já passou</div><div class="countdown-sub">${examFmt}</div></div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="countdown-widget">
      <div class="countdown-days ${cls}">${days}</div>
      <div>
        <div class="countdown-main">Faltam <strong>${days} dia${days!==1?'s':''}</strong> para o Exame Alvo</div>
        <div class="countdown-sub">${examFmt}</div>
      </div>
    </div>`;
}

function renderSidebarUser(user) {
  const initial = (user.name || '?')[0].toUpperCase();
  document.getElementById('sidebar-user').innerHTML = `
    <div class="user-avatar">${initial}</div>
    <div><div class="user-name">${user.name || 'Usuário'}</div><div class="user-label">Residente</div></div>`;
}

function renderMobileStats(topics) {
  const urgent = topics.filter(t => { const s = topicStatus(t).cls; return s==='overdue'||s==='due-today'; }).length;
  document.getElementById('mobile-stats').innerHTML =
    `<div><span class="mobile-stat-n ${urgent>0?'c-red':''}">${urgent}</span></div>`;
}

function renderDashStats(topics, user) {
  const urgent   = topics.filter(t => { const c = topicStatus(t).cls; return c==='overdue'||c==='due-today'; }).length;
  const studied  = topics.filter(t => t.S != null);
  const avgR     = studied.length ? studied.reduce((s,t) => s+(currentR(t)??0),0)/studied.length : null;
  const avgS     = studied.length ? studied.reduce((s,t) => s+t.S,0)/studied.length : null;
  const streak   = calculateStreak(topics);
  const goal     = calcDailyGoal(topics, user);

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card">
      <span class="stat-card-n ${urgent>0?'c-red':''}">${urgent}</span>
      <span class="stat-card-l">Para Revisar</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-n ${avgR!=null&&avgR>=0.8?'c-green':avgR!=null?'c-orange':''}">${avgR!=null?Math.round(avgR*100)+'%':'—'}</span>
      <span class="stat-card-l">Retenção Média</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-n">${avgS!=null?avgS.toFixed(1)+'d':'—'}</span>
      <span class="stat-card-l">Estabilidade Média</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-n ${streak>0?'c-orange':''}">${streak}</span>
      <span class="stat-card-l">Dias Seguidos</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-n c-accent">${goal > 0 ? goal : '✓'}</span>
      <span class="stat-card-l">Meta de Questões</span>
    </div>`;
}

function renderPerformanceTable(topics) {
  const el = document.getElementById('perf-table-wrap');
  if (!el) return;

  const agg = {};
  topics.forEach(t => {
    const area = t.area || getSpecialty(t.subcategory).area || 'Outros';
    if (!agg[area]) agg[area] = { count: 0, rSum: 0, rCount: 0 };
    agg[area].count++;
    const R = currentR(t);
    if (R != null) { agg[area].rSum += R; agg[area].rCount++; }
  });

  const rows = Object.entries(AREA_INCIDENCE).map(([area, inc]) => {
    const d    = agg[area] || { count:0, rSum:0, rCount:0 };
    const avgR = d.rCount > 0 ? d.rSum / d.rCount : null;
    return { area, inc, count: d.count, avgR };
  });

  const tbody = rows.map(r => {
    const rPct = r.avgR != null ? Math.round(r.avgR * 100) : null;
    const rClr = rPct == null ? 'var(--text-muted)' : rPct >= 80 ? 'var(--green)' : rPct >= 60 ? 'var(--orange)' : 'var(--red)';
    let priority, priCls;
    if (rPct == null)                        { priority = '—';       priCls = ''; }
    else if (rPct < 70 && r.inc >= 10)       { priority = 'CRÍTICO'; priCls = 'badge-status-overdue'; }
    else if (rPct < 85 && r.inc >= 5)        { priority = 'ATENÇÃO'; priCls = 'badge-hy'; }
    else                                      { priority = 'OK';      priCls = 'badge-status-upcoming'; }

    return `<tr>
      <td><span class="badge badge-area" style="${areaStyle(r.area)}">${r.area}</span></td>
      <td style="font-weight:600">${r.count}</td>
      <td>
        ${rPct != null ? `
          <span style="font-weight:700;color:${rClr}">${rPct}%</span>
          <div class="perf-mini-bar"><div class="perf-mini-fill" style="width:${rPct}%;background:${rClr}"></div></div>
        ` : '<span style="color:var(--text-muted)">Sem dados</span>'}
      </td>
      <td>
        <span style="font-weight:700;color:var(--accent)">${r.inc}%</span>
        <div class="perf-mini-bar"><div class="perf-mini-fill" style="width:${r.inc*2}%;background:var(--accent)"></div></div>
      </td>
      <td>${priority !== '—' ? `<span class="badge ${priCls}">${priority}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = topics.length === 0
    ? `<div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.82rem;background:var(--bg-card);border:var(--border);border-radius:var(--radius)">Cadastre tópicos para ver a análise de desempenho.</div>`
    : `<table class="perf-table">
        <thead>
          <tr>
            <th>Grande Área</th><th>Tópicos</th>
            <th>Retenção Média (FSRS)</th><th>Incidência em Prova</th><th>Prioridade</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>`;
}

function renderScheduleWidget(schedule) {
  const blocks = todayBlocks(schedule);
  const done   = blocks.filter(b => b.completed).length;
  const total  = blocks.length;
  const el     = document.getElementById('schedule-widget');
  if (!total) {
    el.innerHTML = `<div class="schedule-card"><div class="schedule-empty">Nenhum bloco programado para hoje.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="schedule-card">
      <div class="schedule-progress-bar">
        <div class="schedule-progress-fill" style="width:${total?Math.round(done/total*100):0}%"></div>
      </div>
      <div class="schedule-rows">
        ${blocks.map(b => `
          <div class="schedule-row type-${b.type} ${b.completed?'completed':''}">
            <button class="schedule-check ${b.completed?'done':''}"
                    data-action="toggle-block" data-id="${b.id}">${b.completed?'✓':''}</button>
            <span class="schedule-time">${b.time}</span>
            <span class="schedule-title">${b.title}</span>
            <span class="schedule-type-dot"></span>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderPriorityQueue(queue) {
  const el    = document.getElementById('priority-queue');
  const shown = queue.slice(0, 5);
  if (!shown.length) {
    el.innerHTML = `<div class="queue-card"><div class="queue-empty">✓ Nenhuma revisão pendente agora.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="queue-card">
      ${shown.map((t, i) => `
        <div class="queue-row">
          <span class="queue-rank">${i+1}</span>
          <div class="queue-info">
            <div class="queue-name">${t.name}</div>
            <div class="queue-meta">
              ${areaBadge(t.subcategory)}
              ${weightBadge(t.weight)}
              ${statusBadge(topicStatus(t))}
            </div>
          </div>
          <div class="queue-score">
            <div class="queue-score-bar"><div class="queue-score-fill" style="width:${Math.round((t._score??0)*100)}%"></div></div>
            <span class="queue-score-val">${((t._score??0)*100).toFixed(0)}pts</span>
          </div>
          <button class="btn-primary" style="font-size:0.7rem;padding:0.35rem 0.7rem"
                  data-action="study" data-id="${t.id}">Estudar</button>
        </div>`).join('')}
    </div>
    ${queue.length > 5 ? `<p style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem;text-align:center">+${queue.length-5} tópicos na fila</p>` : ''}`;
}

function renderDashChart(topics) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i)); d.setHours(0,0,0,0);
    return { date: d, label: WEEK_DAYS[d.getDay()], count: 0, isToday: i===6 };
  });
  topics.forEach(t => t.history.forEach(s => {
    const sd = new Date(s.date); sd.setHours(0,0,0,0);
    const day = days.find(d => d.date.getTime() === sd.getTime());
    if (day) day.count++;
  }));
  const max = Math.max(...days.map(d => d.count), 1);
  document.getElementById('dash-chart').innerHTML = days.map(d => `
    <div class="chart-col ${d.isToday?'today':''}">
      <span class="chart-col-count">${d.count||''}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar ${d.count>0?'has-data':''}"
             style="height:${d.count>0?Math.max(10,Math.round(d.count/max*100))+'%':'100%'}"></div>
      </div>
      <span class="chart-col-label">${d.label}</span>
    </div>`).join('');
}

function renderDashDist(topics) {
  const dist = { critical:0, risk:0, retained:0, solid:0, new:0 };
  topics.forEach(t => {
    const R = currentR(t);
    if (R==null)    dist.new++;
    else if(R<0.6)  dist.critical++;
    else if(R<0.8)  dist.risk++;
    else if(R<0.95) dist.retained++;
    else            dist.solid++;
  });
  const total = topics.length || 1;
  const pct   = n => n ? `${Math.round(n/total*100)}%` : '0%';
  document.getElementById('dash-dist').innerHTML = `
    <div class="dist-bar">
      <div class="dist-seg dist-critical" style="width:${pct(dist.critical)}"></div>
      <div class="dist-seg dist-risk"     style="width:${pct(dist.risk)}"></div>
      <div class="dist-seg dist-retained" style="width:${pct(dist.retained)}"></div>
      <div class="dist-seg dist-solid"    style="width:${pct(dist.solid)}"></div>
      <div class="dist-seg dist-new"      style="width:${pct(dist.new)}"></div>
    </div>
    <div class="dist-legend">
      <span class="dist-item"><span class="dist-dot" style="background:var(--red)"></span>Crítico R&lt;60% — ${dist.critical}</span>
      <span class="dist-item"><span class="dist-dot" style="background:var(--orange)"></span>Em risco 60–80% — ${dist.risk}</span>
      <span class="dist-item"><span class="dist-dot" style="background:var(--accent)"></span>Retido 80–95% — ${dist.retained}</span>
      <span class="dist-item"><span class="dist-dot" style="background:var(--green)"></span>Sólido &gt;95% — ${dist.solid}</span>
      <span class="dist-item"><span class="dist-dot" style="background:var(--bg-input);border:1px solid #3A3E55"></span>Novo — ${dist.new}</span>
    </div>`;
}

function topicCard(topic) {
  const status = topicStatus(topic), R = currentR(topic);
  return `
<div class="card card-${status.cls}" data-id="${topic.id}" role="listitem">
  <div class="card-header">
    <span class="card-title">${topic.name}</span>
    ${statusBadge(status)}
  </div>
  <div class="card-badges">
    ${topic.area ? `<span class="badge badge-area" style="${areaStyle(topic.area)}">${topic.area}</span>` : areaBadge(topic.subcategory)}
    ${weightBadge(topic.weight)}
    ${sBadge(topic.S)}
    ${rBadge(R)}
    ${topic.reps > 0 ? `<span class="badge badge-status-upcoming">${topic.reps} sess.</span>` : ''}
  </div>
  <div class="card-actions-row">
    <span style="font-size:0.7rem;color:var(--text-muted)">R★ ${Math.round(targetRetention(topic.relevance)*100)}% · próx. ${fmtDate(topic.nextReview)}</span>
    <div style="display:flex;gap:0.4rem">
      <button class="btn-primary" style="font-size:0.75rem;padding:0.4rem 0.85rem"
              data-action="study" data-id="${topic.id}">Estudar</button>
      <button class="btn-icon" data-action="delete" data-id="${topic.id}" title="Excluir">×</button>
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
    const sa=topicStatus(a), sb=topicStatus(b);
    const oa=order[sa.cls]??9, ob=order[sb.cls]??9;
    if(oa!==ob) return oa-ob;
    if(sa.diff!=null&&sb.diff!=null) return sa.diff-sb.diff;
    return a.name.localeCompare(b.name);
  });
}

function renderTopicList(topics, sortBy, query='') {
  const list  = document.getElementById('topic-list');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('topics-count');
  const sorted = sortTopics(topics, sortBy, query);
  if (count) count.textContent = `${topics.length} tópico${topics.length!==1?'s':''}`;
  if (!sorted.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = sorted.map(topicCard).join('');
}

function renderSchedulePage(schedule) {
  const empty = document.getElementById('schedule-empty');
  const list  = document.getElementById('schedule-list');
  if (!schedule.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const groups = {};
  [...schedule].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).forEach(b => {
    const key = new Date(b.date+'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });
  list.innerHTML = Object.entries(groups).map(([date, blocks]) => `
    <div class="schedule-group">
      <div class="schedule-group-date">${date}</div>
      ${blocks.map(b => `
        <div class="schedule-full-row type-${b.type} ${b.completed?'completed':''}">
          <button class="schedule-check ${b.completed?'done':''}"
                  data-action="toggle-block" data-id="${b.id}">${b.completed?'✓':''}</button>
          <span class="schedule-time">${b.time}</span>
          <span class="schedule-title">${b.title}</span>
          <span class="schedule-type-badge">${{study:'Estudo',review:'Revisão FSRS',simulation:'Simulado'}[b.type]||b.type}</span>
          <button class="btn-icon" data-action="delete-block" data-id="${b.id}" title="Remover">×</button>
        </div>`).join('')}
    </div>`).join('');
}

const ERROR_LABELS = {
  knowledge: { label:'Falta de Conhecimento', cls:'error-knowledge' },
  confusion:  { label:'Confusão / Distração',  cls:'error-confusion' },
  clinical:   { label:'Aplicação Clínica',     cls:'error-clinical'  },
};

function renderHistory(topics) {
  const empty = document.getElementById('history-empty');
  const list  = document.getElementById('history-list');
  const count = document.getElementById('history-count');
  const rows  = topics.flatMap(t => t.history.map(s => ({ ...s, topicName:t.name })));
  if (count) count.textContent = `${rows.length} sessão${rows.length!==1?'s':''}`;
  if (!rows.length) { list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  rows.sort((a,b) => new Date(b.date)-new Date(a.date));
  const groups = {};
  rows.forEach(r => {
    const key = new Date(r.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  list.innerHTML = Object.entries(groups).map(([date, sessions]) => `
    <div class="history-group">
      <div class="history-date-label">${date}</div>
      ${sessions.map(s => {
        const err = s.errorType ? ERROR_LABELS[s.errorType] : null;
        return `
        <div class="history-row">
          ${ratingChipSmall(s.label)}
          <span class="history-name">${s.topicName}</span>
          <span class="history-detail">${s.hits}/${s.Q}</span>
          <span class="history-detail">E=${s.E}</span>
          <span class="history-detail">S=${s.S.toFixed(1)}d</span>
          <span class="history-detail">+${s.interval}d</span>
          ${err ? `<span class="error-tag ${err.cls}">${err.label}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`).join('');
}

function renderStudyState(topic) {
  const R = currentR(topic), rPct = R!=null?Math.round(R*100)+'%':'—';
  const rCls = R==null?'':R<0.6?'c-red':R<0.8?'c-orange':'c-green';
  document.getElementById('study-state').innerHTML = `
    <div class="state-item"><span class="state-val ${rCls}">${rPct}</span><span class="state-key">Retenção Atual</span></div>
    <div class="state-item"><span class="state-val">${topic.D!=null?topic.D.toFixed(1):'—'}</span><span class="state-key">Dificuldade (D)</span></div>
    <div class="state-item"><span class="state-val">${topic.S!=null?topic.S.toFixed(1)+'d':'—'}</span><span class="state-key">Estabilidade (S)</span></div>
    <div class="state-item"><span class="state-val">${fmtDate(topic.nextReview)}</span><span class="state-key">Próx. Revisão</span></div>`;
}

function renderStudyResult(result, topic) {
  document.getElementById('res-rating').innerHTML = `
    <span class="rating-chip rating-${result.label.toLowerCase()}">${result.label.toUpperCase()}</span>
    <span class="rating-e">E = ${result.E} · A = ${Math.round(result.A*100)}% bruta · C = ${Math.round(result.C*100)}% vol.</span>`;
  const prevD = topic.D!=null?topic.D.toFixed(1):'—', prevS = topic.S!=null?topic.S.toFixed(1)+'d':'—';
  document.getElementById('res-grid').innerHTML = `
    <div class="res-cell"><span class="res-val">${result.D.toFixed(1)}</span><span class="res-key">Dificuldade</span><span class="res-prev">${prevD} → ${result.D.toFixed(1)}</span></div>
    <div class="res-cell"><span class="res-val">${result.S.toFixed(1)}d</span><span class="res-key">Estabilidade</span><span class="res-prev">${prevS} → ${result.S.toFixed(1)}d</span></div>
    <div class="res-cell"><span class="res-val ${result.R<0.6?'c-red':result.R<0.8?'c-orange':'c-green'}">${Math.round(result.R*100)}%</span><span class="res-key">Retenção (R)</span><span class="res-prev">momento da sessão</span></div>
    <div class="res-cell"><span class="res-val">${Math.round(result.R_target*100)}%</span><span class="res-key">R★ Alvo</span><span class="res-prev">rel. ${topic.relevance}/5</span></div>`;
  document.getElementById('res-next').innerHTML = `
    <span class="next-interval">+${result.interval} dias</span>
    <span class="next-date">Próxima revisão: <strong>${fmtDateLong(result.nextReviewDate)}</strong></span>`;
}

function renderSettingsPage(user) {
  const inp = document.getElementById('in-exam-date');
  if (inp && user.examDate) inp.value = user.examDate;
}

// ── Dropdown helpers ──────────────────────────────────────────────────────────

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

// ── Page navigation ───────────────────────────────────────────────────────────

function switchPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`pg-${id}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('nav-active', b.dataset.page === id);
  });
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function showPane(id) {
  ['pane-input','pane-error-taxonomy','pane-result'].forEach(p => {
    document.getElementById(p)?.classList.add('hidden');
  });
  document.getElementById(id)?.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════

const state = {
  topics: [], schedule: [], user: { name: '', examDate: null },
  dailyQueue: [], sortBy: 'due', filterArea: '', searchQuery: '',
  activePage: 'dashboard', activeTopic: null, pendingResult: null,
};

function refresh() {
  state.dailyQueue = getDailyQueue(state.topics);
  const scoreMap   = Object.fromEntries(state.dailyQueue.map(t => [t.id, t._score ?? 0]));
  state.topics     = state.topics.map(t => ({ ...t, _score: scoreMap[t.id] ?? 0 }));

  renderGreeting(state.user, state.topics);
  renderExamCountdown(state.user);
  renderSidebarUser(state.user);
  renderMobileStats(state.topics);
  renderDashStats(state.topics, state.user);
  renderDailyGoal(state.topics);
  renderScheduleWidget(state.schedule);
  renderPriorityQueue(state.dailyQueue);
  renderDashChart(state.topics);
  renderDashDist(state.topics);
  renderPerformanceTable(state.topics);
  renderTopicList(state.topics, state.sortBy, state.searchQuery);
  renderSchedulePage(state.schedule);
  renderHistory(state.topics);
}

function init() {
  state.user     = loadUser();
  state.topics   = loadTopics();
  state.schedule = loadSchedule();

  populateAreasDropdown('in-area');
  populateAreaFilter();
  setDefaultBlockDate();

  switchPage('dashboard');
  refresh();
  bindEvents();

  if (!state.user.name) {
    openModal('modal-onboarding');
    document.getElementById('in-username')?.focus();
  }
}

function bindEvents() {

  // ── Navegação por página (delegação — funciona em botões dinâmicos também) ──
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    const page = btn.dataset.page;
    if (['dashboard','schedule','topics','history','settings'].includes(page)) {
      state.activePage = page;
      switchPage(page);
      if (page === 'settings') renderSettingsPage(state.user);
      closeSidebarOnMobile();
    }
  });

  // ── Hamburger ────────────────────────────────────────────────────────────────
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ── Fechar modais ────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]');
    if (close) { closeModal(close.dataset.close); }
  });
  document.getElementById('overlay').addEventListener('click', closeAllModals);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  // ── Ações delegadas ──────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'study')        openStudyModal(id);
    if (action === 'delete')       deleteTopic(id);
    if (action === 'toggle-block') toggleBlock(id);
    if (action === 'delete-block') deleteBlock(id);
  });

  // ── Onboarding ───────────────────────────────────────────────────────────────
  document.getElementById('form-onboarding').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('in-username').value.trim();
    if (!name) return;
    state.user = { ...state.user, name };
    saveUser(state.user);
    closeModal('modal-onboarding');
    refresh();
  });

  // ── Novo tópico ──────────────────────────────────────────────────────────────
  document.getElementById('btn-new').addEventListener('click', () => {
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
  });

  document.getElementById('in-area').addEventListener('change', e => {
    populateSpecialtiesByArea(e.target.value, 'in-subcategory');
  });

  document.getElementById('in-rel').addEventListener('input', e => {
    document.getElementById('rel-val').textContent      = e.target.value;
    document.getElementById('r-target-val').textContent = `${(targetRetention(Number(e.target.value))*100).toFixed(1)}%`;
  });
  document.getElementById('in-weight').addEventListener('input', e => {
    document.getElementById('weight-val').textContent = e.target.value;
  });
  document.getElementById('form-new').addEventListener('submit', e => {
    e.preventDefault(); submitNewTopic();
  });

  // ── Filtros / busca ──────────────────────────────────────────────────────────
  document.getElementById('sort-select').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery);
  });
  document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery);
  });
  document.getElementById('filter-area').addEventListener('change', e => {
    state.filterArea = e.target.value;
    const filtered = state.filterArea
      ? state.topics.filter(t => (t.area || getSpecialty(t.subcategory).area) === state.filterArea)
      : state.topics;
    renderTopicList(filtered, state.sortBy, state.searchQuery);
  });

  // ── Sessão de estudo ─────────────────────────────────────────────────────────
  ['in-q','in-hits'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateAccuracyBar);
  });
  document.getElementById('form-study').addEventListener('submit', e => {
    e.preventDefault(); submitStudySession();
  });
  document.getElementById('btn-confirm').addEventListener('click', confirmResult);
  document.getElementById('btn-redo').addEventListener('click', () => {
    state.pendingResult = null; showPane('pane-input');
  });
  document.querySelectorAll('.taxonomy-btn').forEach(btn => {
    btn.addEventListener('click', () => selectErrorType(btn.dataset.error));
  });

  // ── Agenda ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-add-block')?.addEventListener('click', () => {
    document.getElementById('form-block').reset();
    setDefaultBlockDate();
    openModal('modal-block');
  });
  document.getElementById('form-block').addEventListener('submit', e => {
    e.preventDefault(); submitAddBlock();
  });

  // ── Ajustes ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const examDate = document.getElementById('in-exam-date').value || null;
    state.user     = { ...state.user, examDate };
    saveUser(state.user);
    renderExamCountdown(state.user);
    renderDashStats(state.topics, state.user);
    showToast('Ajustes salvos!');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    exportData();
    showToast('Backup exportado!');
  });

  document.getElementById('in-import').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    importData(file, () => {
      state.topics   = loadTopics();
      state.schedule = loadSchedule();
      state.user     = loadUser();
      renderSettingsPage(state.user);
      refresh();
    });
    e.target.value = '';
  });

  // ── Otimizar fila ─────────────────────────────────────────────────────────────
  document.getElementById('btn-optimize').addEventListener('click', () => {
    refresh();
    showToast('Fila de prioridades recalculada!');
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function closeSidebarOnMobile() {
  document.getElementById('sidebar')?.classList.remove('open');
}

function closeAllModals() {
  ['modal-new','modal-study','modal-block'].forEach(closeModal);
}

function setDefaultBlockDate() {
  const inp = document.getElementById('in-block-date');
  if (inp) inp.value = new Date().toISOString().split('T')[0];
}

// ── Novo tópico ───────────────────────────────────────────────────────────────

function submitNewTopic() {
  const nameEl = document.getElementById('in-name');
  const areaEl = document.getElementById('in-area');
  const errName = document.getElementById('err-name');
  const errArea = document.getElementById('err-area');

  let valid = true;
  if (!nameEl.value.trim()) { errName.classList.remove('hidden'); nameEl.focus(); valid = false; }
  else errName.classList.add('hidden');
  if (!areaEl.value) { errArea.classList.remove('hidden'); if (valid) areaEl.focus(); valid = false; }
  else errArea.classList.add('hidden');
  if (!valid) return;

  const topic = newTopic(
    nameEl.value,
    document.getElementById('in-rel').value,
    document.getElementById('in-weight').value,
    areaEl.value,
    document.getElementById('in-subcategory').value,
  );
  state.topics = upsertTopic(topic);
  closeModal('modal-new');
  refresh();
}

// ── Estudo ────────────────────────────────────────────────────────────────────

function openStudyModal(id) {
  state.activeTopic   = state.topics.find(t => t.id === id);
  state.pendingResult = null;
  if (!state.activeTopic) return;
  document.getElementById('study-name').textContent = state.activeTopic.name;
  renderStudyState(state.activeTopic);
  document.getElementById('form-study').reset();
  document.getElementById('acc-bar').style.width  = '0%';
  document.getElementById('acc-pct').textContent  = '—';
  document.getElementById('e-preview-row').style.display = 'none';
  document.getElementById('err-study').classList.add('hidden');
  showPane('pane-input');
  openModal('modal-study');
  document.getElementById('in-q')?.focus();
}

function updateAccuracyBar() {
  const Q    = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const bar  = document.getElementById('acc-bar');
  const pct  = document.getElementById('acc-pct');
  const prev = document.getElementById('e-preview-row');
  if (!Q || Q < 1 || isNaN(hits)) {
    bar.style.width = '0%'; pct.textContent = '—'; prev.style.display = 'none'; return;
  }
  const safeHits = Math.min(hits, Q), A = safeHits / Q;
  bar.style.width = `${A*100}%`;
  pct.textContent = `${Math.round(A*100)}%`;
  bar.style.background = A < 0.60 ? 'var(--red)' : A < 0.75 ? 'var(--orange)' : A < 0.90 ? 'var(--accent)' : 'var(--green)';
  try {
    const { label, E } = deriveRating(Q, safeHits);
    document.getElementById('e-preview').textContent = `E = ${E} → ${label.toUpperCase()}`;
    prev.style.display = 'flex';
  } catch { prev.style.display = 'none'; }
}

function submitStudySession() {
  const Q     = parseInt(document.getElementById('in-q').value, 10);
  const hits  = parseInt(document.getElementById('in-hits').value, 10);
  const errEl = document.getElementById('err-study');
  if (!Q||Q<1||isNaN(hits)||hits<0||hits>Q) {
    errEl.textContent = hits>Q ? 'Acertos não pode exceder questões.' : 'Preencha os campos corretamente.';
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
  const updated = {
    ...state.activeTopic,
    D: result.D, S: result.S,
    lastReview: new Date().toISOString(),
    nextReview: result.nextReviewDate.toISOString(),
    reps:    state.activeTopic.reps + 1,
    lapses:  state.activeTopic.lapses + (result.rating===1 ? 1 : 0),
    history: [
      ...state.activeTopic.history,
      { date: new Date().toISOString(), Q, hits, rating: result.rating, label: result.label,
        E: result.E, D: result.D, S: result.S, interval: result.interval,
        errorType: result.rating===1 ? errorType : null },
    ],
  };
  state.topics      = upsertTopic(updated);
  state.activeTopic = null; state.pendingResult = null;
  closeModal('modal-study');
  refresh();
}

// ── Exclusão de tópico ────────────────────────────────────────────────────────

function deleteTopic(id) {
  const t = state.topics.find(t => t.id === id);
  if (!t || !confirm(`Excluir "${t.name}"?\nEsta ação não pode ser desfeita.`)) return;
  state.topics = removeTopic(id);
  refresh();
}

// ── Agenda ────────────────────────────────────────────────────────────────────

function submitAddBlock() {
  const date  = document.getElementById('in-block-date').value;
  const time  = document.getElementById('in-block-time').value;
  const title = document.getElementById('in-block-title').value.trim();
  const type  = document.getElementById('in-block-type').value;
  if (!date || !time || !title) return;
  state.schedule = addScheduleBlock(date, time, title, type);
  closeModal('modal-block');
  renderScheduleWidget(state.schedule);
  renderSchedulePage(state.schedule);
}

function toggleBlock(id) {
  state.schedule = toggleScheduleBlock(id);
  renderScheduleWidget(state.schedule);
  renderSchedulePage(state.schedule);
  renderGreeting(state.user, state.topics);
  renderDashStats(state.topics, state.user);
}

function deleteBlock(id) {
  if (!confirm('Remover este bloco?')) return;
  state.schedule = removeScheduleBlock(id);
  renderScheduleWidget(state.schedule);
  renderSchedulePage(state.schedule);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — Countdown de Data da Prova
// ═══════════════════════════════════════════════════════════════════════════════

function renderExamCountdown(user) {
  const el = document.getElementById('exam-countdown');
  if (!user.examDate) {
    el.innerHTML = '';
    return;
  }
  const days = daysDiff(user.examDate);
  if (days === null || days < 0) {
    el.innerHTML = '';
    return;
  }
  const urgency = days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'normal';
  el.innerHTML = `
    <div class="exam-countdown exam-countdown-${urgency}">
      <div class="countdown-number">${days}</div>
      <div class="countdown-text">
        <div class="countdown-label">DIAS PARA O EXAME ALVO</div>
        <div class="countdown-date">${fmtDate(user.examDate)}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — Tabela de Desempenho por Área
// ═══════════════════════════════════════════════════════════════════════════════

function renderPerformanceTable(topics) {
  const el = document.getElementById('perf-table-wrap');

  // Agrupa tópicos por área
  const byArea = {};
  topics.forEach(t => {
    const area = t.area || 'Outros';
    if (!byArea[area]) byArea[area] = [];
    byArea[area].push(t);
  });

  // Calcula métricas por área
  const rows = Object.entries(byArea).map(([area, areaTopics]) => {
    const studied = areaTopics.filter(t => t.S != null);
    const avgRetention = studied.length
      ? studied.reduce((s, t) => s + (currentR(t) ?? 0), 0) / studied.length
      : null;
    const incidence = AREA_INCIDENCE[area] ?? 0;
    const topicCount = areaTopics.length;
    const reviewableCount = areaTopics.filter(t => isEligible(t)).length;

    return { area, incidence, topicCount, reviewableCount, avgRetention, studied: studied.length };
  }).sort((a, b) => b.incidence - a.incidence);

  if (!rows.length) {
    el.innerHTML = '<div class="perf-empty">Nenhum tópico cadastrado ainda.</div>';
    return;
  }

  const tableHtml = `
    <table class="perf-table">
      <thead>
        <tr>
          <th>Área</th>
          <th>Incidência</th>
          <th>Tópicos</th>
          <th>Revisáveis</th>
          <th>Retenção Média</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const rPct = r.avgRetention != null ? Math.round(r.avgRetention * 100) + '%' : '—';
          const rCls = r.avgRetention == null ? '' : r.avgRetention < 0.6 ? 'c-red' : r.avgRetention < 0.8 ? 'c-orange' : 'c-green';
          return `<tr class="perf-row">
            <td class="perf-area" style="${areaStyle(r.area)}">${r.area}</td>
            <td class="perf-incidence">${r.incidence}%</td>
            <td class="perf-count">${r.studied}/${r.topicCount}</td>
            <td class="perf-reviewable">${r.reviewableCount}</td>
            <td class="perf-retention"><span class="${rCls}">${rPct}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  el.innerHTML = tableHtml;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — Meta de Questões Diária
// ═══════════════════════════════════════════════════════════════════════════════

function calculateDailyQuestionGoal(topics) {
  // Conta cards elegíveis para hoje
  const eligible = topics.filter(isEligible);
  if (!eligible.length) return 0;

  // Calcula dificuldade média histórica
  const withHistory = eligible.filter(t => t.history.length > 0);
  const avgDifficulty = withHistory.length
    ? withHistory.reduce((s, t) => s + (t.D ?? 5), 0) / withHistory.length
    : 5;

  // Fórmula: (cards elegíveis × 5) + (ajuste por dificuldade × cards)
  // Dificuldade alta (D > 6) → mais questões por card
  // Dificuldade baixa (D < 4) → menos questões por card
  const baseQuestionsPerCard = avgDifficulty > 6 ? 8 : avgDifficulty > 4 ? 5 : 3;
  return Math.max(5, Math.round(eligible.length * baseQuestionsPerCard));
}

function renderDailyGoal(topics) {
  const goal = calculateDailyQuestionGoal(topics);
  const goalEl = document.getElementById('daily-goal');
  if (!goalEl) return;

  const studied = topics.flatMap(t => t.history.filter(s => s.date.split('T')[0] === new Date().toISOString().split('T')[0]));
  const questionsToday = studied.reduce((s, h) => s + h.Q, 0);

  const pct = Math.min(100, Math.round((questionsToday / goal) * 100));
  const statusText = questionsToday >= goal ? '✓ META ATINGIDA' : `${goal - questionsToday} questões restantes`;

  goalEl.innerHTML = `
    <div class="daily-goal-card">
      <div class="daily-goal-bar">
        <div class="daily-goal-fill" style="width:${pct}%"></div>
      </div>
      <div class="daily-goal-row">
        <div>
          <span class="daily-goal-label">Meta Diária</span>
          <span class="daily-goal-number">${goal}</span>
        </div>
        <div class="daily-goal-status ${questionsToday >= goal ? 'complete' : ''}">${statusText}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4 — Otimização FSRS + Export/Import
// ═══════════════════════════════════════════════════════════════════════════════

function optimizeFSRS() {
  // Recalcula a fila de prioridades sem alterar os dados FSRS
  state.dailyQueue = getDailyQueue(state.topics);
  renderPriorityQueue(state.dailyQueue);
  showToast('Fila de prioridades otimizada!');
}

function openExamDateModal() {
  const modal = document.getElementById('modal-exam-date');
  const inp = document.getElementById('in-exam-date');
  if (inp && state.user.examDate) inp.value = state.user.examDate;
  openModal('modal-exam-date');
  inp?.focus();
}

function submitExamDate() {
  const dateStr = document.getElementById('in-exam-date').value;
  if (!dateStr) {
    alert('Digite uma data válida.');
    return;
  }
  state.user.examDate = dateStr;
  saveUser(state.user);
  closeModal('modal-exam-date');
  renderExamCountdown(state.user);
  renderGreeting(state.user, state.topics);
  showToast('Data do exame atualizada!');
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings Page Render
// ═══════════════════════════════════════════════════════════════════════════════

function renderSettingsPage() {
  const el = document.getElementById('pg-settings');
  if (!el) return;

  el.innerHTML = `
    <div class="page-head">
      <h2 class="page-title">Ajustes</h2>
      <p class="page-sub">Configure seu perfil e dados</p>
    </div>

    <div class="settings-section">
      <h3 class="settings-heading">Perfil</h3>
      <div class="settings-item">
        <label>Nome</label>
        <input type="text" id="in-settings-name" class="input" value="${state.user.name || ''}" placeholder="Seu nome">
        <button class="btn-secondary btn-sm" onclick="saveProfiling()">Salvar Nome</button>
      </div>

      <div class="settings-item">
        <label>Data do Exame Alvo</label>
        <div style="display:flex;gap:0.75rem">
          <input type="date" id="in-exam-date-display" class="input" value="${state.user.examDate || ''}" placeholder="YYYY-MM-DD">
          <button class="btn-secondary btn-sm" onclick="submitExamDate()">Definir</button>
        </div>
        <p class="settings-hint">Será exibido um contador regressivo no dashboard</p>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-heading">Backup & Dados</h3>
      <div class="settings-item">
        <p class="settings-hint">Exporte seus dados em JSON para backup local offline</p>
        <button class="btn-secondary" onclick="exportData()">📥 Exportar Dados (JSON)</button>
      </div>
      <div class="settings-item">
        <p class="settings-hint">Importe dados de um backup anterior para restaurar</p>
        <input type="file" id="import-file" class="input" accept=".json" style="display:none">
        <button class="btn-secondary" onclick="document.getElementById('import-file').click()">📤 Importar Dados (JSON)</button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-heading">Informações</h3>
      <div class="settings-info">
        <p><strong>Versão:</strong> 2.0 (FSRS-4.5 + Métricas)</p>
        <p><strong>Dados:</strong> Armazenados localmente no navegador</p>
        <p><strong>Backup:</strong> Manual em JSON, sem sincronização em nuvem</p>
      </div>
    </div>`;

  // Bind import handler
  document.getElementById('import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0], () => {
      state.topics = loadTopics();
      state.schedule = loadSchedule();
      state.user = loadUser();
      state.dailyQueue = getDailyQueue(state.topics);
      refresh();
    });
  });

  // Sincroniza campo de data do exame com o state
  const dateInput = document.getElementById('in-exam-date-display');
  if (dateInput) {
    dateInput.addEventListener('change', e => {
      document.getElementById('in-exam-date').value = e.target.value;
    });
  }
}

function saveProfiling() {
  const name = document.getElementById('in-settings-name').value.trim();
  if (!name) return;
  state.user.name = name;
  saveUser(state.user);
  renderSidebarUser(state.user);
  renderGreeting(state.user, state.topics);
  showToast('Perfil atualizado!');
}

document.addEventListener('DOMContentLoaded', init);
