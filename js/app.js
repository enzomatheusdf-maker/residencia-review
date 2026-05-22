/**
 * app.js — Orquestrador principal
 * Gerencia estado da aplicação, roteamento e eventos.
 */

import { scheduleReview, deriveRating, targetRetention } from './algorithm.js';
import { loadTopics, upsertTopic, removeTopic, newTopic } from './storage.js';
import {
  renderTopicList, renderHeaderStats, renderDashboard,
  renderHistory, renderStudyState, renderStudyResult,
  switchPage, openModal, closeModal,
} from './ui.js';

// ─── Estado ───────────────────────────────────────────────────────────────────

const state = {
  topics:        [],
  sortBy:        'due',
  searchQuery:   '',
  activePage:    'dashboard',
  activeTopic:   null,
  pendingResult: null,
};

// ─── Re-render global ─────────────────────────────────────────────────────────

function refresh() {
  renderHeaderStats(state.topics);
  renderDashboard(state.topics);
  renderTopicList(state.topics, state.sortBy, state.searchQuery);
  renderHistory(state.topics);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  state.topics = loadTopics();
  switchPage('dashboard');
  refresh();
  bindEvents();
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function bindEvents() {

  // ── Navegação por abas ──────────────────────────────────────────────────────
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', e => {
      const page = e.currentTarget.dataset.page;
      if (['dashboard', 'topics', 'history'].includes(page)) {
        state.activePage = page;
        switchPage(page);
      }
    });
  });

  // ── Delegação de eventos na lista ───────────────────────────────────────────
  document.addEventListener('click', e => {
    const close  = e.target.closest('[data-close]');
    if (close) { closeModal(close.dataset.close); return; }

    const action = e.target.closest('[data-action]');
    if (!action) return;
    const { action: act, id } = action.dataset;
    if (act === 'study')  openStudyModal(id);
    if (act === 'delete') deleteTopic(id);
  });

  // ── Overlay / Escape ────────────────────────────────────────────────────────
  document.getElementById('overlay').addEventListener('click', closeAllModals);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  // ── Novo tópico ─────────────────────────────────────────────────────────────
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('form-new').reset();
    updateRTargetPreview(3);
    openModal('modal-new');
    document.getElementById('in-name').focus();
  });

  document.getElementById('in-rel').addEventListener('input', e => {
    updateRTargetPreview(Number(e.target.value));
  });

  document.getElementById('form-new').addEventListener('submit', e => {
    e.preventDefault();
    submitNewTopic();
  });

  // ── Filtros da página Tópicos ───────────────────────────────────────────────
  document.getElementById('sort-select').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery);
  });

  document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderTopicList(state.topics, state.sortBy, state.searchQuery);
  });

  // ── Sessão de estudo ────────────────────────────────────────────────────────
  ['in-q', 'in-hits'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateAccuracyBar);
  });

  document.getElementById('form-study').addEventListener('submit', e => {
    e.preventDefault();
    submitStudySession();
  });

  document.getElementById('btn-confirm').addEventListener('click', confirmResult);

  document.getElementById('btn-redo').addEventListener('click', () => {
    document.getElementById('pane-result').classList.add('hidden');
    document.getElementById('pane-input').classList.remove('hidden');
    state.pendingResult = null;
  });
}

// ─── Helpers de modal ─────────────────────────────────────────────────────────

function closeAllModals() {
  closeModal('modal-new');
  closeModal('modal-study');
}

// ─── Novo tópico ──────────────────────────────────────────────────────────────

function updateRTargetPreview(rel) {
  document.getElementById('rel-val').textContent    = rel;
  document.getElementById('r-target-val').textContent =
    `${(targetRetention(rel) * 100).toFixed(1)}%`;
}

function submitNewTopic() {
  const nameEl = document.getElementById('in-name');
  const errEl  = document.getElementById('err-name');

  if (!nameEl.value.trim()) {
    errEl.classList.remove('hidden');
    nameEl.focus();
    return;
  }
  errEl.classList.add('hidden');

  const topic = newTopic(nameEl.value, document.getElementById('in-rel').value);
  state.topics = upsertTopic(topic);
  closeModal('modal-new');
  refresh();
}

