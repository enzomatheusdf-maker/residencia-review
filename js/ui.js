/**
 * ui.js — Renderização do DOM
 * Funções puras que recebem dados e atualizam o DOM. Sem estado próprio.
 */

import { retrievability, targetRetention } from './algorithm.js';

// ─── Helpers de data ──────────────────────────────────────────────────────────

function todayMidnight() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

export function daysDiff(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - todayMidnight()) / 86_400_000);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateFull(date) {
  return new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Status do tópico ─────────────────────────────────────────────────────────

export function topicStatus(topic) {
  if (!topic.nextReview) return { cls: 'new', diff: null };
  const diff = daysDiff(topic.nextReview);
  if (diff < 0)   return { cls: 'overdue',   diff };
  if (diff === 0) return { cls: 'due-today', diff };
  return               { cls: 'upcoming',   diff };
}

// ─── Retenção atual (calculada no momento do render) ──────────────────────────

export function currentR(topic) {
  if (!topic.S || !topic.lastReview) return null;
  const daysSince = Math.max(0, (Date.now() - new Date(topic.lastReview).getTime()) / 86_400_000);
  return retrievability(daysSince, topic.S);
}

function rClass(r) {
  if (r == null) return '';
  if (r < 0.6)   return 'r-low';
  if (r < 0.8)   return 'r-mid';
  return 'r-high';
}

// ─── Componentes compartilhados ───────────────────────────────────────────────

function dueBadge(status) {
  if (status.cls === 'new')       return `<span class="badge badge-new">NOVO</span>`;
  if (status.cls === 'overdue')   return `<span class="badge badge-overdue">VENCIDO ${Math.abs(status.diff)}d</span>`;
  if (status.cls === 'due-today') return `<span class="badge badge-today">HOJE</span>`;
  return `<span class="badge badge-upcoming">em ${status.diff}d</span>`;
}

function relDots(relevance) {
  return `<span class="rel-dots">${
    Array.from({ length: 5 }, (_, i) =>
      `<span class="dot${i < relevance ? ' dot-on' : ''}"></span>`
    ).join('')
  }</span>`;
}

function ratingChip(label) {
  return `<span class="badge rating-${label.toLowerCase()}"
    style="font-size:0.6rem;padding:.1rem .4rem">${label.toUpperCase()}</span>`;
}

// ─── Página: Tópicos ──────────────────────────────────────────────────────────

function topicCard(topic) {
  const status = topicStatus(topic);
  const R      = currentR(topic);
  const rLabel = R != null ? `${Math.round(R * 100)}%` : '—';
  const rTarget = `${Math.round(targetRetention(topic.relevance) * 100)}%`;

  return `
<div class="card card-${status.cls}" data-id="${topic.id}" role="listitem">
  <div class="card-top">
    ${dueBadge(status)}
    <span class="card-name">${topic.name}</span>
  </div>
  <div class="card-meta">
    <span class="meta-group">
      <span class="meta-key">D</span>
      <span class="meta-val">${topic.D != null ? topic.D.toFixed(1) : '—'}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">S</span>
      <span class="meta-val">${topic.S != null ? topic.S.toFixed(1) + 'd' : '—'}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">R</span>
      <span class="meta-val ${rClass(R)}">${rLabel}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">R★</span>
      <span class="meta-val">${rTarget}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">REL</span>
      ${relDots(topic.relevance)}
    </span>
    <span class="meta-group">
      <span class="meta-key">SESSÕES</span>
      <span class="meta-val">${topic.reps}</span>
    </span>
  </div>
  <div class="card-actions">
    <button class="btn-primary btn-sm" data-action="study" data-id="${topic.id}">ESTUDAR</button>
    <button class="btn-danger btn-sm" data-action="delete" data-id="${topic.id}" title="Excluir">×</button>
  </div>
</div>`;
}

function sortTopics(topics, by, query) {
  let list = query
    ? topics.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : [...topics];

  const order = { new: 0, overdue: 1, 'due-today': 2, upcoming: 3 };
  return list.sort((a, b) => {
    if (by === 'name')      return a.name.localeCompare(b.name);
    if (by === 'relevance') return b.relevance - a.relevance;
    if (by === 'retention') return (currentR(a) ?? -1) - (currentR(b) ?? -1);
    const sa = topicStatus(a), sb = topicStatus(b);
    const oa = order[sa.cls] ?? 9, ob = order[sb.cls] ?? 9;
    if (oa !== ob) return oa - ob;
    if (sa.diff != null && sb.diff != null) return sa.diff - sb.diff;
    return a.name.localeCompare(b.name);
  });
}

export function renderTopicList(topics, sortBy, query = '') {
  const list  = document.getElementById('topic-list');
  const empty = document.getElementById('empty-state');
  const sorted = sortTopics(topics, sortBy, query);

  if (!sorted.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = sorted.map(topicCard).join('');
}

// ─── Página: Dashboard ────────────────────────────────────────────────────────

export function renderDashboard(topics) {
  renderDashStats(topics);
  renderDashUrgent(topics);
  renderDashChart(topics);
  renderDashDist(topics);
}

function renderDashStats(topics) {
  const overdue  = topics.filter(t => topicStatus(t).cls === 'overdue').length;
  const dueToday = topics.filter(t => topicStatus(t).cls === 'due-today').length;
  const urgent   = overdue + dueToday;
  const isNew    = topics.filter(t => topicStatus(t).cls === 'new').length;

  const studied = topics.filter(t => t.S != null);
  const avgR    = studied.length
    ? studied.reduce((s, t) => s + (currentR(t) ?? 0), 0) / studied.length
    : null;
  const avgS    = studied.length
    ? studied.reduce((s, t) => s + t.S, 0) / studied.length
    : null;

  document.getElementById('dash-stats').innerHTML = `
    <div class="dstat ${urgent > 0 ? 'dstat-urgent' : 'dstat-ok'}">
      <span class="dstat-n">${urgent}</span>
      <span class="dstat-l">Para Revisar</span>
    </div>
    <div class="dstat ${avgR != null && avgR >= 0.8 ? 'dstat-ok' : ''}">
      <span class="dstat-n">${avgR != null ? Math.round(avgR * 100) + '%' : '—'}</span>
      <span class="dstat-l">Retenção Média</span>
    </div>
    <div class="dstat">
      <span class="dstat-n">${avgS != null ? avgS.toFixed(1) + 'd' : '—'}</span>
      <span class="dstat-l">Estabilidade Média</span>
    </div>
    <div class="dstat">
      <span class="dstat-n">${isNew}</span>
      <span class="dstat-l">Nunca Revisados</span>
    </div>`;
}

function renderDashUrgent(topics) {
  const urgent = topics
    .filter(t => ['overdue', 'due-today', 'new'].includes(topicStatus(t).cls))
    .sort((a, b) => {
      const order = { overdue: 0, 'due-today': 1, new: 2 };
      return (order[topicStatus(a).cls] ?? 9) - (order[topicStatus(b).cls] ?? 9);
    });

  const el = document.getElementById('dash-urgent');

  if (!urgent.length) {
    el.innerHTML = `<p class="urgent-empty">✓ Nenhuma revisão pendente no momento.</p>`;
    return;
  }

  const shown = urgent.slice(0, 5);
  const rest  = urgent.length - shown.length;

  el.innerHTML = `
    <div class="urgent-list">
      ${shown.map(t => {
        const R = currentR(t);
        const rLabel = R != null ? `R=${Math.round(R * 100)}%` : '';
        const sLabel = t.S != null ? ` · S=${t.S.toFixed(1)}d` : '';
        return `
        <div class="urgent-row">
          ${dueBadge(topicStatus(t))}
          <div style="flex:1;min-width:0">
            <div class="urgent-name">${t.name}</div>
            <div class="urgent-sub">${rLabel}${sLabel} · rel ${t.relevance}/5</div>
          </div>
          <button class="btn-primary btn-sm" data-action="study" data-id="${t.id}">ESTUDAR</button>
        </div>`;
      }).join('')}
    </div>
    ${rest > 0 ? `<button class="dash-more" data-page="topics">+ ${rest} mais → ver todos os tópicos</button>` : ''}`;
}

function renderDashChart(topics) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push({ date: d, label: WEEK_DAYS[d.getDay()], count: 0, isToday: i === 0 });
  }

  topics.forEach(t => t.history.forEach(s => {
    const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
    const day = days.find(d => d.date.getTime() === sd.getTime());
    if (day) day.count++;
  }));

  const max = Math.max(...days.map(d => d.count), 1);

  document.getElementById('dash-chart').innerHTML = days.map(d => `
    <div class="chart-col ${d.isToday ? 'today' : ''}">
      <span class="chart-col-count">${d.count || ''}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar ${d.count === 0 ? 'empty' : ''}"
             style="height:${d.count === 0 ? '100%' : Math.max(8, Math.round(d.count / max * 100)) + '%'}">
        </div>
      </div>
      <span class="chart-col-label">${d.label}</span>
    </div>`).join('');
}

