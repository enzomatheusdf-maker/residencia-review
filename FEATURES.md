# MedRev v2.0 — 4 Funcionalidades Críticas Implementadas

## ✅ 1. Arquitetura de Subtópicos e Métricas Precisas

### Implementação:
- **Grande Área obrigatória**: Na criação do tópico, o campo `in-area` agora é obrigatório (validação em `submitNewTopic()`)
- **Especialidade cascata**: Ao selecionar a Grande Área, o dropdown `in-subcategory` é populado dinamicamente
- **Tabela de Desempenho**: Nova seção "METRIFIQUE SEU DESEMPENHO" no dashboard
  - Agrupa tópicos por área (Clínica Médica, Cirurgia, etc.)
  - Calcula retenção média por área usando FSRS
  - Exibe incidência estatística (% de presença em provas)
  - Mostra contador de tópicos estudados vs. totais
  - Renderiza retenção com cores (vermelho < 60%, laranja 60–80%, verde > 80%)

### Código-chave:
```javascript
function renderPerformanceTable(topics)  // bundle.js ~1270
function submitNewTopic()                  // validação obrigatória
```

---

## ✅ 2. Motor de Metas Diárias (Question Goal)

### Implementação:
- **Cálculo Dinâmico**: Função `calculateDailyQuestionGoal()` que:
  - Conta tópicos elegíveis para revisão hoje
  - Calcula dificuldade média histórica (D do FSRS)
  - Ajusta meta de questões por dificuldade:
    - D > 6 (difícil) → 8 questões/card
    - 4 < D < 6 (médio) → 5 questões/card
    - D < 4 (fácil) → 3 questões/card
  - Mínimo 5 questões/dia
  
- **Widget no Dashboard**: 
  - Barra de progresso visual
  - Questões respondidas hoje vs. meta
  - Status "✓ META ATINGIDA" quando atinge 100%
  - Countdown de questões restantes

### Código-chave:
```javascript
function calculateDailyQuestionGoal(topics)  // bundle.js ~1290
function renderDailyGoal(topics)              // bundle.js ~1309
```

---

## ✅ 3. Senso de Urgência (Data da Prova)

### Implementação:
- **Campo na Aba Ajustes**: Input `in-exam-date` (type=date)
- **Armazenamento**: Salvo em `state.user.examDate` (localStorage)
- **Contador Regressivo Impactante**:
  - Exibido no topo do Dashboard (abaixo da saudação)
  - Mostra número grande de dias faltantes
  - Cores dinâmicas:
    - **Crítica (vermelho)**: ≤ 7 dias
    - **Aviso (laranja)**: ≤ 30 dias
    - **Normal**: > 30 dias
  - Barra esquerda colorida para ênfase visual
  
- **Integração**: Renderizado em `refresh()` automaticamente

### Código-chave:
```javascript
function renderExamCountdown(user)  // bundle.js ~1242
// Salvo via btn-save-settings handler (bundle.js ~1045)
```

---

## ✅ 4. Botão Global de Otimização e Backup Local

### A. Otimizar FSRS
- **Botão Fixo**: Posicionado no canto superior direito (`btn-optimize`)
- **Funcionalidade**: Recalcula a fila de prioridades sem alterar dados FSRS
- **Handler**: `optimizeFSRS()` → chama `refresh()` + exibe toast

### B. Backup Local (JSON)
- **Exportar**:
  - Botão "EXPORTAR DADOS (JSON)" na aba Ajustes
  - Gera arquivo `medrev-backup-YYYY-MM-DD.json`
  - Contém: topics, schedule, user, versionamento
  - Download automático
  
- **Importar**:
  - Botão "IMPORTAR DADOS (JSON)"
  - Validação de formato
  - Substitui dados atuais (com confirmação)
  - Reinicia a aplicação
  - Sem sincronização em nuvem (100% offline)

### Código-chave:
```javascript
function exportData()        // bundle.js ~218
function importData()        // bundle.js ~232
function optimizeFSRS()      // bundle.js ~1285
// Handlers: bundle.js ~1054, ~1059, ~1073
```

---

## 📊 Estrutura de Armazenamento

