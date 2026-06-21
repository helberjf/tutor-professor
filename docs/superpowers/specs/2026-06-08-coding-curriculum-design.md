# Coding Curriculum — Design Spec
**Date:** 2026-06-08  
**Status:** Approved by user

---

## Overview

Replace the `/study?tab=coding` tab (que hoje só tem checkboxes de tópicos diários) por um sistema completo de curriculum de programação com:

- Criação de matérias (ex: React, TypeScript, Node.js)
- Roteiro de tópicos ordenados por matéria
- Aulas geradas por IA + editáveis manualmente
- Flashcards por tópico
- Revisão espaçada SM-2 por flashcard

---

## 1. Database Models (Backend — SQLModel)

### `ProgrammingSubject`
Representa uma matéria de programação.

```python
class ProgrammingSubject(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    name: str = Field(max_length=100)          # ex: "React"
    description: str | None = Field(default=None, max_length=500)
    icon_emoji: str | None = Field(default=None, max_length=10)  # ex: "⚛️"
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### `ProgrammingTopic`
Um tópico dentro de uma matéria. Ordenado por `order_index`.

```python
class TopicStatus(str, Enum):
    not_started = "not_started"
    studied = "studied"
    mastered = "mastered"

class ProgrammingTopic(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    subject_id: int = Field(foreign_key="programmingsubject.id")
    title: str = Field(max_length=200)          # ex: "useState Hook"
    order_index: int = Field(default=0)
    status: TopicStatus = Field(default=TopicStatus.not_started)
    ai_content: dict | None = Field(default=None, sa_column=Column(JSON))
    # ai_content schema: { sections: [{title, body, code_example?}], quiz: [{question, options, correct_option, explanation}] }
    notes: str | None = Field(default=None, max_length=5000)  # notas livres do usuário
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

### `ProgrammingFlashcard`
Flashcard associado a um tópico.

```python
class ProgrammingFlashcard(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    topic_id: int = Field(foreign_key="programmingtopic.id")
    subject_id: int = Field(foreign_key="programmingsubject.id")
    user_id: int = Field(foreign_key="user.id")
    front: str = Field(max_length=500)          # conceito / pergunta
    back: str = Field(max_length=2000)          # resposta / explicação
    code_example: str | None = Field(default=None, max_length=3000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### `CodingReviewItem`
Item de revisão espaçada SM-2 para flashcards de programação.

```python
class CodingReviewItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    flashcard_id: int = Field(foreign_key="programmingflashcard.id")
    user_id: int = Field(foreign_key="user.id")
    difficulty_score: float = Field(default=0.5)   # 0.0–1.0
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    streak: int = Field(default=0)
    last_reviewed: datetime | None = Field(default=None)
    next_review: datetime = Field(default_factory=datetime.utcnow)
```

---

## 2. API Endpoints (FastAPI)

### Subjects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/coding/subjects` | Lista todas as matérias do usuário |
| POST | `/api/coding/subjects` | Cria nova matéria |
| PUT | `/api/coding/subjects/{id}` | Edita matéria (nome, descrição, emoji) |
| DELETE | `/api/coding/subjects/{id}` | Remove matéria e seus tópicos/flashcards |

### Topics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/coding/subjects/{subject_id}/topics` | Lista tópicos da matéria com status |
| POST | `/api/coding/subjects/{subject_id}/topics` | Cria tópico (manual ou com geração IA) |
| PUT | `/api/coding/topics/{id}` | Edita tópico (título, notes, ai_content, status, order) |
| DELETE | `/api/coding/topics/{id}` | Remove tópico e seus flashcards |
| POST | `/api/coding/topics/{id}/generate` | (Re)gera conteúdo da aula via IA |

### Flashcards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/coding/topics/{topic_id}/flashcards` | Lista flashcards do tópico |
| POST | `/api/coding/topics/{topic_id}/flashcards` | Cria flashcard manualmente |
| PUT | `/api/coding/flashcards/{id}` | Edita flashcard |
| DELETE | `/api/coding/flashcards/{id}` | Remove flashcard (e seu CodingReviewItem) |

### Spaced Repetition Review
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/coding/review` | Retorna flashcards devidos (todos ou filtrado por `subject_id`) |
| POST | `/api/coding/review/attempt` | Registra tentativa (flashcard_id, correct: bool) → atualiza SM-2 |

---

## 3. AI Generation

### Trigger
`POST /api/coding/topics/{id}/generate`  
- Usa o `UserAISettings` do usuário (provider + api_key já existente no sistema)
- Prompt envia: nome da matéria + nome do tópico → gera conteúdo estruturado

### Output JSON esperado
```json
{
  "sections": [
    { "title": "O que é", "body": "...", "code_example": "..." },
    { "title": "Quando usar", "body": "..." }
  ],
  "quiz": [
    {
      "id": 1,
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct_option": "B",
      "explanation": "..."
    }
  ],
  "flashcards": [
    { "front": "...", "back": "...", "code_example": "..." }
  ]
}
```

- `sections` e `quiz` vão para `ProgrammingTopic.ai_content`
- `flashcards` criam registros em `ProgrammingFlashcard` + `CodingReviewItem`
- Geração em background (pode usar async); se falhar, retorna erro claro

---

## 4. Spaced Repetition Algorithm

Reutiliza a mesma lógica SM-2 já implementada para `ReviewItem` (inglês):

- **correct:** `difficulty_score` diminui (fica mais fácil), `streak` +1, `next_review` = `now + interval`
- **incorrect:** `difficulty_score` aumenta, `streak` = 0, `next_review` = `now + 1 hora` (revisão rápida)
- Intervalo base: `1 dia × (1 + streak) × (1 - difficulty_score + 0.5)`

---

## 5. Frontend — Aba Coding Substituída

### Tela Principal (`/study?tab=coding`)
- Grade de cards de matérias
  - Nome + emoji + progresso: `X/Y tópicos estudados`
  - Badge "N devidos" se houver flashcards para revisar
  - Botões: **[Estudar]** e **[Revisar]**
- Botão **[+ Nova Matéria]**

### Tela de Matéria (`/study?tab=coding&subject={id}`)
- Header: nome, emoji, descrição + botão editar
- Roteiro de tópicos (lista ordenada, drag-to-reorder opcional v2)
  - Status visual: 🔘 não iniciado / ✅ estudado / ⭐ dominado
  - Tópicos sem bloqueio — qualquer ordem
- Botão **[+ Novo Tópico]** (abre modal: título → opcional geração IA)
- Botão **[Revisar Matéria]** — inicia sessão SM-2 com devidos

### Tela de Tópico (`/study?tab=coding&subject={id}&topic={id}`)
- Header: título + status + botão "Marcar como Estudado / Dominado"
- Se `ai_content` vazio: botão **[Gerar com IA]** proeminente
- Se `ai_content` preenchido:
  - Seções da aula renderizadas (markdown + code blocks)
  - Quiz interativo (5 perguntas múltipla escolha)
  - Aba "Flashcards" — lista dos flashcards do tópico + botão adicionar manual
- Campo "Notas" livre editável
- Botão **[Regenerar com IA]**

### Sessão de Revisão (`/study?tab=coding&review={subject_id}`)
- Modal ou página dedicada
- Alternância entre modos:
  - **Flip card:** mostra frente → usuário pensa → clica para revelar verso → marca ✅/❌
  - **Múltipla escolha:** gerada a partir do quiz do tópico ou opções aleatórias de outros flashcards
- Progresso: `X de Y revisados nesta sessão`
- Ao concluir: tela de resultado com acertos/erros + próximas revisões agendadas

---

## 6. Componentes Frontend Necessários

- `SubjectCard` — card da matéria na grade
- `TopicList` + `TopicItem` — roteiro de tópicos
- `TopicView` — aula completa (seções + quiz + flashcards)
- `FlashcardEditor` — criar/editar flashcard (frente/verso/código)
- `ReviewSession` — sessão de revisão (flip + múltipla escolha)
- `CreateSubjectModal` — modal para criar matéria
- `CreateTopicModal` — modal para criar tópico com opção de gerar IA

---

## 7. Out of Scope (v1)

- Drag-and-drop para reordenar tópicos (implementar na v2)
- Compartilhar matérias entre usuários
- Importar currículo de arquivo JSON externo
- Estatísticas detalhadas de retenção por matéria

---

## 8. Arquivos a Criar/Modificar

### Backend
- `apps/api/models/database.py` — adicionar 4 novos modelos
- `apps/api/main.py` — adicionar ~12 endpoints na seção `/api/coding/`
- `apps/api/services/coding_service.py` — novo serviço (lógica de geração IA, SM-2 coding)
- `alembic/versions/` — nova migration

### Frontend
- `apps/web/src/app/study/page.tsx` — substituir aba Coding
- `apps/web/src/components/coding/` — todos os componentes novos
- `apps/web/src/lib/api.ts` — adicionar tipos e funções para os novos endpoints
