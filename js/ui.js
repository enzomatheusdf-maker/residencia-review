/**
 * ui.js — Renderização do DOM (sem estado próprio)
 */

import { retrievability, targetRetention } from './algorithm.js';
import { SPECIALTIES, getSpecialty, todayBlocks } from './storage.js';

// ─── Helpers de data ──────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }

export function daysDiff(dateStr) {
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

const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'];
const WDAYS_PT  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira',
  'Quinta-feira','Sexta-feira','Sábado'];

// ─── Status ───────────────────────────────────────────────────────────────────

export function topicStatus(topic) {
  if (!topic.nextReview) return { cls:'new', diff:null };
  const diff = daysDiff(topic.nextReview);
  if (diff < 0)   return { cls:'overdue',   diff };
  if (diff === 0) return { cls:'due-today', diff };
  return               { cls:'upcoming',   diff };
}

export function currentR(topic) {
  if (!topic.S || !topic.lastReview) return null;
  const days = Math.max(0, (Date.now() - new Date(topic.lastReview).getTime()) / 86_400_000);
  return retrievability(days, topic.S);
}

// ─── Área → cor ───────────────────────────────────────────────────────────────

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

// ─── Componentes de badge ─────────────────────────────────────────────────────

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
  const cls = pct < 60 ? 'badge-r-low' : pct < 80 ? 'badge-r-mid' : 'badge-r-ok';
  return `<span class="badge ${cls}">R ${pct}%</span>`;
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

// ─── Streak ───────────────────────────────────────────────────────────────────

