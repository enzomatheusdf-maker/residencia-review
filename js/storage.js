/**
 * storage.js — Abstração do localStorage
 * Todas as operações são síncronas; erros de parsing retornam estado vazio.
 */

const KEY = 'medrev_v1';

export function loadTopics() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

export function saveTopics(topics) {
  localStorage.setItem(KEY, JSON.stringify(topics));
}

export function upsertTopic(topic) {
  const topics = loadTopics();
  const idx = topics.findIndex(t => t.id === topic.id);
  if (idx >= 0) topics[idx] = topic;
  else topics.push(topic);
  saveTopics(topics);
  return topics;
}

export function removeTopic(id) {
  const topics = loadTopics().filter(t => t.id !== id);
  saveTopics(topics);
  return topics;
}

export function newTopic(name, relevance) {
  return {
    id:         crypto.randomUUID(),
    name:       name.trim(),
    relevance:  Number(relevance),
    D:          null,
    S:          null,
    lastReview: null,
    nextReview: null,
    reps:       0,
    lapses:     0,
    history:    [],
  };
}
