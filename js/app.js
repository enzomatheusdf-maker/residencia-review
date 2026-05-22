/**
 * app.js — Orquestrador principal
 */

import { scheduleReview, deriveRating, targetRetention } from './algorithm.js';
import {
  loadTopics, upsertTopic, removeTopic, newTopic,
  loadSchedule, saveSchedule, addScheduleBlock, toggleScheduleBlock, removeScheduleBlock,
  loadUser, saveUser, todayBlocks, getSpecialty,
} from './storage.js';
import { getDailyQueue } from './queue.js';
import {
  renderGreeting, renderSidebarUser, renderMobileStats,
  renderDashStats, renderScheduleWidget, renderPriorityQueue,
  renderDashChart, renderDashDist,
  renderTopicList, renderSchedulePage, renderHistory,
  renderStudyState, renderStudyResult,
  populateSpecialtiesDropdown, populateAreaFilter,
  switchPage, openModal, closeModal, showPane,
  topicStatus,
} from './ui.js';

// ─── Estado ───────────────────────────────────────────────────────────────────

const state = {
  topics:        [],
  schedule:      [],
  user:          { name: '' },
  dailyQueue:    [],
  sortBy:        'due',
  filterArea:    '',
  searchQuery:   '',
  activePage:    'dashboard',
  activeTopic:   null,
  pendingResult: null,
};

// ─── Refresh global ───────────────────────────────────────────────────────────

