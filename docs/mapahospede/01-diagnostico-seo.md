# Diagnóstico: por que o MapaHóspede não é encontrado no Google

**Data da auditoria:** 04/08/2026
**Domínio:** `mapahospede.com.br` (Vercel, SPA React/Vite)

---

## Resumo em uma frase

O site **não está quebrado e não está bloqueado** — ele simplesmente **não entrega
nenhum texto no HTML**. Toda página, inclusive a home, responde com um documento de
~2,8 KB cujo corpo é literalmente `<div id="root"></div>`. Para o Google, o site
existe e está vazio.

---

## O que eu testei e o que encontrei

| Verificação | Resultado | Veredito |
|---|---|---|
| Site no ar / HTTPS / HSTS | HTTP 200, TLS ok | ✅ |
| `www` → apex | 307 → `https://mapahospede.com.br/` | ✅ |
| `robots.txt` | Existe, permite crawl, aponta sitemap | ✅ |
| `sitemap.xml` | Existe, 19 URLs válidas | ✅ |
| `<title>` por rota | Único em `/faq`, `/pricing`, `/blog`, `/chalets` | ✅ |
| JSON-LD (`FAQPage`, `SoftwareApplication`) | Presente nas subpáginas | ✅ |
| `<link rel="canonical">` nas subpáginas | Presente | ✅ |
| **Texto no `<body>`** | **Zero. Em todas as rotas.** | ❌ **P0** |
| **Canonical + JSON-LD na home** | **Ausentes** | ❌ **P1** |
| **URL inexistente** | **Retorna HTTP 200 + shell da home** | ❌ **P1** |
| Idade do domínio | `last-modified: 02/08/2026` — ~2 dias | ⚠️ contexto |
| Backlinks | Nenhum detectável | ⚠️ contexto |

Comando que resume o problema:

```console
$ curl -s https://mapahospede.com.br/faq | sed -n '/<body/,/<\/body>/p'
  <body>
    <div id="root"></div>
  </body>
```

A `/faq` tem `<title>` correto, canonical correto e JSON-LD de `FAQPage` — **e nenhuma
pergunta ou resposta no HTML.** O Google recebe a promessa de uma FAQ e uma página em branco.

---

## Causa raiz (P0): renderização 100% no cliente

O site é um SPA Vite/React. O conteúdo só existe depois que o JavaScript executa no
navegador.

O Google *consegue* executar JavaScript, mas isso acontece em **duas passadas**:
primeiro ele rastreia o HTML, depois a página entra numa **fila de renderização**. Essa
fila é priorizada por autoridade de domínio. Para um domínio com 2 dias de vida, zero
backlinks e zero histórico, a renderização é a última da fila — o resultado típico no
Search Console é `Descoberta – no momento não indexada` ou `Rastreada – no momento não
indexada`, e isso persiste por **semanas ou meses**.

Bing, DuckDuckGo, e praticamente todos os crawlers de IA (incluindo o que alimenta
respostas de LLM) **não executam JavaScript**. Para eles o site é permanentemente vazio.

> **Este é o único item que realmente importa.** Os outros são reparos de acabamento.
> Enquanto o corpo do HTML estiver vazio, nenhuma outra otimização de SEO produz efeito.

---

## A boa notícia: 80% da infraestrutura já existe

Isso é importante e muda o tamanho do conserto.

As subpáginas já recebem `<title>`, `<meta description>`, `canonical` e JSON-LD
**únicos e corretos**, gerados em build time (evidência: `/faq` = 4407 bytes com
JSON-LD, `/pricing` = 3360 bytes com `SoftwareApplication`, enquanto uma URL aleatória
cai no `index.html` genérico de 2824 bytes).

Ou seja: **já existe um passo de build que gera um HTML por rota e injeta metadados.**
Ele só não injeta o *conteúdo*. O conserto não é "migrar para Next.js" — é fazer esse
mesmo passo escrever o HTML renderizado dentro da `<div id="root">`.

---

## Causas secundárias

### P1 — A home foi esquecida pelo gerador de metadados

`/` é a única rota que **não** tem `canonical` nem JSON-LD, e usa o `og:title` genérico
do template. É a página mais importante do site e a menos otimizada.

### P1 — Soft 404: tudo retorna 200

```console
$ curl -o /dev/null -w "%{http_code}" https://mapahospede.com.br/esta-pagina-nao-existe-123xyz
200
```

Qualquer URL inventada devolve `200 OK` com o shell da home. Isso faz o Google
classificar o site como baixa qualidade e desperdiça orçamento de rastreamento.
(Foi isso que me deu um falso positivo ao testar o arquivo de verificação do Search Console.)

### P2 — Contexto, não defeito