function renderDashDist(topics) {
  const dist = { critical: 0, risk: 0, retained: 0, solid: 0, new: 0 };
  topics.forEach(t => {
    const R = currentR(t);
    if (R == null)    dist.new++;
    else if (R < 0.6) dist.critical++;
    else if (R < 0.8) dist.risk++;
    else if (R < 0.95) dist.retained++;
    else               dist.solid++;
  });

  const total = topics.length || 1;
  const pct   = n => `${Math.round(n / total * 100)}%`;

  document.getElementById('dash-dist').innerHTML = `
    <div class="dist-bar">
      ${dist.critical ? `<div class="dist-seg dist-critical" style="width:${pct(dist.critical)}"></div>` : ''}
      ${dist.risk     ? `<div class="dist-seg dist-risk"     style="width:${pct(dist.risk)}"></div>`     : ''}
      ${dist.retained ? `<div class="dist-seg dist-retained" style="width:${pct(dist.retained)}"></div>` : ''}
      ${dist.solid    ? `<div class="dist-seg dist-solid"    style="width:${pct(dist.solid)}"></div>`    : ''}
      ${dist.new      ? `<div class="dist-seg dist-new"      style="width:${pct(dist.new)}"></div>`      : ''}
    </div>
    <div class="dist-legend">
      <div class="dist-item"><div class="dist-dot dist-critical"></div>Crítico (R&lt;60%) — ${dist.critical}</div>
      <div class="dist-item"><div class="dist-dot dist-risk"></div>Em risco (60–80%) — ${dist.risk}</div>
      <div class="dist-item"><div class="dist-dot dist-retained"></div>Retido (80–95%) — ${dist.retained}</div>
      <div class="dist-item"><div class="dist-dot dist-solid" style="background:var(--text)"></div>Sólido (&gt;95%) — ${dist.solid}</div>
      <div class="dist-item"><div class="dist-dot dist-new" style="border:1px solid var(--border-color)"></div>Novo — ${dist.new}</div>
    </div>`;
}