function calculateStreak(topics) {
  const dates = new Set(
    topics.flatMap(t => t.history.map(s => s.date.split('T')[0]))
  );
  let streak = 0;
  const d = new Date(); d.setHours(0,0,0,0);
  for (let i = 0; i < 365; i++) {
    const key = new Date(d.getTime() - i * 86_400_000).toISOString().split('T')[0];
    if (dates.has(key)) streak++;
    else break;
  }
  return streak;
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

export function renderGreeting(user, topics) {
  const h    = new Date().getHours();
  const sal  = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const name = user.name || 'Doutor(a)';
  const now  = new Date();
  const sub  = `${WDAYS_PT[now.getDay()]}, ${now.getDate()} de ${MONTHS_PT[now.getMonth()]}`;
  const streak = calculateStreak(topics);
  const urgent = topics.filter(t => { const s = topicStatus(t).cls; return s==='overdue'||s==='due-today'; }).length;

  document.getElementById('greeting').innerHTML = `
    <div class="greeting-hello">${sal}, ${name}.</div>
    <div class="greeting-sub">
      ${sub}
      ${streak > 0 ? `<span class="streak-badge">🔥 ${streak} dia${streak>1?'s':''} de constância</span>` : ''}
      ${urgent > 0 ? `<span style="color:var(--orange);font-size:0.8rem">${urgent} revisão${urgent>1?'s':''} pendente${urgent>1?'s':''}</span>` : ''}
    </div>`;
}

// ─── Sidebar: user info ───────────────────────────────────────────────────────

export function renderSidebarUser(user) {
  const initial = (user.name || '?')[0].toUpperCase();
  document.getElementById('sidebar-user').innerHTML = `
    <div class="user-avatar">${initial}</div>
    <div>
      <div class="user-name">${user.name || 'Usuário'}</div>
      <div class="user-label">Residente</div>
    </div>`;
}

export function renderMobileStats(topics) {
  const urgent = topics.filter(t => { const s = topicStatus(t).cls; return s==='overdue'||s==='due-today'; }).length;
  document.getElementById('mobile-stats').innerHTML = `
    <div><span class="mobile-stat-n ${urgent>0?'c-red':''}">${urgent}</span></div>`;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export function renderDashStats(topics) {
  const overdue  = topics.filter(t => topicStatus(t).cls === 'overdue').length;
  const dueToday = topics.filter(t => topicStatus(t).cls === 'due-today').length;
  const urgent   = overdue + dueToday;
  const studied  = topics.filter(t => t.S != null);
  const avgR     = studied.length ? studied.reduce((s,t) => s+(currentR(t)??0),0)/studied.length : null;
  const avgS     = studied.length ? studied.reduce((s,t) => s+t.S,0)/studied.length : null;
  const streak   = calculateStreak(topics);

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
    </div>`;
}

// ─── Schedule Widget (dashboard) ──────────────────────────────────────────────

export function renderScheduleWidget(schedule) {
  const blocks    = todayBlocks(schedule);
  const done      = blocks.filter(b => b.completed).length;
  const total     = blocks.length;
  const pct       = total ? Math.round(done/total*100) : 0;
  const el        = document.getElementById('schedule-widget');

  if (!total) {
    el.innerHTML = `<div class="schedule-card"><div class="schedule-empty">Nenhum bloco programado para hoje.</div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="schedule-card">
      <div class="schedule-progress-bar">
        <div class="schedule-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="schedule-rows">
        ${blocks.map(b => `
          <div class="schedule-row type-${b.type} ${b.completed?'completed':''}">
            <button class="schedule-check ${b.completed?'done':''}"
                    data-action="toggle-block" data-id="${b.id}"
                    title="Marcar como concluído">${b.completed?'✓':''}</button>
            <span class="schedule-time">${b.time}</span>
            <span class="schedule-title">${b.title}</span>
            <span class="schedule-type-dot"></span>
          </div>`).join('')}
      </div>
    </div>`;
}

// ─── Priority Queue Widget (dashboard) ───────────────────────────────────────

export function renderPriorityQueue(queue) {
  const el = document.getElementById('priority-queue');
  const shown = queue.slice(0, 5);

  if (!shown.length) {
    el.innerHTML = `<div class="queue-card"><div class="queue-empty">✓ Nenhuma revisão pendente agora.</div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="queue-card">
      ${shown.map((t, i) => {
        const R   = currentR(t);
        const sp  = getSpecialty(t.subcategory);
        return `
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
            <div class="queue-score-bar">
              <div class="queue-score-fill" style="width:${Math.round((t._score??0)*100)}%"></div>
            </div>
            <span class="queue-score-val">${((t._score??0)*100).toFixed(0)}pts</span>
          </div>
          <button class="btn-primary" style="font-size:0.7rem;padding:0.35rem 0.7rem"
                  data-action="study" data-id="${t.id}">Estudar</button>
        </div>`}).join('')}
    </div>
    ${queue.length > 5 ? `<p style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem;text-align:center">+${queue.length-5} tópicos na fila</p>` : ''}`;
}

// ─── Activity Chart ───────────────────────────────────────────────────────────

export function renderDashChart(topics) {
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
             style="height:${d.count>0?Math.max(10,Math.round(d.count/max*100))+'%':'100%'}">
        </div>
      </div>
      <span class="chart-col-label">${d.label}</span>
    </div>`).join('');
}

// ─── Retention Distribution ───────────────────────────────────────────────────

export function renderDashDist(topics) {
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

// ─── Topic List ───────────────────────────────────────────────────────────────

function topicCard(topic) {
  const status = topicStatus(topic);
  const R      = currentR(topic);
  const sp     = getSpecialty(topic.subcategory);

  return `
<div class="card card-${status.cls}" data-id="${topic.id}" role="listitem">
  <div class="card-header">
    <span class="card-title">${topic.name}</span>
    ${statusBadge(status)}
  </div>
  <div class="card-badges">
    ${areaBadge(topic.subcategory)}
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
  let list = query
    ? topics.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : [...topics];

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

export function renderTopicList(topics, sortBy, query='') {
  const list  = document.getElementById('topic-list');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('topics-count');
  const sorted = sortTopics(topics, sortBy, query);

  if (count) count.textContent = `${topics.length} tópico${topics.length!==1?'s':''}`;

  if (!sorted.length) {
    list.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');
  list.innerHTML = sorted.map(topicCard).join('');
}

// ─── Schedule Page ────────────────────────────────────────────────────────────

export function renderSchedulePage(schedule) {
  const empty = document.getElementById('schedule-empty');
  const list  = document.getElementById('schedule-list');

  if (!schedule.length) {
    list.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');

  // Agrupa por data
  const groups = {};
  [...schedule].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).forEach(b => {
    const d = new Date(b.date+'T00:00:00');
    const key = d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
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

// ─── History ──────────────────────────────────────────────────────────────────

const ERROR_LABELS = {
  knowledge: { label:'Falta de Conhecimento', cls:'error-knowledge' },
  confusion:  { label:'Confusão / Distração',  cls:'error-confusion' },
  clinical:   { label:'Aplicação Clínica',     cls:'error-clinical'  },
};

export function renderHistory(topics) {
  const empty = document.getElementById('history-empty');
  const list  = document.getElementById('history-list');
  const count = document.getElementById('history-count');

  const rows = topics.flatMap(t => t.history.map(s => ({ ...s, topicName:t.name })));
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

// ─── Specialties dropdown ─────────────────────────────────────────────────────

export function populateSpecialtiesDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">Selecione a especialidade</option>` +
    SPECIALTIES.map(s => `<option value="${s.value}">${s.label} — ${s.area}</option>`).join('');
}

export function populateAreaFilter() {
  const sel = document.getElementById('filter-area');
  if (!sel) return;
  const areas = [...new Set(SPECIALTIES.map(s => s.area))];
  sel.innerHTML = `<option value="">Todas as áreas</option>` +
    areas.map(a => `<option value="${a}">${a}</option>`).join('');
}

// ─── Study Modal ──────────────────────────────────────────────────────────────

export function renderStudyState(topic) {
  const R = currentR(topic);
  const rPct = R!=null ? Math.round(R*100)+'%' : '—';
  const rCls = R==null?'':R<0.6?'c-red':R<0.8?'c-orange':'c-green';
  document.getElementById('study-state').innerHTML = `
    <div class="state-item">
      <span class="state-val ${rCls}">${rPct}</span>
      <span class="state-key">Retenção Atual</span>
    </div>
    <div class="state-item">
      <span class="state-val">${topic.D!=null?topic.D.toFixed(1):'—'}</span>
      <span class="state-key">Dificuldade (D)</span>
    </div>
    <div class="state-item">
      <span class="state-val">${topic.S!=null?topic.S.toFixed(1)+'d':'—'}</span>
      <span class="state-key">Estabilidade (S)</span>
    </div>
    <div class="state-item">
      <span class="state-val">${fmtDate(topic.nextReview)}</span>
      <span class="state-key">Próx. Revisão</span>
    </div>`;
}

export function renderStudyResult(result, topic) {
  document.getElementById('res-rating').innerHTML = `
    <span class="rating-chip rating-${result.label.toLowerCase()}">${result.label.toUpperCase()}</span>
    <span class="rating-e">E = ${result.E} · A = ${Math.round(result.A*100)}% bruta · C = ${Math.round(result.C*100)}% vol.</span>`;

  const prevD = topic.D!=null?topic.D.toFixed(1):'—';
  const prevS = topic.S!=null?topic.S.toFixed(1)+'d':'—';

  document.getElementById('res-grid').innerHTML = `
    <div class="res-cell">
      <span class="res-val">${result.D.toFixed(1)}</span>
      <span class="res-key">Dificuldade</span>
      <span class="res-prev">${prevD} → ${result.D.toFixed(1)}</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${result.S.toFixed(1)}d</span>
      <span class="res-key">Estabilidade</span>
      <span class="res-prev">${prevS} → ${result.S.toFixed(1)}d</span>
    </div>
    <div class="res-cell">
      <span class="res-val ${result.R<0.6?'c-red':result.R<0.8?'c-orange':'c-green'}">${Math.round(result.R*100)}%</span>
      <span class="res-key">Retenção (R)</span>
      <span class="res-prev">momento da sessão</span>
    </div>
    <div class="res-cell">
      <span class="res-val">${Math.round(result.R_target*100)}%</span>
      <span class="res-key">R★ Alvo</span>
      <span class="res-prev">rel. ${topic.relevance}/5</span>
    </div>`;

  document.getElementById('res-next').innerHTML = `
    <span class="next-interval">+${result.interval} dias</span>
    <span class="next-date">Próxima revisão: <strong>${fmtDateLong(result.nextReviewDate)}</strong></span>`;
}

// ─── Page switching ───────────────────────────────────────────────────────────

export function switchPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`pg-${id}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('nav-active', b.dataset.page === id);
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

export function showPane(id) {
  ['pane-input','pane-error-taxonomy','pane-result'].forEach(p => {
    document.getElementById(p)?.classList.add('hidden');
  });
  document.getElementById(id)?.classList.remove('hidden');
}
