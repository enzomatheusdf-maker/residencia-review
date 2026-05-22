/**
 * algorithm.js — FSRS-4.5 adaptado para Revisão Médica
 *
 * Modelo:  DSR (Difficulty, Stability, Retrievability)
 * Pesos:   FSRS-4.5 default — treinados em 20M+ revisões (open-spaced-repetition, 2024)
 * Versão:  FSRS-4.5 cobre revisões inter-sessão (≥1 dia).
 *          FSRS-5 adiciona parâmetros para revisões no mesmo dia — irrelevante aqui.
 *
 * Adaptações ao domínio médico:
 *   1. Rating (1–4) derivado de (Q, acertos) via Acurácia Efetiva ponderada por volume.
 *   2. R_target modulado pela Relevância do tema para a prova (1–5).
 *
 * Curva de esquecimento:  R(t, S) = (1 + FACTOR × t/S)^DECAY
 * Próximo intervalo:      I = (S / FACTOR) × (R_target^(1/DECAY) − 1)
 * Invariante:             R(S, S) = 0.9  →  S é "dias até 90% de retenção"
 */

// ─── Constantes do modelo ─────────────────────────────────────────────────────

const DECAY  = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81 ≈ 0.23457
const MAX_DAYS = 120;

// Pesos FSRS-4.5 (w[0]–w[16]), open-spaced-repetition/fsrs4anki 2024
const W = [
  0.40255,  // w[0]  S inicial: Again
  1.18385,  // w[1]  S inicial: Hard
  3.1262,   // w[2]  S inicial: Good
  15.4722,  // w[3]  S inicial: Easy
  7.2102,   // w[4]  D inicial: base
  0.5316,   // w[5]  D inicial: expoente
  1.0651,   // w[6]  Delta de dificuldade
  0.06069,  // w[7]  Peso de regressão à média da dificuldade
  0.9124,   // w[8]  Crescimento de estabilidade: escala
  0.1542,   // w[9]  Decaimento de estabilidade por S
  1.0,      // w[10] Influência de R no crescimento de S
  1.9395,   // w[11] S após lapso: base
  0.11,     // w[12] Influência de D no lapso
  0.29605,  // w[13] Influência de S no lapso
  2.2698,   // w[14] Influência de R no lapso
  0.10548,  // w[15] Penalidade Hard
  2.9898,   // w[16] Bônus Easy
];

// ─── Volume → confiança estatística ──────────────────────────────────────────

// Q=10 → 63% de confiança, Q=20 → 86%, Q=40 → 98%
function confidenceFactor(Q) {
  return 1 - Math.exp(-Q / 10);
}

// ─── (Q, acertos) → Rating FSRS (1–4) ────────────────────────────────────────

/**
 * Converte (Q, acertos) em rating FSRS.
 * O fator de confiança C(Q) evita que amostras pequenas inflem o rating:
 * 100% em 2 questões → E ≈ 0.59 (Again), não Easy.
 *
 * E < 0.60  →  Again (1) — material não consolidado
 * E < 0.75  →  Hard  (2) — entendimento parcial
 * E < 0.90  →  Good  (3) — sólido
 * E ≥ 0.90  →  Easy  (4) — domínio claro
 */
export function deriveRating(Q, acertos) {
  if (Q < 1)                       throw new Error('Q deve ser >= 1');
  if (acertos < 0 || acertos > Q)  throw new Error('Acertos fora do intervalo [0, Q]');

  const A = acertos / Q;
  const C = confidenceFactor(Q);
  const E = A * C + 0.5 * (1 - C); // Acurácia Efetiva: puxada para 0.5 quando Q é baixo

  let rating, label;
  if      (E < 0.60) { rating = 1; label = 'Again'; }
  else if (E < 0.75) { rating = 2; label = 'Hard';  }
  else if (E < 0.90) { rating = 3; label = 'Good';  }
  else               { rating = 4; label = 'Easy';  }

  return { rating, label, E: +E.toFixed(3), C: +C.toFixed(3), A: +A.toFixed(3) };
}

// ─── Relevância → R_target ────────────────────────────────────────────────────