// ─── Página: Histórico ────────────────────────────────────────────────────────

export function renderHistory(topics) {
  const empty = document.getElementById('history-empty');
  const list  = document.getElementById('history-list');

  // Achata todo o histórico de todos os tópicos
  const rows = [];
  topics.forEach(t => {
    t.history.forEach(s => rows.push({ ...s, topicName: t.name, topicId: t.id }));
  });

  if (!rows.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  rows.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Agrupa por data
  const groups = {};
  rows.forEach(r => {
    const key = new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  list.innerHTML = Object.entries(groups).map(([date, sessions]) => `
    <div class="history-group">
      <div class="history-date-label">${date}</div>
      ${sessions.map(s => `
        <div class="history-row">
          ${ratingChip(s.label)}
          <span class="history-name">${s.topicName}</span>
          <span class="history-detail">${s.hits}/${s.Q}</span>
          <span class="history-detail">E=${s.E}</span>
          <span class="history-detail">S=${s.S.toFixed(1)}d</span>
          <span class="history-detail">+${s.interval}d</span>
        </div>`).join('')}
    </div>`).join('');
}

// ─── Header stats ─────────────────────────────────────────────────────────────

export function renderHeaderStats(topics) {
  const urgent = topics.filter(t => {
    const s = topicStatus(t).cls;
    return s === 'overdue' || s === 'due-today';
  }).length;

  document.getElementById('header-stats').innerHTML = `
    <div class="hstat ${urgent > 0 ? 'hstat-urgent' : ''}">
      <span class="hstat-n">${urgent}</span>
      <span class="hstat-l">Revisar</span>
    </div>
    <div class="hstat">
      <span class="hstat-n">${topics.length}</span>
      <span class="hstat-l">Tópicos</span>
    </div>`;
}

// ─── Estado do modal de estudo ────────────────────────────────────────────────

export function renderStudyState(topic) {
  const R      = currentR(topic);
  const rLabel = R != null ? `${Math.round(R * 100)}%` : '—';

  document.getElementById('study-state').innerHTML = `
    <div class="state-item">
      <span class="state-val ${rClass(R)}">${rLabel}</span>
      <span class="state-key">Retenção Atual</span>
    </div>
    <div class="state-item">
      <span class="state-val">${topic.D != null ? topic.D.toFixed(1) : '—'}</span>
      <span class="state-key">Dificuldade (D)</span>
    </div>
    <div class="state-item">
      <span class="state-val">${topic.S != null ? topic.S.toFixed(1) + 'd' : '—'}</span>
      <span class="state-key">Estabilidade (S)</span>
    </div>
    <div class="state-item">
      <span class="state-val">${fmtDate(topic.nextReview)}</span>
      <span class="state-key">Próx. Revisão</span>
    </div>`;
}

// ─── Resultado da sessão ──────────────────────────────────────────────────────

export function renderStudyResult(result, topic) {
  document.getElementById('res-rating').innerHTML = `
    <span class="rating-chip rating-${result.label.toLowerCase()}">${result.label.toUpperCase()}</span>
    <span class="rating-e">E = ${result.E} · A = ${Math.round(result.A * 100)}% bruta · C = ${Math.round(result.C * 100)}% confiança</span>`;

  const prev_D = topic.D != null ? topic.D.toFixed(1) : '—';
  const prev_S = topic.S != null ? `${topic.S.toFixed(1)}d` : '—';

  document.getElementById('res-grid').innerHTML = `
    <div class="res-cell">
      <span class="res-val">${result.D.toFixed(1)}</span>
      <span class="res-key">Dificuldade</span>
      <span class="res-prev">${prev_D} → ${result.D.toFixed(1)}</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${result.S.toFixed(1)}d</span>
      <span class="res-key">Estabilidade</span>
      <span class="res-prev">${prev_S} → ${result.S.toFixed(1)}d</span>
    </div>
    <div class="res-cell">
      <span class="res-val ${rClass(result.R)}">${Math.round(result.R * 100)}%</span>
      <span class="res-key">Retenção (R)</span>
      <span class="res-prev">momento da sessão</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${Math.round(result.R_target * 100)}%</span>
      <span class="res-key">R★ Alvo</span>
      <span class="res-prev">rel. ${topic.relevance}/5</span>
    </div>`;

  document.getElementById('res-next').innerHTML = `
    <span class="next-interval">+${result.interval} dias</span>
    <span class="next-date">Próxima revisão: <strong>${fmtDateFull(result.nextReviewDate)}</strong></span>`;
}

// ─── Navegação entre páginas ──────────────────────────────────────────────────

export function switchPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`pg-${id}`).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('tab-active', b.dataset.page === id);
  });
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

export function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  document.body.style.overflow = '';
}
