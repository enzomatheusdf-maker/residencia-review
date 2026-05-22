/**
 * queue.js — Motor de Fila de Prioridade + Intercalação Dinâmica
 *
 * RESTRIÇÃO CRÍTICA: Este módulo NÃO altera as fórmulas ou pesos do FSRS-4.5.
 * Ele opera exclusivamente sobre a saída já calculada (D, S, nextReview),
 * usando-a apenas para ordenação e filtragem da fila de exibição.
 *
 * Regra 1 — Priority Score:
 *   score = (1 − S_norm) × 0.6  +  weight_norm × 0.4
 *   onde S_norm = S / S_MAX (120d), weight_norm = weight / 10
 *   Resultado: score ∈ [0, 1]. Maior score = maior urgência.
 *
 * Regra 2 — Interleaving:
 *   Máximo de 2 cards consecutivos da mesma subcategoria.
 *   Se violado, o primeiro card elegível de subcategoria diferente é promovido.
 */

const S_MAX = 120; // teto de estabilidade (dias)

// ─── Score de prioridade ──────────────────────────────────────────────────────

function priorityScore(topic) {
  const S_norm      = Math.min(topic.S ?? 0, S_MAX) / S_MAX;
  const weight_norm = (topic.weight ?? 5) / 10;
  return (1 - S_norm) * 0.6 + weight_norm * 0.4;
}

// ─── Fila base: apenas tópicos elegíveis para revisão hoje ───────────────────

function isEligible(topic) {
  if (!topic.nextReview) return true; // nunca revisado = sempre elegível
  const today = new Date(); today.setHours(23, 59, 59, 999);
  return new Date(topic.nextReview) <= today;
}

/**
 * Constrói a fila ordenada por Priority Score (decrescente).
 * Não modifica os tópicos originais.
 */
export function buildPriorityQueue(topics) {
  return topics
    .filter(isEligible)
    .map(t => ({ ...t, _score: +priorityScore(t).toFixed(3) }))
    .sort((a, b) => b._score - a._score);
}

// ─── Motor de intercalação ────────────────────────────────────────────────────

/**
 * Aplica a regra de intercalação sobre uma fila já ordenada.
 * Complexidade O(n) — passagem única.
 *
 * @param {Array} queue — Saída de buildPriorityQueue()
 * @returns {Array}     — Fila reordenada com intercalação garantida
 */
export function applyInterleaving(queue) {
  const result    = [];
  const remaining = [...queue];

  while (remaining.length) {
    const last2 = result.slice(-2);
    const sameSubcat =
      last2.length === 2 &&
      last2[0].subcategory &&
      last2[0].subcategory === last2[1].subcategory;

    if (sameSubcat) {
      // Promove o primeiro card de subcategoria diferente
      const diffIdx = remaining.findIndex(
        t => t.subcategory !== last2[0].subcategory
      );
      if (diffIdx >= 0) {
        result.push(remaining.splice(diffIdx, 1)[0]);
        continue;
      }
    }

    result.push(remaining.shift());
  }

  return result;
}

/**
 * Pipeline completo: filtra → ordena por score → aplica interleaving.
 */
export function getDailyQueue(topics) {
  return applyInterleaving(buildPriorityQueue(topics));
}
