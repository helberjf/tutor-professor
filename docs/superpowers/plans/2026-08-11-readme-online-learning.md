# README de plataforma de aprendizado online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o README para apresentar a aplicação como plataforma de aprendizado online e evidenciar seu valor de engenharia para recrutadores técnicos.

**Architecture:** A mudança ficará concentrada em `README.md`, preservando instruções operacionais verificadas. A nova ordem priorizará proposta de valor e destaques técnicos, mantendo arquitetura, execução, configuração, testes e limitações como documentação de referência.

**Tech Stack:** Markdown, Next.js 14, React, TypeScript, FastAPI, SQLModel, PostgreSQL, Gemini, Kokoro, Vercel e Cloudflare Tunnel.

---

### Task 1: Reestruturar a apresentação do produto e da engenharia

**Files:**
- Modify: `README.md`
- Test: `README.md` (revisão estrutural e `git diff --check`)

- [ ] **Step 1: Substituir o título e os dois primeiros blocos de conteúdo**

  Substituir a abertura por uma descrição em inglês que:

  - nomeie o projeto como uma plataforma de aprendizado online;
  - inclua idiomas, programação e tópicos personalizados como áreas de estudo;
  - apresente responsáveis como suporte opcional, não como público exclusivo;
  - substitua a seção `What This Project Demonstrates` por `Why It Stands Out` com os itens: arquitetura full-stack, IA validada antes de persistir, revisão espaçada, TTS com fallback, conexão dinâmica de backend e cobertura automatizada.

- [ ] **Step 2: Organizar as funcionalidades por jornadas de uso**

  Renomear `Core Features` para `Learning Experiences`, e seus blocos para `Learning and Review`, `Guidance and Accounts` e `Specialized Study Modes`.

  Manter, em linguagem ampla, os recursos existentes: aulas, quizzes, revisões, áudio, progresso, contas, perfis, configuração de IA, pomodoro, tópicos personalizados, currículo de programação, flashcards e treino de métodos.

- [ ] **Step 3: Ajustar decisões de arquitetura e destaques de engenharia**

  Manter o diagrama de arquitetura e as seções `Key Design Decisions` e `Engineering Highlights`, alterando apenas termos que restringem o público, como `child-facing`, para termos abrangentes como `learner-facing`.

  Remover a frase que descreve o projeto como `a practical engineering exercise` e atualizar a limitação final para refletir a evolução da plataforma de aprendizagem, sem atribuir a origem exclusivamente ao ensino de inglês para crianças.

- [ ] **Step 4: Rodar verificação de formatação do Markdown**

  Run:

  ```powershell
  git diff --check -- README.md
  ```

  Expected: saída vazia e código de saída `0`.

- [ ] **Step 5: Revisar os critérios de aceitação no arquivo final**

  Confirmar manualmente que o README:

  - explica produto, público e áreas de estudo antes dos detalhes operacionais;
  - explicita as decisões técnicas relevantes para recrutadores;
  - preserva comandos de execução, ambiente e testes;
  - descreve limitações sem fazer promessas além da implementação atual.

- [ ] **Step 6: Commit**

  ```powershell
  git add -- README.md
  git commit -m "docs: position platform for online learning"
  ```

  Expected: commit contendo somente `README.md`.