/**
 * Relevância alta → R_target maior → intervalo menor → mais revisões.
 * 1 → 0.850  |  3 → 0.900 (padrão)  |  5 → 0.950
 */
export function targetRetention(relevance) {
  const r = Math.max(1, Math.min(5, Math.round(relevance)));
  return 0.85 + (r - 1) * 0.025;
}

// ─── Curva de esquecimento ───────────────────────────────────────────────────

/**
 * R(t, S) = (1 + FACTOR × t/S)^DECAY
 * R(S, S) = 0.9 por construção de FACTOR — S é interpretável em dias.
 */
export function retrievability(daysSince, S) {
  if (!S || daysSince <= 0) return 1.0;
  return Math.pow(1 + FACTOR * daysSince / S, DECAY);
}

// ─── Próximo intervalo ────────────────────────────────────────────────────────

// Inversão analítica da curva de esquecimento.
function nextIntervalDays(S, R_target) {
  const days = (S / FACTOR) * (Math.pow(R_target, 1 / DECAY) - 1);
  return Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
}

// ─── Dificuldade ─────────────────────────────────────────────────────────────

function initialDifficulty(rating) {
  return Math.max(1, Math.min(10, W[4] - Math.exp(W[5] * (rating - 1)) + 1));
}

function updateDifficulty(D, rating) {
  const D_easy = initialDifficulty(4); // âncora de regressão
  const D_lin  = D - W[6] * (rating - 3) * (10 - D) / 9; // delta amortecido
  const D_new  = W[7] * D_easy + (1 - W[7]) * D_lin;     // regressão à média
  return Math.max(1, Math.min(10, D_new));
}

// ─── Estabilidade ─────────────────────────────────────────────────────────────

function stabilityAfterRecall(D, S, R, rating) {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus   = rating === 4 ? W[16] : 1;
  const S_new = S * (
    Math.exp(W[8]) * (11 - D) *
    Math.pow(S, -W[9]) *
    (Math.exp(W[10] * (1 - R)) - 1) + 1
  ) * hardPenalty * easyBonus;
  return Math.max(S_new, S); // estabilidade nunca regride após recall
}

function stabilityAfterLapse(D, S, R) {
  return Math.max(0.1,
    W[11] * Math.pow(D, -W[12]) *
    (Math.pow(S + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - R))
  );
}

// ─── Scheduler principal ──────────────────────────────────────────────────────

/**
 * Atualiza o estado FSRS de um tópico após uma sessão de questões.
 *
 * Estado esperado em `topic`:
 *   D          {number|null}  Dificuldade atual [1–10]
 *   S          {number|null}  Estabilidade atual em dias
 *   lastReview {string|null}  ISO date da última revisão
 *   relevance  {number}       Relevância para a prova [1–5]
 *
 * @param   {object} topic
 * @param   {number} Q        Questões respondidas (>= 1)
 * @param   {number} acertos  Quantidade de acertos
 * @returns {object}          Novo estado + metadados do agendamento
 */
export function scheduleReview(topic, Q, acertos) {
  const { rating, label, E, C, A } = deriveRating(Q, acertos);
  const R_target = targetRetention(topic.relevance ?? 3);

  let D, S, R;
  const isFirst = topic.S == null || topic.D == null;

  if (isFirst) {
    S = W[rating - 1];
    D = initialDifficulty(rating);
    R = 1.0;
  } else {
    const daysSince = Math.max(
      0,
      (Date.now() - new Date(topic.lastReview).getTime()) / 86_400_000
    );
    R = retrievability(daysSince, topic.S);
    D = updateDifficulty(topic.D, rating);
    S = rating === 1
      ? stabilityAfterLapse(topic.D, topic.S, R)
      : stabilityAfterRecall(topic.D, topic.S, R, rating);
  }

  const interval       = nextIntervalDays(S, R_target);
  const nextReviewDate = new Date(Date.now() + interval * 86_400_000);

  return {
    D:    +D.toFixed(4),
    S:    +S.toFixed(4),
    R:    +R.toFixed(4),
    E, A, C,
    rating, label,
    interval,
    R_target: +R_target.toFixed(3),
    nextReviewDate,
  };
}
