/**
 * ui.js — Funções de renderização do DOM
 * Sem estado próprio. Recebe dados e atualiza o DOM.
 */

import { retrievability, targetRetention } from './algorithm.js';

// ─── Helpers de data ──────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today()) / 86_400_000);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateFull(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Estado do tópico → classe de urgência ────────────────────────────────────

export function topicStatus(topic) {
  if (!topic.nextReview) return { cls: 'new',      diff: null };
  const diff = daysDiff(topic.nextReview);
  if (diff < 0)  return { cls: 'overdue',   diff };
  if (diff === 0) return { cls: 'due-today', diff };
  return              { cls: 'upcoming',   diff };
}

// ─── Badge de revisão ─────────────────────────────────────────────────────────

function dueBadge(status) {
  if (status.cls === 'new')      return `<span class="badge badge-new">NOVO</span>`;
  if (status.cls === 'overdue')  return `<span class="badge badge-overdue">VENCIDO ${Math.abs(status.diff)}d</span>`;
  if (status.cls === 'due-today') return `<span class="badge badge-today">HOJE</span>`;
  return `<span class="badge badge-upcoming">em ${status.diff}d</span>`;
}

// ─── Dots de relevância ───────────────────────────────────────────────────────

function relDots(relevance) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="dot${i < relevance ? ' dot-on' : ''}"></span>`
  ).join('');
}

// ─── R atual (calculada em tempo de render) ───────────────────────────────────

function currentR(topic) {
  if (!topic.S || !topic.lastReview) return null;
  const daysSince = Math.max(0,
    (Date.now() - new Date(topic.lastReview).getTime()) / 86_400_000
  );
  return retrievability(daysSince, topic.S);
}

// ─── Formatação de R para exibição ───────────────────────────────────────────

function rClass(r) {
  if (r == null) return '';
  if (r < 0.6)  return 'r-low';
  if (r < 0.8)  return 'r-mid';
  return 'r-high';
}

// ─── Card de tópico ───────────────────────────────────────────────────────────

function topicCard(topic) {
  const status = topicStatus(topic);
  const R      = currentR(topic);
  const rLabel = R != null ? `${Math.round(R * 100)}%` : '—';
  const dLabel = topic.D != null ? topic.D.toFixed(1) : '—';
  const sLabel = topic.S != null ? `${topic.S.toFixed(1)}d` : '—';
  const rTarget = `${Math.round(targetRetention(topic.relevance) * 100)}%`;

  return `
<div class="card card-${status.cls}" data-id="${topic.id}">
  <div class="card-top">
    ${dueBadge(status)}
    <span class="card-name">${topic.name}</span>
  </div>
  <div class="card-meta">
    <span class="meta-group">
      <span class="meta-key">D</span><span class="meta-val">${dLabel}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">S</span><span class="meta-val">${sLabel}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">R</span><span class="meta-val ${rClass(R)}">${rLabel}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">R★</span><span class="meta-val">${rTarget}</span>
    </span>
    <span class="meta-group rel-group">
      <span class="meta-key">REL</span>
      <span class="rel-dots">${relDots(topic.relevance)}</span>
    </span>
    <span class="meta-group">
      <span class="meta-key">REVISÕES</span><span class="meta-val">${topic.reps}</span>
    </span>
  </div>
  <div class="card-actions">
    <button class="btn-primary btn-study" data-action="study" data-id="${topic.id}">ESTUDAR</button>
    <button class="btn-danger btn-del"   data-action="delete" data-id="${topic.id}" title="Excluir tópico">×</button>
  </div>