```json
{
  "version": "2.0",
  "exportedAt": "2024-05-22T10:30:00Z",
  "user": {
    "name": "João",
    "examDate": "2024-07-15"
  },
  "topics": [
    {
      "id": "uuid",
      "name": "IAM e Síndromes Coronarianas",
      "area": "Clínica Médica",
      "subcategory": "cardiologia",
      "relevance": 5,
      "weight": 8,
      "D": 5.2,
      "S": 14.5,
      "nextReview": "2024-05-25T00:00:00Z",
      "reps": 3,
      "lapses": 0,
      "history": [...]
    }
  ],
  "schedule": [...]
}
```

---

## 🎨 Novos Componentes CSS

| Classe | Descrição |
|--------|-----------|
| `.exam-countdown` | Contador regressivo com cores por urgência |
| `.exam-countdown-critical` | Estilo vermelho (≤7 dias) |
| `.countdown-number` | Número grande em destaque |
| `.daily-goal-card` | Card da meta diária |
| `.daily-goal-bar` | Barra de progresso |
| `.perf-table` | Tabela de desempenho por área |
| `.btn-optimize` | Botão fixo de otimização |
| `.toast` | Notificação de feedback |

---

## 🚀 Como Usar

### 1. Configurar Data da Prova
1. Clique em **Ajustes** (⚙)
2. Digite a data no campo "DATA DA PROVA"
3. Clique em "SALVAR AJUSTES"
4. O contador aparecerá no Dashboard

### 2. Acompanhar Meta Diária
- A meta aparece **automaticamente** abaixo das estatísticas do Dashboard
- Ajusta-se conforme:
  - Cards elegíveis para hoje
  - Dificuldade média histórica
- Complete sessões de estudo para atingir a meta

### 3. Revisar Desempenho por Área
- Seção "METRIFIQUE SEU DESEMPENHO" no Dashboard
- Mostra incidência (% de questões em prova)
- Útil para priorizar áreas de alta incidência

### 4. Fazer Backup
- Clique em "EXPORTAR DADOS (JSON)"
- Arquivo é salvo no Downloads
- Guarde em local seguro

### 5. Restaurar de Backup
- Clique em "IMPORTAR DADOS (JSON)"
- Selecione arquivo anterior
- Todos os dados são restaurados

### 6. Otimizar Fila
- Clique no botão **↻ Otimizar Fila** (canto superior)
- Recalcula prioridades se ficou dias sem acessar
- Sem alteração nos dados FSRS

---

## ⚙️ Detalhes Técnicos

### Validação em Novo Tópico
```javascript
// submitNewTopic() agora exige:
- Nome (obrigatório)
- Grande Área (obrigatório) → in-area
- Especialidade (obrigatório) → in-subcategory (cascata)
```

### Fórmula de Meta Diária
```
goalDaily = max(5, round(elegibleCards × baseQuestionsPerCard))

baseQuestionsPerCard = D > 6 ? 8 : D > 4 ? 5 : 3
D = dificuldade média histórica
```

### Cores do Countdown
```css
--red:    #FF5A65     /* ≤ 7 dias */
--orange: #FF9A3C     /* ≤ 30 dias */
--accent: #4F8EF7     /* > 30 dias */
```

---

## 📝 Notas Importantes

✓ **Sistema 100% local** — Sem sincronia em nuvem
✓ **Backup manual** — JSON para portabilidade
✓ **FSRS-4.5 intacto** — Algoritmo nunca é alterado
✓ **Métricas precisas** — Baseadas em dados FSRS existentes
✓ **UI responsiva** — Funciona em mobile/tablet/desktop

---

## 🔄 Fluxo de Dados

```
┌─ Configurações (Ajustes)
│  └─ examDate → state.user.examDate
│
├─ Tópicos (Banco)
│  └─ area + subcategory → validação + renderPerformanceTable()
│
├─ Dashboard
│  ├─ renderExamCountdown()
│  ├─ renderDailyGoal()
│  ├─ renderPerformanceTable()
│  └─ renderPriorityQueue()
│
└─ Backup
   ├─ exportData() → JSON file
   └─ importData() → restore all
```

---

**Implementação completa: 22/05/2026** ✅
