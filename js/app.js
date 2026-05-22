/**
 * app.js — Orquestrador principal
 * Gerencia estado, eventos e coordena algorithm, storage e ui.
 */

import { scheduleReview, deriveRating, targetRetention } from './algorithm.js';
import { loadTopics, upsertTopic, removeTopic, newTopic } from './storage.js';
import {
  renderTopicList, renderHeaderStats, renderStudyState,
  renderStudyResult, openModal, closeModal,
} from './ui.js';

// ─── Estado da aplicação ──────────────────────────────────────────────────────

const state = {
  topics:      [],
  sortBy:      'due',
  activeTopic: null,
  pendingResult: null,
};

// ─── Re-render completo ───────────────────────────────────────────────────────

function refresh() {
  renderTopicList(state.topics, state.sortBy);
  renderHeaderStats(state.topics);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  state.topics = loadTopics();
  refresh();
  bindEvents();
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function bindEvents() {
  // Abrir modal de novo tópico
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('form-new').reset();
    updateRTargetPreview(3);
    openModal('modal-new');
    document.getElementById('in-name').focus();
  });

  // Fechar modais por data-close
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]');
    if (close) closeModal(close.dataset.close);

    // Ações na lista de tópicos (delegação de eventos)
    const action = e.target.closest('[data-action]');
    if (!action) return;

    const { action: act, id } = action.dataset;
    if (act === 'study')  openStudyModal(id);
    if (act === 'delete') deleteTopic(id);
  });

  // Fechar modal ao clicar no overlay
  document.getElementById('overlay').addEventListener('click', () => {
    closeModal('modal-new');
    closeModal('modal-study');
  });

  // Fechar com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('modal-new');
      closeModal('modal-study');
    }
  });

  // Slider de relevância → preview R_target
  document.getElementById('in-rel').addEventListener('input', e => {
    updateRTargetPreview(Number(e.target.value));
  });

  // Form: novo tópico
  document.getElementById('form-new').addEventListener('submit', e => {
    e.preventDefault();
    submitNewTopic();
  });

  // Ordenação
  document.getElementById('sort-select').addEventListener('change', e => {
    state.sortBy = e.target.value;
    refresh();
  });

  // Inputs de questões → barra de acurácia + preview E
  ['in-q', 'in-hits'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateAccuracyBar);
  });

  // Form: sessão de estudo
  document.getElementById('form-study').addEventListener('submit', e => {
    e.preventDefault();
    submitStudySession();
  });

  // Confirmar resultado
  document.getElementById('btn-confirm').addEventListener('click', confirmResult);

  // Refazer sessão
  document.getElementById('btn-redo').addEventListener('click', () => {
    document.getElementById('pane-result').classList.add('hidden');
    document.getElementById('pane-input').classList.remove('hidden');
    state.pendingResult = null;
  });
}

// ─── Novo tópico ──────────────────────────────────────────────────────────────

function updateRTargetPreview(rel) {
  document.getElementById('rel-val').textContent = rel;
  const rt = targetRetention(rel);
  document.getElementById('r-target-val').textContent = `${(rt * 100).toFixed(1)}%`;
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

  const topic = newTopic(
    nameEl.value,
    document.getElementById('in-rel').value
  );

  state.topics = upsertTopic(topic);
  closeModal('modal-new');
  refresh();
}

// ─── Modal de estudo ──────────────────────────────────────────────────────────

function openStudyModal(id) {
  state.activeTopic  = state.topics.find(t => t.id === id);
  state.pendingResult = null;
  if (!state.activeTopic) return;

  document.getElementById('study-name').textContent = state.activeTopic.name;
  renderStudyState(state.activeTopic);

  // Reset do formulário
  document.getElementById('form-study').reset();
  document.getElementById('acc-bar').style.width  = '0%';
  document.getElementById('acc-pct').textContent  = '—';
  document.getElementById('e-preview-row').style.display = 'none';
  document.getElementById('err-study').classList.add('hidden');

  document.getElementById('pane-result').classList.add('hidden');
  document.getElementById('pane-input').classList.remove('hidden');

  openModal('modal-study');
  document.getElementById('in-q').focus();
}

// ─── Barra de acurácia (live) ─────────────────────────────────────────────────

function updateAccuracyBar() {
  const Q      = parseInt(document.getElementById('in-q').value, 10);
  const hits   = parseInt(document.getElementById('in-hits').value, 10);
  const bar    = document.getElementById('acc-bar');
  const label  = document.getElementById('acc-pct');
  const preRow = document.getElementById('e-preview-row');
  const preVal = document.getElementById('e-preview');

  if (!Q || Q < 1 || isNaN(hits)) {
    bar.style.width = '0%';
    label.textContent = '—';
    preRow.style.display = 'none';
    return;
  }

  const safeHits = Math.min(hits, Q);
  const A = safeHits / Q;
  bar.style.width = `${A * 100}%`;
  label.textContent = `${Math.round(A * 100)}%`;

  // Cor por zona
  if (A < 0.60)      bar.style.background = '#cc0000';
  else if (A < 0.75) bar.style.background = '#e07000';
  else if (A < 0.90) bar.style.background = '#111';
  else               bar.style.background = '#005500';

  // Preview de E e rating
  if (Q >= 1 && hits >= 0 && hits <= Q) {
    try {
      const { label: lbl, E } = deriveRating(Q, safeHits);
      preVal.textContent = `E = ${E} → ${lbl.toUpperCase()}`;
      preRow.style.display = 'flex';
    } catch {
      preRow.style.display = 'none';
    }
  }
}

// ─── Submissão da sessão de estudo ────────────────────────────────────────────

function submitStudySession() {
  const Q    = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const errEl = document.getElementById('err-study');

  if (!Q || Q < 1 || isNaN(hits) || hits < 0 || hits > Q) {
    errEl.textContent = hits > Q
      ? 'Acertos não pode ser maior que o número de questões.'
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

// ─── Confirmação e salvamento ─────────────────────────────────────────────────

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
    history:    [
      ...state.activeTopic.history,
      {
        date:    new Date().toISOString(),
        Q, hits,
        rating:  result.rating,
        label:   result.label,
        E:       result.E,
        D:       result.D,
        S:       result.S,
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
  if (!confirm(`Excluir "${topic.name}"? Esta ação não pode ser desfeita.`)) return;
  state.topics = removeTopic(id);
  refresh();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