</div>`;
}

// ─── Ordenação ────────────────────────────────────────────────────────────────

function sortTopics(topics, by) {
  const order = { 'new': 0, 'overdue': 1, 'due-today': 2, 'upcoming': 3 };
  return [...topics].sort((a, b) => {
    if (by === 'name')      return a.name.localeCompare(b.name);
    if (by === 'relevance') return b.relevance - a.relevance;
    if (by === 'retention') {
      const rA = currentR(a) ?? -1;
      const rB = currentR(b) ?? -1;
      return rA - rB;
    }
    // default: 'due'
    const sA = topicStatus(a), sB = topicStatus(b);
    const oA = order[sA.cls] ?? 9, oB = order[sB.cls] ?? 9;
    if (oA !== oB) return oA - oB;
    if (sA.diff != null && sB.diff != null) return sA.diff - sB.diff;
    return a.name.localeCompare(b.name);
  });
}

// ─── Render: lista de tópicos ─────────────────────────────────────────────────

export function renderTopicList(topics, sortBy) {
  const list  = document.getElementById('topic-list');
  const empty = document.getElementById('empty-state');

  if (!topics.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = sortTopics(topics, sortBy).map(topicCard).join('');
}

// ─── Render: stats do header ──────────────────────────────────────────────────

export function renderHeaderStats(topics) {
  const urgent = topics.filter(t => {
    const s = topicStatus(t);
    return s.cls === 'overdue' || s.cls === 'due-today';
  }).length;
  const total = topics.length;

  document.getElementById('header-stats').innerHTML = `
    <div class="stat ${urgent > 0 ? 'stat-urgent' : ''}">
      <span class="stat-n">${urgent}</span>
      <span class="stat-l">PARA REVISAR</span>
    </div>
    <div class="stat">
      <span class="stat-n">${total}</span>
      <span class="stat-l">TÓPICOS</span>
    </div>`;
}

// ─── Render: estado atual no modal de estudo ──────────────────────────────────

export function renderStudyState(topic) {
  const R      = currentR(topic);
  const rLabel = R != null ? `${Math.round(R * 100)}%` : '—';
  const dLabel = topic.D != null ? topic.D.toFixed(1) : '—';
  const sLabel = topic.S != null ? `${topic.S.toFixed(1)}d` : '—';
  const nextLabel = topic.nextReview ? fmtDate(topic.nextReview) : '—';

  document.getElementById('study-state').innerHTML = `
    <div class="state-item"><span class="state-val ${rClass(R)}">${rLabel}</span><span class="state-key">RETENÇÃO</span></div>
    <div class="state-item"><span class="state-val">${dLabel}</span><span class="state-key">DIFIC. (D)</span></div>
    <div class="state-item"><span class="state-val">${sLabel}</span><span class="state-key">ESTAB. (S)</span></div>
    <div class="state-item"><span class="state-val">${nextLabel}</span><span class="state-key">PRÓX. REVISÃO</span></div>`;
}

// ─── Render: resultado da sessão ──────────────────────────────────────────────

export function renderStudyResult(result, topic) {
  // Badge de rating
  document.getElementById('res-rating').innerHTML = `
    <span class="rating-chip rating-${result.label.toLowerCase()}">${result.label.toUpperCase()}</span>
    <span class="rating-e">E = ${result.E} · A = ${(result.A * 100).toFixed(0)}% bruta · C = ${(result.C * 100).toFixed(0)}% confiança</span>`;

  // Grade de métricas
  const prev_D = topic.D != null ? topic.D.toFixed(1) : '—';
  const prev_S = topic.S != null ? `${topic.S.toFixed(1)}d` : '—';
  document.getElementById('res-grid').innerHTML = `
    <div class="res-cell">
      <span class="res-val">${result.D.toFixed(1)}</span>
      <span class="res-key">DIFICULDADE</span>
      <span class="res-prev">${prev_D} → ${result.D.toFixed(1)}</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${result.S.toFixed(1)}d</span>
      <span class="res-key">ESTABILIDADE</span>
      <span class="res-prev">${prev_S} → ${result.S.toFixed(1)}d</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${Math.round(result.R * 100)}%</span>
      <span class="res-key">RETENÇÃO (R)</span>
      <span class="res-prev">no momento da sessão</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${Math.round(result.R_target * 100)}%</span>
      <span class="res-key">R★ ALVO</span>
      <span class="res-prev">rel. ${topic.relevance}/5</span>
    </div>`;

  // Próxima revisão
  document.getElementById('res-next').innerHTML = `
    <span class="next-interval">+${result.interval} dias</span>
    <span class="next-date">Próxima revisão: <strong>${fmtDateFull(result.nextReviewDate.toISOString())}</strong></span>`;
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