// ─── Modal de estudo ──────────────────────────────────────────────────────────

function openStudyModal(id) {
  state.activeTopic   = state.topics.find(t => t.id === id);
  state.pendingResult = null;
  if (!state.activeTopic) return;

  document.getElementById('study-name').textContent = state.activeTopic.name;
  renderStudyState(state.activeTopic);

  document.getElementById('form-study').reset();
  document.getElementById('acc-bar').style.width    = '0%';
  document.getElementById('acc-pct').textContent    = '—';
  document.getElementById('e-preview-row').style.display = 'none';
  document.getElementById('err-study').classList.add('hidden');
  document.getElementById('pane-result').classList.add('hidden');
  document.getElementById('pane-input').classList.remove('hidden');

  openModal('modal-study');
  document.getElementById('in-q').focus();
}

// ─── Barra de acurácia live ───────────────────────────────────────────────────

function updateAccuracyBar() {
  const Q    = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const bar  = document.getElementById('acc-bar');
  const pct  = document.getElementById('acc-pct');
  const prev = document.getElementById('e-preview-row');

  if (!Q || Q < 1 || isNaN(hits)) {
    bar.style.width = '0%'; pct.textContent = '—'; prev.style.display = 'none'; return;
  }

  const safeHits = Math.min(hits, Q);
  const A = safeHits / Q;
  bar.style.width = `${A * 100}%`;
  pct.textContent = `${Math.round(A * 100)}%`;

  if      (A < 0.60) bar.style.background = '#ff5555';
  else if (A < 0.75) bar.style.background = '#ff9900';
  else if (A < 0.90) bar.style.background = 'var(--text)';
  else               bar.style.background = '#00cc66';

  try {
    const { label, E } = deriveRating(Q, safeHits);
    document.getElementById('e-preview').textContent = `E = ${E} → ${label.toUpperCase()}`;
    prev.style.display = 'flex';
  } catch { prev.style.display = 'none'; }
}

// ─── Submissão da sessão ──────────────────────────────────────────────────────

function submitStudySession() {
  const Q    = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const errEl = document.getElementById('err-study');

  if (!Q || Q < 1 || isNaN(hits) || hits < 0 || hits > Q) {
    errEl.textContent = hits > Q
      ? 'Acertos não pode exceder o número de questões.'
      : 'Preencha os campos corretamente.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const result = scheduleReview(state.activeTopic, Q, hits);
  state.pendingResult = { result, Q, hits };

  renderStudyResult(result, state.activeTopic);
  document.getElementById('pane-input').classList.add('hidden');
  document.getElementById('pane-result').classList.remove('hidden');
}

// ─── Confirmação ──────────────────────────────────────────────────────────────

function confirmResult() {
  if (!state.pendingResult || !state.activeTopic) return;
  const { result, Q, hits } = state.pendingResult;

  const updated = {
    ...state.activeTopic,
    D:          result.D,
    S:          result.S,
    lastReview: new Date().toISOString(),
    nextReview: result.nextReviewDate.toISOString(),
    reps:       state.activeTopic.reps + 1,
    lapses:     state.activeTopic.lapses + (result.rating === 1 ? 1 : 0),
    history: [
      ...state.activeTopic.history,
      {
        date:     new Date().toISOString(),
        Q, hits,
        rating:   result.rating,
        label:    result.label,
        E:        result.E,
        D:        result.D,
        S:        result.S,
        interval: result.interval,
      },
    ],
  };

  state.topics      = upsertTopic(updated);
  state.activeTopic = null;
  state.pendingResult = null;

  closeModal('modal-study');
  refresh();
}

// ─── Exclusão ─────────────────────────────────────────────────────────────────

function deleteTopic(id) {
  const topic = state.topics.find(t => t.id === id);
  if (!topic) return;
  if (!confirm(`Excluir "${topic.name}"?\nEsta ação não pode ser desfeita.`)) return;
  state.topics = removeTopic(id);
  refresh();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