- **Domínio novo.** Mesmo um site perfeito leva de 2 a 8 semanas para indexar.
- **Zero backlinks.** O Google não tem caminho de descoberta além do sitemap.
- **Ninguém busca "Mapa Hóspede".** A marca é desconhecida; o tráfego virá de cauda longa.

---

## Plano de correção, em ordem de impacto

### P0 — Pré-renderizar o HTML (o conserto que resolve o problema)

As rotas de marketing (`/`, `/faq`, `/pricing`, `/blog`, `/blog/*`, `/chalets`,
`/chalet/*`, `/guia-hospede`, `/sobre`, `/contato`) são estáticas — não dependem de
dados em runtime. Devem virar HTML completo no build.

**Caminho recomendado — `vite-react-ssg`** (mantém React Router, sem reescrever o app):

```bash
npm i -D vite-react-ssg
```

```jsonc
// package.json
{
  "scripts": {
    "build": "vite-react-ssg build"
  }
}
```

```tsx
// src/main.tsx
import { ViteReactSSG } from 'vite-react-ssg'
import { routes } from './routes'

export const createRoot = ViteReactSSG({ routes })
```

```ts
// src/routes.ts — rotas dinâmicas precisam declarar os caminhos a gerar
export const routes = [
  {
    path: '/chalet/:id',
    Component: ChaletPage,
    entry: 'src/pages/ChaletPage.tsx',
    getStaticPaths: () => ['/chalet/1', '/chalet/2', '/chalet/3', '/chalet/4'],
  },
  // ...
]
```

**Alternativa se o app resistir ao SSG:** `puppeteer` num script de pós-build,
percorrendo as URLs do `sitemap.xml` e salvando o HTML renderizado por cima do arquivo
de cada rota. Mais feio, mas funciona sem tocar no código do app.

**Critério de aceite** — este comando precisa devolver o texto real da pergunta:

```bash
curl -s https://mapahospede.com.br/faq | grep -i "check-in"
```

Enquanto ele voltar vazio, o conserto não está feito.

### P1 — Corrigir a home

Adicionar à `/` o que as outras rotas já têm:

```html
<link rel="canonical" href="https://mapahospede.com.br/" />
```

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Mapa Hóspede",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "Guia digital interativo para hóspedes: check-in, Wi-Fi, regras da casa e atrações locais.",
  "url": "https://mapahospede.com.br/",
  "publisher": { "@type": "Organization", "name": "Mapa Hóspede" }
}
</script>
```

E um `<title>` que carregue a palavra-chave, não só a marca. Sugestão:

> `Guia digital para hóspedes de Airbnb e pousadas | Mapa Hóspede`

### P1 — Devolver 404 de verdade

Com pré-renderização, cada rota vira um arquivo real e o catch-all do `vercel.json`
pode ser removido — a Vercel passa a devolver 404 nativamente para o que não existe.
Se o catch-all precisar continuar, ele deve excluir as rotas conhecidas e servir um
`404.html` com status 404.

### P1 — Search Console e Bing

1. Verificar `mapahospede.com.br` no **Google Search Console** (verificação por DNS TXT
   — o método de arquivo HTML é inconfiável aqui por causa do soft 404).
2. Enviar `sitemap.xml`.
3. Usar **Inspecionar URL → Solicitar indexação** na home e nas 6 páginas do blog.
4. Repetir no **Bing Webmaster Tools** (importa direto do GSC, leva 2 minutos, e é o
   que alimenta boa parte das respostas de IA).

### P2 — Criar caminhos de descoberta

O Google precisa encontrar o domínio citado em algum lugar além do próprio sitemap:

- Perfis oficiais: Instagram, LinkedIn (página de empresa), YouTube — todos com o link.
- Diretórios de SaaS BR: Capterra Brasil, GetApp, B2B Stack, SaaSHub.
- Product Hunt (versão em inglês da landing).
- Um post técnico no dev.to ou Medium contando como o produto foi construído, linkando o domínio.

### Expectativa realista de prazo

| Semana | O que esperar |
|---|---|
| 0 | Deploy do pré-render + GSC configurado |
| 1–2 | Páginas saem de "Descoberta" para "Indexada" |
| 3–4 | Marca "Mapa Hóspede" passa a retornar o site |
| 6–12 | Cauda longa começa a trazer tráfego real |

---

## Um alerta estratégico sobre `Disallow: /guia/`

O `robots.txt` bloqueia `/guia/`, onde vivem os guias dos hóspedes. Para conteúdo
privado de hóspede isso está **correto** — mantenha.

Mas vale separar dois espaços de URL: guias privados continuam bloqueados, e uma
versão pública e opcional (o anfitrião escolhe expor) fica indexável em outro prefixo.
Cada acomodação publicada vira uma página indexável — é assim que esse produto escala
de 19 URLs para milhares sem produzir conteúdo manualmente. **Opt-in do anfitrião,
sempre.**
