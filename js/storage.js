/**
 * storage.js — Modelo de dados e abstração do localStorage
 * FSRS algorithm.js nunca é importado aqui.
 */

// ─── Chaves do localStorage ───────────────────────────────────────────────────

const KEY_TOPICS   = 'medrev_v1';
const KEY_SCHEDULE = 'medrev_schedule_v1';
const KEY_USER     = 'medrev_user_v1';

// ─── Taxonomia de especialidades médicas ─────────────────────────────────────

export const SPECIALTIES = [
  // Clínica Médica
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
  // Cirurgia
  { value: 'cirurgia-geral',    label: 'Cirurgia Geral',        area: 'Cirurgia' },
  { value: 'cirurgia-ped',      label: 'Cirurgia Pediátrica',   area: 'Cirurgia' },
  { value: 'cirurgia-vasc',     label: 'Cirurgia Vascular',     area: 'Cirurgia' },
  { value: 'ortopedia',         label: 'Ortopedia e Trauma',    area: 'Cirurgia' },
  { value: 'urologia',          label: 'Urologia',              area: 'Cirurgia' },
  { value: 'neurocirurgia',     label: 'Neurocirurgia',         area: 'Cirurgia' },
  // Pediatria
  { value: 'pediatria',         label: 'Pediatria Geral',       area: 'Pediatria' },
  { value: 'neonatologia',      label: 'Neonatologia',          area: 'Pediatria' },
  // GO
  { value: 'ginecologia',       label: 'Ginecologia',           area: 'GO' },
  { value: 'obstetricia',       label: 'Obstetrícia',           area: 'GO' },
  // Saúde Mental
  { value: 'psiquiatria',       label: 'Psiquiatria',           area: 'Saúde Mental' },
  // Emergência
  { value: 'emergencia',        label: 'Med. de Emergência',    area: 'Emergência' },
  { value: 'uti',               label: 'UTI / Intensivismo',    area: 'Emergência' },
  { value: 'anestesiologia',    label: 'Anestesiologia',        area: 'Emergência' },
  // Medicina Preventiva
  { value: 'saude-publica',     label: 'Saúde Pública',         area: 'Medicina Preventiva' },
  { value: 'epidemiologia',     label: 'Epidemiologia',         area: 'Medicina Preventiva' },
  { value: 'mfc',               label: 'Med. de Família',       area: 'Medicina Preventiva' },
  // Diagnóstico
  { value: 'radiologia',        label: 'Radiologia / Imagem',   area: 'Diagnóstico' },
  { value: 'patologia',         label: 'Patologia',             area: 'Diagnóstico' },
  // Outros
  { value: 'oftalmologia',      label: 'Oftalmologia',          area: 'Outros' },
  { value: 'otorrino',          label: 'Otorrinolaringologia',  area: 'Outros' },
  { value: 'farmacologia',      label: 'Farmacologia',          area: 'Outros' },
  { value: 'bioetica',          label: 'Bioética',              area: 'Outros' },
];

export function getSpecialty(value) {
  return SPECIALTIES.find(s => s.value === value) ?? { value, label: value, area: 'Outros' };
}

// ─── Migração retrocompatível ─────────────────────────────────────────────────

function migrateTopic(t) {
  return {
    ...t,
    weight:      t.weight      ?? 5,
    subcategory: t.subcategory ?? '',
    history: (t.history ?? []).map(s => ({
      ...s,
      errorType: s.errorType ?? null,
    })),
  };
}

// ─── Tópicos ──────────────────────────────────────────────────────────────────

export function loadTopics() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_TOPICS)) ?? [];
    return raw.map(migrateTopic);
  } catch { return []; }
}

export function saveTopics(topics) {
  localStorage.setItem(KEY_TOPICS, JSON.stringify(topics));
}

export function upsertTopic(topic) {
  const topics = loadTopics();
  const idx = topics.findIndex(t => t.id === topic.id);
  if (idx >= 0) topics[idx] = topic; else topics.push(topic);
  saveTopics(topics);
  return topics;
}

export function removeTopic(id) {
  const topics = loadTopics().filter(t => t.id !== id);
  saveTopics(topics);
  return topics;
}

export function newTopic(name, relevance, weight, subcategory) {
  return {
    id:          crypto.randomUUID(),
    name:        name.trim(),
    relevance:   Number(relevance),
    weight:      Number(weight),
    subcategory: subcategory ?? '',
    D:           null,
    S:           null,
    lastReview:  null,
    nextReview:  null,
    reps:        0,
    lapses:      0,
    history:     [],
  };
}

// ─── Agenda / Cronograma ──────────────────────────────────────────────────────

export function loadSchedule() {
  try { return JSON.parse(localStorage.getItem(KEY_SCHEDULE)) ?? []; }
  catch { return []; }
}

export function saveSchedule(blocks) {
  localStorage.setItem(KEY_SCHEDULE, JSON.stringify(blocks));
}

export function addScheduleBlock(date, time, title, type) {
  const blocks = loadSchedule();
  const block = { id: crypto.randomUUID(), date, time, title, type, completed: false };
  blocks.push(block);
  saveSchedule(blocks);
  return blocks;
}

export function toggleScheduleBlock(id) {
  const blocks = loadSchedule().map(b =>
    b.id === id ? { ...b, completed: !b.completed } : b
  );
  saveSchedule(blocks);
  return blocks;
}

export function removeScheduleBlock(id) {
  const blocks = loadSchedule().filter(b => b.id !== id);
  saveSchedule(blocks);
  return blocks;
}

export function todayBlocks(blocks) {
  const today = new Date().toISOString().split('T')[0];
  return blocks
    .filter(b => b.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
}

// ─── Usuário ──────────────────────────────────────────────────────────────────

export function loadUser() {
  try { return JSON.parse(localStorage.getItem(KEY_USER)) ?? { name: '' }; }
  catch { return { name: '' }; }
}

export function saveUser(user) {
  localStorage.setItem(KEY_USER, JSON.stringify(user));
}