function refresh() {
  state.dailyQueue = getDailyQueue(state.topics);

  // Enriquece tópicos com _score da fila para ordenação "Prioridade"
  const scoreMap = Object.fromEntries(state.dailyQueue.map(t => [t.id, t._score ?? 0]));
  state.topics = state.topics.map(t => ({ ...t, _score: scoreMap[t.id] ?? 0 }));

  renderGreeting(state.user, state.topics);
  renderSidebarUser(state.user);
  renderMobileStats(state.topics);
  renderDashStats(state.topics);
  renderScheduleWidget(state.schedule);
  renderPriorityQueue(state.dailyQueue);
  renderDashChart(state.topics);
  renderDashDist(state.topics);
  renderTopicList(state.topics, state.sortBy, state.searchQuery);
  renderSchedulePage(state.schedule);
  renderHistory(state.topics);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  state.user     = loadUser();
  state.topics   = loadTopics();
  state.schedule = loadSchedule();

  populateSpecialtiesDropdown('in-subcategory');
  populateAreaFilter();
  setDefaultBlockDate();

  switchPage('dashboard');
  refresh();
  bindEvents();

  // Onboarding: solicita nome se não configurado
  if (!state.user.name) {
    openModal('modal-onboarding');
    document.getElementById('in-username')?.focus();
  }
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function bindEvents() {

  // ── Sidebar / navegação ─────────────────────────────────────────────────────
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', e => {
      const page = e.currentTarget.dataset.page;
      if (['dashboard','schedule','topics','history'].includes(page)) {
        state.activePage = page;
        switchPage(page);
        closeSidebarOnMobile();
      }
    });
  });

  // ── Hamburger (mobile) ──────────────────────────────────────────────────────
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ── Fechar modais ───────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]');
    if (close) { closeModal(close.dataset.close); return; }
  });

  // ── Overlay ─────────────────────────────────────────────────────────────────
  document.getElementById('overlay').addEventListener('click', closeAllModals);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  // ── Delegação de ações ─────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'study')        openStudyModal(id);
    if (action === 'delete')       deleteTopic(id);
    if (action === 'toggle-block') toggleBlock(id);
    if (action === 'delete-block') deleteBlock(id);
  });

  // ── Onboarding ──────────────────────────────────────────────────────────────
  document.getElementById('form-onboarding').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('in-username').value.trim();
    if (!name) return;
    state.user = { name };
    saveUser(state.user);
    closeModal('modal-onboarding');
    refresh();
  });

  // ── Novo tópico ─────────────────────────────────────────────────────────────
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('form-new').reset();
    document.getElementById('rel-val').textContent    = '3';
    document.getElementById('weight-val').textContent = '5';
    document.getElementById('r-target-val').textContent = '90.0%';
    openModal('modal-new');
    document.getElementById('in-name')?.focus();
  });

  document.getElementById('in-rel').addEventListener('input', e => {
    document.getElementById('rel-val').textContent = e.target.value;
    document.getElementById('r-target-val').textContent =
      `${(targetRetention(Number(e.target.value))*100).toFixed(1)}%`;
  });
  document.getElementById('in-weight').addEventListener('input', e => {
    document.getElementById('weight-val').textContent = e.target.value;
  });

  document.getElementById('form-new').addEventListener('submit', e => {
    e.preventDefault();
    submitNewTopic();
  });

  // ── Filtros / busca ─────────────────────────────────────────────────────────
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
      ? state.topics.filter(t => getSpecialty(t.subcategory).area === state.filterArea)
      : state.topics;
    renderTopicList(filtered, state.sortBy, state.searchQuery);
  });

  // ── Sessão de estudo ────────────────────────────────────────────────────────
  ['in-q','in-hits'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateAccuracyBar);
  });
  document.getElementById('form-study').addEventListener('submit', e => {
    e.preventDefault(); submitStudySession();
  });
  document.getElementById('btn-confirm').addEventListener('click', confirmResult);
  document.getElementById('btn-redo').addEventListener('click', () => {
    state.pendingResult = null;
    showPane('pane-input');
  });

  // ── Taxonomia de erro ───────────────────────────────────────────────────────
  document.querySelectorAll('.taxonomy-btn').forEach(btn => {
    btn.addEventListener('click', () => selectErrorType(btn.dataset.error));
  });

  // ── Agenda ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-add-block')?.addEventListener('click', () => {
    document.getElementById('form-block').reset();
    setDefaultBlockDate();
    openModal('modal-block');
  });
  document.getElementById('form-block').addEventListener('submit', e => {
    e.preventDefault(); submitAddBlock();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Novo tópico ──────────────────────────────────────────────────────────────

function submitNewTopic() {
  const nameEl = document.getElementById('in-name');
  const errEl  = document.getElementById('err-name');
  if (!nameEl.value.trim()) { errEl.classList.remove('hidden'); nameEl.focus(); return; }
  errEl.classList.add('hidden');

  const topic = newTopic(
    nameEl.value,
    document.getElementById('in-rel').value,
    document.getElementById('in-weight').value,
    document.getElementById('in-subcategory').value,
  );
  state.topics = upsertTopic(topic);
  closeModal('modal-new');
  refresh();
}

// ─── Estudo ───────────────────────────────────────────────────────────────────

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
  const safeHits = Math.min(hits, Q);
  const A = safeHits / Q;
  bar.style.width = `${A*100}%`;
  pct.textContent = `${Math.round(A*100)}%`;

  if      (A < 0.60) bar.style.background = 'var(--red)';
  else if (A < 0.75) bar.style.background = 'var(--orange)';
  else if (A < 0.90) bar.style.background = 'var(--accent)';
  else               bar.style.background = 'var(--green)';

  try {
    const { label, E } = deriveRating(Q, safeHits);
    document.getElementById('e-preview').textContent = `E = ${E} → ${label.toUpperCase()}`;
    prev.style.display = 'flex';
  } catch { prev.style.display = 'none'; }
}

function submitStudySession() {
  const Q    = parseInt(document.getElementById('in-q').value, 10);
  const hits = parseInt(document.getElementById('in-hits').value, 10);
  const errEl = document.getElementById('err-study');

  if (!Q||Q<1||isNaN(hits)||hits<0||hits>Q) {
    errEl.textContent = hits>Q ? 'Acertos não pode exceder questões.' : 'Preencha os campos corretamente.';
    errEl.classList.remove('hidden'); return;
  }
  errEl.classList.add('hidden');

  const result = scheduleReview(state.activeTopic, Q, hits);
  state.pendingResult = { result, Q, hits, errorType: null };

  if (result.rating === 1) {
    // Rating "Again" → exige classificação do erro antes de mostrar resultado
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
    D:          result.D,
    S:          result.S,
    lastReview: new Date().toISOString(),
    nextReview: result.nextReviewDate.toISOString(),
    reps:       state.activeTopic.reps + 1,
    lapses:     state.activeTopic.lapses + (result.rating===1 ? 1 : 0),
    history: [
      ...state.activeTopic.history,
      {
        date:      new Date().toISOString(),
        Q, hits,
        rating:    result.rating,
        label:     result.label,
        E:         result.E,
        D:         result.D,
        S:         result.S,
        interval:  result.interval,
        errorType: result.rating===1 ? errorType : null,
      },
    ],
  };

  state.topics      = upsertTopic(updated);
  state.activeTopic = null;
  state.pendingResult = null;
  closeModal('modal-study');
  refresh();
}

// ─── Exclusão de tópico ───────────────────────────────────────────────────────

function deleteTopic(id) {
  const t = state.topics.find(t => t.id === id);
  if (!t) return;
  if (!confirm(`Excluir "${t.name}"?\nEsta ação não pode ser desfeita.`)) return;
  state.topics = removeTopic(id);
  refresh();
}

// ─── Agenda ───────────────────────────────────────────────────────────────────

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
  // Atualiza streak no greeting
  renderGreeting(state.user, state.topics);
  renderDashStats(state.topics);
}

function deleteBlock(id) {
  if (!confirm('Remover este bloco?')) return;
  state.schedule = removeScheduleBlock(id);
  renderScheduleWidget(state.schedule);
  renderSchedulePage(state.schedule);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
