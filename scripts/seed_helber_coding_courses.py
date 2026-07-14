from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlmodel import Session, select


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))

import models.database  # noqa: F401  # Register SQLModel tables.
from models.database import (
    ChildProfile,
    CodingReviewItem,
    ProgrammingFlashcard,
    ProgrammingSubject,
    ProgrammingTopic,
    User,
)
from schemas.schemas import TopicAIContentSchema
from services.coding_service import seed_coding_review_item


TARGET_EMAIL = "helberjf@gmail.com"
TARGET_CHILD = "Henrique"


@dataclass(frozen=True)
class TopicSpec:
    title: str
    objective: str
    concepts: tuple[str, ...]
    code: str | None = None
    interview: str | None = None
    exam_focus: str | None = None


@dataclass(frozen=True)
class CourseSpec:
    name: str
    description: str
    icon_emoji: str | None
    topics: tuple[TopicSpec, ...]


@dataclass
class SeedResult:
    subjects_created: int = 0
    topics_created: int = 0
    topics_updated: int = 0
    flashcards_created: int = 0
    review_items_seeded: int = 0
    flashcards_cleaned: int = 0


class SeedError(RuntimeError):
    pass


def t(
    title: str,
    objective: str,
    concepts: Iterable[str],
    *,
    code: str | None = None,
    interview: str | None = None,
    exam_focus: str | None = None,
) -> TopicSpec:
    return TopicSpec(
        title=title,
        objective=objective,
        concepts=tuple(concepts),
        code=code,
        interview=interview,
        exam_focus=exam_focus,
    )


def _ts_note(topic: str, points: Iterable[str], action: str = "review") -> str:
    safe_topic = json.dumps(topic)
    safe_points = json.dumps(list(points)[:4], ensure_ascii=True)
    safe_action = json.dumps(action)
    return (
        "type StudyNote = { topic: string; keyPoints: string[]; action: string };\n"
        f"const note: StudyNote = {{ topic: {safe_topic}, keyPoints: {safe_points}, action: {safe_action} }};\n"
        "console.log(`${note.topic}: ${note.action}`);"
    )


def get_course_catalog() -> tuple[CourseSpec, ...]:
    aws_topics = (
        t("Mapa da prova CLF-C02", "Entender dominios, peso da prova e estrategia de estudo.", ("Cloud Concepts 24%", "Security and Compliance 30%", "Technology and Services 34%", "Billing Pricing and Support 12%"), exam_focus="Memorize o peso dos dominios e priorize seguranca e servicos."),
        t("Valor da nuvem AWS", "Explicar por que empresas escolhem nuvem em vez de data centers fixos.", ("elasticidade", "agilidade", "alcance global", "pagamento conforme uso"), exam_focus="Cai como beneficios: trocar gasto fixo por variavel, escala e velocidade."),
        t("Infraestrutura global", "Diferenciar regioes, zonas de disponibilidade e edge locations.", ("Regions", "Availability Zones", "edge locations", "alta disponibilidade"), exam_focus="AZs nao compartilham ponto unico de falha; regioes ajudam latencia, DR e soberania."),
        t("Well-Architected Framework", "Reconhecer os seis pilares e quando cada um e o foco da pergunta.", ("operational excellence", "security", "reliability", "performance efficiency", "cost optimization", "sustainability"), exam_focus="Associe cada decisao ao pilar correto."),
        t("Modelo de responsabilidade compartilhada", "Separar responsabilidades da AWS e do cliente por tipo de servico.", ("security of the cloud", "security in the cloud", "EC2", "RDS", "Lambda"), exam_focus="Em servicos gerenciados a AWS assume mais operacao; o cliente ainda cuida de dados e acesso."),
        t("IAM e principio do menor privilegio", "Identificar usuarios, grupos, roles, policies e MFA.", ("IAM users", "groups", "roles", "policies", "MFA", "root user"), exam_focus="Proteja root, use MFA, prefira roles e permissao minima."),
        t("IAM Identity Center e federacao", "Entender acesso federado e single sign-on para organizacoes.", ("IAM Identity Center", "federated identity", "permission sets", "cross-account access"), exam_focus="Use federacao para workforce; nao crie usuarios IAM para cada funcionario quando ha IdP."),
        t("Criptografia e KMS", "Saber onde usar criptografia em repouso, em transito e chaves gerenciadas.", ("AWS KMS", "ACM", "encryption at rest", "encryption in transit", "Secrets Manager"), exam_focus="KMS gerencia chaves; ACM gerencia certificados TLS; Secrets Manager armazena segredos."),
        t("Governanca, auditoria e compliance", "Escolher CloudTrail, Config, Audit Manager e Artifact.", ("AWS CloudTrail", "AWS Config", "AWS Audit Manager", "AWS Artifact"), exam_focus="CloudTrail registra chamadas de API; Artifact fornece documentos de compliance."),
        t("Servicos de seguranca gerenciada", "Diferenciar WAF, Shield, GuardDuty, Inspector, Macie e Security Hub.", ("AWS WAF", "AWS Shield", "GuardDuty", "Inspector", "Macie", "Security Hub"), exam_focus="WAF filtra HTTP; Shield protege DDoS; GuardDuty detecta ameacas; Inspector acha vulnerabilidades."),
        t("Compute: EC2, Lambda e Fargate", "Escolher entre VM, serverless e containers sem servidor.", ("Amazon EC2", "AWS Lambda", "AWS Fargate", "Elastic Beanstalk", "Lightsail"), exam_focus="EC2 da controle; Lambda executa por evento; Fargate roda containers sem gerenciar servidores."),
        t("Auto Scaling e Elastic Load Balancing", "Entender elasticidade, distribuicao de trafego e health checks.", ("Auto Scaling", "Application Load Balancer", "Network Load Balancer", "health checks"), exam_focus="Auto Scaling ajusta capacidade; load balancer distribui conexoes para alvos saudaveis."),
        t("Containers: ECS, EKS e ECR", "Comparar opcoes de containers na AWS.", ("Amazon ECS", "Amazon EKS", "Amazon ECR", "container registry"), exam_focus="ECS e orquestrador AWS; EKS e Kubernetes gerenciado; ECR armazena imagens."),
        t("Bancos relacionais na AWS", "Escolher RDS, Aurora e quando evitar banco em EC2.", ("Amazon RDS", "Amazon Aurora", "Multi-AZ", "read replica", "managed database"), exam_focus="RDS/Aurora reduzem operacao; EC2 so quando precisa administrar o motor diretamente."),
        t("Bancos NoSQL e cache", "Identificar DynamoDB, DocumentDB, Neptune e ElastiCache.", ("DynamoDB", "DocumentDB", "Neptune", "ElastiCache", "key-value"), exam_focus="DynamoDB e NoSQL serverless key-value/document; ElastiCache e cache em memoria."),
        t("Armazenamento: S3, EBS e EFS", "Diferenciar objeto, bloco e arquivo.", ("Amazon S3", "Amazon EBS", "Amazon EFS", "object storage", "block storage", "file storage"), exam_focus="S3 objeto; EBS disco para EC2; EFS sistema de arquivos compartilhado."),
        t("S3 storage classes e lifecycle", "Escolher classes S3 por frequencia de acesso e custo.", ("S3 Standard", "S3 Intelligent-Tiering", "S3 Glacier", "lifecycle policies"), exam_focus="Lifecycle move objetos automaticamente; Glacier e arquivamento barato com recuperacao mais lenta."),
        t("Rede: VPC, subnets e gateways", "Reconhecer os blocos de rede de uma conta AWS.", ("Amazon VPC", "subnets", "route tables", "internet gateway", "NAT gateway"), exam_focus="Subnets segmentam; internet gateway da saida/entrada publica; NAT ajuda subnets privadas sairem."),
        t("Route 53, CloudFront e Global Accelerator", "Escolher DNS, CDN e aceleracao global.", ("Route 53", "CloudFront", "edge locations", "Global Accelerator"), exam_focus="Route 53 e DNS; CloudFront e CDN; Global Accelerator otimiza trafego via rede global AWS."),
        t("Conectividade hibrida", "Saber quando usar VPN, Direct Connect e Transit Gateway.", ("AWS VPN", "Direct Connect", "Transit Gateway", "hybrid cloud"), exam_focus="VPN usa internet criptografada; Direct Connect e link dedicado; Transit Gateway centraliza roteamento."),
        t("Aplicacao integrada: SQS, SNS, EventBridge e Step Functions", "Diferenciar filas, pub/sub, eventos e workflows.", ("Amazon SQS", "Amazon SNS", "EventBridge", "Step Functions"), exam_focus="SQS desacopla via fila; SNS notifica assinantes; EventBridge roteia eventos; Step Functions orquestra."),
        t("Analytics e dados", "Reconhecer Athena, Glue, Kinesis, Redshift e QuickSight.", ("Athena", "Glue", "Kinesis", "Redshift", "QuickSight"), exam_focus="Athena consulta S3 com SQL; Glue cataloga/ETL; Kinesis streaming; Redshift data warehouse."),
        t("IA e ML no escopo CLF-C02", "Identificar usos basicos de SageMaker AI, Lex, Polly, Rekognition e Textract.", ("SageMaker AI", "Lex", "Polly", "Rekognition", "Textract", "Amazon Q"), exam_focus="A prova pede reconhecer servico por caso de uso, nao treinar modelo complexo."),
        t("CloudFormation, CLI, SDK e IaC", "Diferenciar acesso manual, programatico e infraestrutura como codigo.", ("AWS Management Console", "AWS CLI", "AWS SDKs", "CloudFormation", "IaC"), code=_ts_note("AWS SDK decision", ("Use SDK for app calls", "Use IaC for repeatable infra", "Use Console for exploration"), "choose access method"), exam_focus="Processos repetiveis pedem IaC; automacao de app usa SDK/API."),
        t("Monitoramento e operacao", "Escolher CloudWatch, Systems Manager, Health Dashboard, X-Ray e Trusted Advisor.", ("CloudWatch", "Systems Manager", "Health Dashboard", "X-Ray", "Trusted Advisor"), exam_focus="CloudWatch coleta metricas/logs; Trusted Advisor recomenda melhorias; Health mostra eventos AWS."),
        t("Precos: On-Demand, Reserved, Spot e Savings Plans", "Comparar opcoes de compra de compute.", ("On-Demand", "Reserved Instances", "Spot Instances", "Savings Plans", "Capacity Reservations"), exam_focus="Spot e barato mas pode interromper; Savings Plans/RIs exigem compromisso; On-Demand e flexivel."),
        t("Custos, budgets e tags", "Usar ferramentas de custo e alocacao.", ("AWS Budgets", "Cost Explorer", "Pricing Calculator", "Cost and Usage Report", "cost allocation tags"), exam_focus="Budgets alerta; Cost Explorer analisa; Pricing Calculator estima; tags alocam custo."),
        t("Organizations, suporte e recursos oficiais", "Entender billing consolidado, suporte e onde procurar ajuda.", ("AWS Organizations", "consolidated billing", "AWS Support plans", "AWS re:Post", "Knowledge Center", "Marketplace"), exam_focus="Organizations consolida contas e billing; suporte varia por plano."),
    )

    react_topics = (
        t("useState e useEffect", "Dominar estado local e efeitos externos com TypeScript.", ("state", "effect cleanup", "dependency array", "batched updates"), code=_ts_note("React hooks", ("useState stores UI state", "useEffect syncs external systems", "cleanup avoids leaks"), "build typed component")),
        t("Componentes e props", "Criar componentes pequenos, tipados e reutilizaveis.", ("JSX", "props readonly", "children", "composition"), code="type ButtonProps = { label: string; onClick: () => void; disabled?: boolean };\nfunction Button({ label, onClick, disabled }: ButtonProps) {\n  return <button disabled={disabled} onClick={onClick}>{label}</button>;\n}"),
        t("Context API", "Compartilhar estado transversal sem prop drilling excessivo.", ("createContext", "useContext", "provider", "context boundaries"), code=_ts_note("React context", ("Use for theme/auth/session", "Avoid for rapidly changing lists", "Keep provider scoped"), "design context")),
        t("Renderizacao e reconciliacao", "Entender render, commit e como keys afetam listas.", ("render phase", "commit phase", "keys", "reconciliation"), code=_ts_note("React render", ("Stable keys preserve state", "Render must be pure", "Commit touches DOM"), "debug rerenders")),
        t("Forms controlados", "Construir formularios seguros e previsiveis.", ("controlled inputs", "validation", "submit state", "accessibility"), code="type LoginForm = { email: string; password: string };\nconst [form, setForm] = useState<LoginForm>({ email: '', password: '' });"),
        t("useReducer para fluxos complexos", "Trocar multiplos setStates por eventos claros.", ("reducer", "actions", "discriminated unions", "state machine"), code="type Action = { type: 'loaded'; items: string[] } | { type: 'failed'; error: string };\nfunction reducer(state: State, action: Action): State { return action.type === 'loaded' ? { ...state, items: action.items } : { ...state, error: action.error }; }"),
        t("Hooks customizados", "Extrair logica reutilizavel sem misturar UI.", ("custom hook", "naming", "composition", "testability"), code="function useDebouncedValue<T>(value: T, ms: number): T {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => { const id = setTimeout(() => setDebounced(value), ms); return () => clearTimeout(id); }, [value, ms]);\n  return debounced;\n}"),
        t("Performance com memo, useMemo e useCallback", "Usar memoizacao so quando ha gargalo real.", ("React.memo", "useMemo", "useCallback", "referential equality"), code=_ts_note("React performance", ("Measure first", "Memoize expensive calculations", "Avoid stale dependencies"), "profile before optimizing")),
        t("Server state e cache", "Separar estado de servidor de estado de UI.", ("fetching", "cache", "stale data", "optimistic update"), code=_ts_note("Server state", ("Cache API responses", "Invalidate after mutations", "Handle loading and error"), "plan data fetching")),
        t("Error boundaries e suspense", "Isolar falhas e estados de carregamento.", ("error boundary", "Suspense", "fallback", "recovery"), code=_ts_note("React resilience", ("Boundary catches render errors", "Suspense coordinates async UI", "Fallback must be useful"), "design recovery")),
        t("Acessibilidade em React", "Garantir UI navegavel por teclado e leitores de tela.", ("semantic HTML", "aria", "focus management", "labels"), code=_ts_note("React accessibility", ("Prefer semantic tags", "Label inputs", "Preserve focus flow"), "review UI")),
        t("Testes de componentes", "Testar comportamento percebido pelo usuario.", ("Testing Library", "user events", "queries by role", "mock boundaries"), code=_ts_note("Component tests", ("Query by role", "Assert visible behavior", "Avoid testing implementation"), "write tests")),
        t("Arquitetura de pastas", "Organizar componentes, hooks e servicos por responsabilidade.", ("feature folders", "shared components", "API client", "boundaries"), code=_ts_note("React architecture", ("Keep components focused", "Move IO to client modules", "Share only stable primitives"), "organize app")),
        t("Integracao React com TypeScript", "Tipar eventos, refs, props genericas e unions.", ("ReactNode", "ChangeEvent", "useRef generics", "discriminated unions"), code="type FieldProps<T extends string> = { value: T; onChange: (value: T) => void };\nfunction Field<T extends string>({ value, onChange }: FieldProps<T>) {\n  return <input value={value} onChange={(event) => onChange(event.target.value as T)} />;\n}"),
        t("Anti-patterns em React", "Reconhecer efeitos desnecessarios, estado duplicado e props instaveis.", ("derived state", "unnecessary effects", "mutation", "prop drilling"), code=_ts_note("React anti-patterns", ("Do not mirror props blindly", "Do not mutate state", "Do not fetch in every render"), "spot problems")),
        t("Entrevista React senior", "Responder perguntas conectando trade-offs a experiencia real.", ("trade-offs", "debugging", "performance", "architecture"), interview="Explique uma decisao de arquitetura React, o problema, a alternativa rejeitada e a metrica usada."),
    )

    vite_topics = (
        t("Por que Vite e rapido", "Entender dev server baseado em ESM e pre-bundling.", ("native ESM", "dependency pre-bundling", "HMR", "Rollup build"), code=_ts_note("Vite speed", ("ESM in dev", "Pre-bundle dependencies", "Rollup for production"), "explain Vite")),
        t("Criando app Vite com React TS", "Configurar projeto React TypeScript com scripts corretos.", ("create vite", "React plugin", "tsconfig", "npm scripts"), code="import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });"),
        t("Env vars e modos", "Usar import.meta.env sem vazar segredo.", ("import.meta.env", "VITE_ prefix", "modes", ".env.local"), code="const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;\nif (import.meta.env.DEV) console.log('dev build');"),
        t("Config condicional", "Alterar configuracao para serve, build e preview.", ("defineConfig", "command", "mode", "loadEnv"), code="export default defineConfig(({ command, mode }) => ({\n  server: command === 'serve' ? { port: 5173 } : undefined,\n  define: { __APP_MODE__: JSON.stringify(mode) },\n}));"),
        t("Aliases e monorepo", "Criar imports estaveis e evitar caminhos quebrados.", ("resolve.alias", "paths", "tsconfig", "workspace"), code="resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }"),
        t("Build de producao", "Entender targets, chunks e assets finais.", ("vite build", "build target", "assets", "code splitting"), code=_ts_note("Vite build", ("Review bundle size", "Use dynamic import", "Set target intentionally"), "prepare production")),
        t("Proxy e integracao backend", "Evitar CORS local e integrar API durante desenvolvimento.", ("server.proxy", "CORS", "backend base URL", "runtime config"), code="server: { proxy: { '/api': { target: 'http://127.0.0.1:8001', changeOrigin: true } } }"),
        t("Plugins Vite", "Escolher plugins e entender hooks de transformacao.", ("plugin lifecycle", "transform", "configureServer", "HTML transform"), code=_ts_note("Vite plugins", ("Use official plugins first", "Keep plugin scope small", "Avoid build-only surprises"), "select plugin")),
        t("SSR e static deploy", "Diferenciar SPA, SSG e SSR com Vite.", ("SSR", "static hosting", "hydration", "entry-server"), code=_ts_note("Vite deployment", ("SPA can be static", "SSR needs runtime", "Configure fallback routes"), "choose deploy")),
        t("Troubleshooting Vite", "Resolver env undefined, cache, CJS e HMR estranho.", ("dependency cache", "CJS interop", "env prefix", "HMR boundary"), code=_ts_note("Vite debug", ("Check env prefix", "Clear dependency cache", "Inspect transformed imports"), "debug dev server")),
    )

    saas_security_topics = (
        t("Modelo de ameacas SaaS", "Mapear ativos, atores e fronteiras de confianca.", ("assets", "threat actors", "trust boundaries", "STRIDE"), code=_ts_note("Threat model", ("Identify assets", "List trust boundaries", "Rank abuse cases"), "model SaaS risk")),
        t("Tenant isolation", "Impedir vazamento entre clientes no banco, cache e storage.", ("tenant context", "row-level filtering", "cache isolation", "object keys"), code="type TenantScoped<T> = T & { tenantId: string };\nfunction assertTenant(record: TenantScoped<object>, tenantId: string) { if (record.tenantId !== tenantId) throw new Error('forbidden'); }"),
        t("Autenticacao segura", "Projetar login, MFA, sessoes e recuperacao de conta.", ("MFA", "session rotation", "password reset", "credential stuffing"), code=_ts_note("Auth security", ("Rotate sessions after login", "Rate limit attempts", "Protect reset tokens"), "secure auth")),
        t("Autorizacao RBAC e ABAC", "Separar identidade, permissoes e escopo de tenant.", ("RBAC", "ABAC", "least privilege", "policy checks"), code="type Permission = 'project:read' | 'project:write';\nfunction can(user: User, permission: Permission, tenantId: string) { return user.tenantId === tenantId && user.permissions.includes(permission); }"),
        t("IDOR e controle de objeto", "Evitar acesso por IDs previsiveis sem checagem de dono.", ("IDOR", "object ownership", "server-side checks", "non-guessable IDs"), code=_ts_note("IDOR defense", ("Never trust client tenant id", "Check ownership in query", "Test cross-tenant access"), "harden endpoint")),
        t("Seguranca de APIs", "Validar payloads, rate limit e contratos publicos.", ("schema validation", "rate limiting", "pagination", "API keys"), code=_ts_note("API security", ("Validate input", "Limit rate and size", "Return minimal errors"), "protect API")),
        t("Segredos e chaves de IA", "Guardar segredos fora do cliente e reduzir impacto de vazamento.", ("encryption", "hashing limits", "secret rotation", "server-side use"), code=_ts_note("Secret handling", ("Do not ship keys to browser", "Encrypt reversible secrets", "Rotate compromised keys"), "store secrets")),
        t("Criptografia de dados", "Aplicar TLS, hashing de senha e criptografia em repouso.", ("TLS", "password hashing", "KMS", "field encryption"), code=_ts_note("Crypto basics", ("Hash passwords with slow hash", "Encrypt secrets", "Use TLS everywhere"), "choose crypto")),
        t("Logs, auditoria e trilha por tenant", "Registrar eventos uteis sem expor dados sensiveis.", ("audit log", "PII minimization", "tenant id", "tamper evidence"), code=_ts_note("Audit events", ("Record actor/action/target", "Avoid raw secrets", "Keep tenant scoped logs"), "design audit")),
        t("Seguranca no CI/CD", "Proteger pipeline contra exfiltracao de segredos.", ("least privilege token", "protected branches", "dependency scanning", "OIDC"), code=_ts_note("CI security", ("Use scoped tokens", "Review third-party actions", "Pin critical dependencies"), "secure pipeline")),
        t("Dependencias e supply chain", "Reduzir risco de pacotes maliciosos e vulneraveis.", ("lockfile", "SBOM", "dependency review", "pinning"), code=_ts_note("Supply chain", ("Review lockfile changes", "Automate scans", "Avoid abandoned packages"), "review deps")),
        t("Resposta a incidentes SaaS", "Preparar deteccao, contencao e comunicacao.", ("runbook", "severity", "containment", "postmortem"), code=_ts_note("Incident response", ("Declare severity", "Contain tenant impact", "Write timeline"), "respond")),
        t("Checklist OWASP ASVS para SaaS", "Usar ASVS como baseline pratico de verificacao.", ("ASVS", "authentication", "access control", "input validation", "data protection"), code=_ts_note("ASVS baseline", ("Pick level by risk", "Map controls to tests", "Track evidence"), "verify controls")),
    )

    lb_topics = (
        t("O que um load balancer resolve", "Distribuir carga, remover instancias ruins e reduzir ponto unico de falha.", ("distribution", "availability", "health checks", "failover"), code=_ts_note("Load balancer", ("Spread requests", "Check health", "Hide instance churn"), "explain purpose")),
        t("Layer 4 vs Layer 7", "Diferenciar balanceamento TCP/UDP e HTTP.", ("L4", "L7", "TCP", "HTTP routing", "TLS"), code=_ts_note("L4 L7", ("L4 routes connections", "L7 understands HTTP", "TLS termination changes responsibility"), "choose layer")),
        t("Algoritmos de balanceamento", "Comparar round-robin, least connections e weighted.", ("round robin", "least connections", "weighted", "consistent hashing"), code="type Strategy = 'round-robin' | 'least-connections' | 'weighted';\nconst strategy: Strategy = 'least-connections';"),
        t("Health checks", "Projetar checks que detectam indisponibilidade real sem falso positivo.", ("readiness", "liveness", "timeout", "threshold"), code=_ts_note("Health check", ("Check dependencies carefully", "Use timeouts", "Avoid expensive probes"), "design probe")),
        t("Sticky sessions e state", "Entender quando afinidade ajuda e quando prejudica escala.", ("session affinity", "stateless app", "shared session store", "cache"), code=_ts_note("Sticky sessions", ("Prefer stateless services", "Use shared storage for sessions", "Avoid hiding imbalance"), "remove state")),
        t("TLS termination", "Escolher onde terminar TLS e como proteger trafego interno.", ("TLS", "certificate", "mTLS", "backend encryption"), code=_ts_note("TLS termination", ("Terminate at edge when useful", "Re-encrypt sensitive internal traffic", "Rotate certs"), "secure transport")),
        t("AWS ALB, NLB e Gateway LB", "Escolher o tipo de ELB correto na AWS.", ("ALB", "NLB", "Gateway Load Balancer", "target groups"), exam_focus="ALB para HTTP routing; NLB para alta performance TCP/UDP; Gateway LB para appliances virtuais."),
        t("Escala e autoscaling", "Ligar metricas de trafego a ajuste de capacidade.", ("target tracking", "CPU", "requests per target", "scale out", "scale in"), code=_ts_note("Autoscaling", ("Scale on useful metrics", "Set cooldowns", "Avoid oscillation"), "tune scaling")),
        t("Observabilidade do balanceador", "Monitorar latencia, erros e saturacao.", ("latency", "5xx", "target response time", "access logs"), code=_ts_note("LB metrics", ("Watch 5xx from target", "Track p95 latency", "Inspect access logs"), "debug traffic")),
        t("Entrevista de load balancer", "Responder desenho de sistema com trade-offs de disponibilidade.", ("SPOF", "multi-AZ", "global traffic", "backpressure"), interview="Desenhe uma API atras de balanceadores multi-AZ e explique o que acontece quando uma zona falha."),
    )

    actions_topics = (
        t("Workflow, events, jobs e steps", "Entender a anatomia de um workflow GitHub Actions.", ("workflow", "on", "jobs", "steps", "runner"), code="name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test"),
        t("Triggers e filtros", "Controlar quando pipelines rodam.", ("push", "pull_request", "workflow_dispatch", "schedule", "paths"), code=_ts_note("Actions triggers", ("Filter by branch", "Filter by path", "Add manual dispatch"), "reduce CI noise")),
        t("Matrix builds", "Testar varias versoes de Node ou sistemas.", ("strategy.matrix", "fail-fast", "include", "exclude"), code="strategy:\n  matrix:\n    node: [20, 22]\nsteps:\n  - uses: actions/setup-node@v4\n    with:\n      node-version: ${{ matrix.node }}"),
        t("Cache e artefatos", "Acelerar CI e preservar saidas.", ("cache", "artifacts", "dependency key", "restore keys"), code=_ts_note("Actions cache", ("Key by lockfile", "Cache dependencies", "Upload test reports"), "speed up CI")),
        t("Secrets, vars e environments", "Guardar configuracoes sem vazar credenciais.", ("secrets", "vars", "environments", "protection rules"), code="env:\n  API_URL: ${{ vars.API_URL }}\nsteps:\n  - run: npm run deploy\n    env:\n      TOKEN: ${{ secrets.DEPLOY_TOKEN }}"),
        t("Permissions e GITHUB_TOKEN", "Aplicar menor privilegio ao token do workflow.", ("permissions", "contents read", "id-token", "pull-requests"), code="permissions:\n  contents: read\n  id-token: write"),
        t("Reusable workflows", "Evitar duplicacao entre repositorios.", ("workflow_call", "inputs", "secrets", "outputs"), code=_ts_note("Reusable workflow", ("Expose typed inputs", "Pass secrets explicitly", "Version shared workflows"), "reuse CI")),
        t("OIDC para cloud deploy", "Trocar secrets longos por federacao de identidade.", ("OIDC", "id-token", "cloud role", "short-lived credentials"), code=_ts_note("OIDC deploy", ("Grant id-token write", "Trust repo/branch claims", "Avoid static cloud keys"), "secure deploy")),
        t("Service containers", "Subir Postgres/Redis para testes integrados.", ("services", "ports", "health checks", "postgres"), code="services:\n  postgres:\n    image: postgres:16\n    env:\n      POSTGRES_PASSWORD: postgres\n    options: >-\n      --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5"),
        t("Deploy com approvals", "Usar environments para controlar producao.", ("environment", "reviewers", "deployment", "rollback"), code=_ts_note("Deployment gate", ("Use production environment", "Require reviewers", "Keep rollback simple"), "gate deploy")),
        t("Debug de pipelines", "Ler logs, contexts e reruns sem mascarar erro real.", ("contexts", "step summary", "rerun failed jobs", "debug logging"), code=_ts_note("Actions debug", ("Print safe context only", "Use step summaries", "Re-run failed jobs"), "debug CI")),
        t("Seguranca em pull requests", "Evitar execucao perigosa de codigo de fork.", ("pull_request", "pull_request_target", "third-party actions", "pinning"), code=_ts_note("PR security", ("Avoid secrets on fork code", "Use pull_request_target carefully", "Pin trusted actions"), "secure PR")),
    )

    interview_topics = (
        t("Metodo STAR tecnico", "Responder experiencias com contexto, acao e resultado.", ("situation", "task", "action", "result"), interview="Conte uma falha tecnica, o que voce mudou e qual foi o resultado mensuravel."),
        t("Perguntas de React", "Preparar respostas de hooks, render e performance.", ("hooks", "state", "memoization", "effects"), code=_ts_note("React interview", ("Explain useEffect cleanup", "Discuss memo trade-offs", "Mention testing"), "practice answer")),
        t("Perguntas de TypeScript", "Explicar types, interfaces, generics e narrowing.", ("type vs interface", "generics", "union", "narrowing"), code="type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };"),
        t("Perguntas de Node e APIs", "Cobrir event loop, REST, erro e resiliencia.", ("event loop", "REST", "idempotency", "timeouts"), code=_ts_note("API interview", ("Define idempotency", "Set timeouts", "Use structured errors"), "answer backend")),
        t("Perguntas de banco de dados", "Comparar SQL, NoSQL, indices e transacoes.", ("indexes", "transactions", "normalization", "NoSQL"), interview="Quando voce escolheria Postgres em vez de DynamoDB?"),
        t("Perguntas de cloud AWS", "Responder servicos por caso de uso.", ("S3", "EC2", "Lambda", "RDS", "IAM"), exam_focus="Use a logica do CLF-C02: reconheca o servico certo pelo problema."),
        t("Perguntas de DevOps", "Falar de CI/CD, rollback, observabilidade e incidentes.", ("CI/CD", "rollback", "monitoring", "incident response"), code=_ts_note("DevOps interview", ("Small deploys", "Fast rollback", "Actionable alerts"), "answer DevOps")),
        t("Perguntas de seguranca", "Cobrir auth, authorization, secrets e OWASP.", ("authn", "authz", "secrets", "OWASP"), interview="Explique como impedir IDOR em uma API multi-tenant."),
        t("Perguntas comportamentais", "Mostrar colaboracao sem parecer decorado.", ("ownership", "conflict", "feedback", "learning"), interview="Use fatos concretos: problema, decisao, trade-off, resultado."),
        t("Live coding", "Organizar raciocinio em voz alta.", ("clarify", "edge cases", "complexity", "tests"), code=_ts_note("Live coding", ("Clarify input", "Start simple", "Name complexity", "Test edge cases"), "solve problem")),
        t("System design interview", "Estruturar requisitos, capacidade e trade-offs.", ("requirements", "capacity", "APIs", "data model", "bottlenecks"), interview="Comece pelo escopo e desenhe um MVP antes de otimizar."),
        t("Perguntas para o entrevistador", "Avaliar time, processo e expectativas.", ("team process", "success metrics", "on-call", "growth"), interview="Pergunte como o time mede sucesso nos primeiros 90 dias."),
    )

    system_design_topics = (
        t("Framework de system design", "Organizar resposta de requisitos ate trade-offs.", ("functional requirements", "non-functional requirements", "capacity", "trade-offs"), code=_ts_note("System design", ("Clarify requirements", "Estimate scale", "Pick storage", "Discuss trade-offs"), "structure answer")),
        t("Estimativas de capacidade", "Calcular QPS, storage e largura de banda sem travar.", ("QPS", "storage", "bandwidth", "peak traffic"), code="type Estimate = { qps: number; avgPayloadKb: number; storageGbPerDay: number };\nconst estimate: Estimate = { qps: 500, avgPayloadKb: 4, storageGbPerDay: 500 * 4 * 86400 / 1024 / 1024 };"),
        t("APIs e contratos", "Definir endpoints, payloads e idempotencia.", ("REST", "pagination", "idempotency keys", "versioning"), code=_ts_note("API design", ("Use idempotency for retries", "Paginate lists", "Version breaking changes"), "design contract")),
        t("Modelagem de dados", "Escolher entidades, indices e padroes de acesso.", ("entities", "indexes", "access patterns", "consistency"), code=_ts_note("Data model", ("Start from queries", "Add indexes deliberately", "State consistency needs"), "model data")),
        t("Cache", "Usar cache sem quebrar consistencia.", ("TTL", "cache aside", "invalidation", "hot keys"), code=_ts_note("Cache design", ("Cache read-heavy data", "Plan invalidation", "Protect hot keys"), "add cache")),
        t("Filas e processamento async", "Desacoplar trabalho lento e absorver picos.", ("queue", "worker", "retry", "dead letter queue"), code=_ts_note("Async processing", ("Queue slow work", "Retry with backoff", "Use DLQ for poison messages"), "design worker")),
        t("Consistencia e CAP", "Explicar consistencia eventual e conflitos.", ("strong consistency", "eventual consistency", "partition tolerance", "conflict resolution"), interview="Diga qual inconsistencia o produto aceita e por quanto tempo."),
        t("Sharding e particionamento", "Dividir dados por escala e evitar hotspots.", ("shard key", "partition", "hotspot", "rebalancing"), code=_ts_note("Sharding", ("Choose stable shard key", "Avoid sequential hot keys", "Plan rebalancing"), "scale storage")),
        t("Rate limiting", "Proteger servicos e garantir fairness.", ("token bucket", "leaky bucket", "per-user limit", "global limit"), code="type RateLimit = { key: string; limit: number; windowSeconds: number };\nconst limit: RateLimit = { key: 'tenant:123', limit: 1000, windowSeconds: 60 };"),
        t("Observabilidade", "Definir logs, metricas, traces e alertas.", ("logs", "metrics", "traces", "SLO", "alerting"), code=_ts_note("Observability", ("Track RED metrics", "Trace critical paths", "Alert on symptoms"), "instrument system")),
        t("Disponibilidade e DR", "Planejar multi-AZ, backup e recuperacao.", ("RTO", "RPO", "multi-AZ", "backup", "failover"), code=_ts_note("DR plan", ("Define RTO/RPO", "Test restore", "Avoid single AZ dependency"), "plan resilience")),
        t("Design de notificacoes", "Criar sistema de email/push/webhook confiavel.", ("fanout", "preferences", "deduplication", "webhooks"), code=_ts_note("Notifications", ("Store preferences", "Deduplicate events", "Retry webhooks safely"), "design notifications")),
        t("Design de chat", "Pensar em tempo real, ordenacao e historico.", ("WebSocket", "message ordering", "presence", "history"), code=_ts_note("Chat design", ("Use connection gateway", "Persist messages", "Handle reconnects"), "design chat")),
        t("Design de feed", "Comparar fanout on write e fanout on read.", ("timeline", "fanout", "ranking", "backfill"), interview="Explique o trade-off entre escrever muito cedo e calcular no momento da leitura."),
        t("Design de encurtador de URL", "Treinar uma pergunta classica de system design.", ("unique IDs", "redirect latency", "analytics", "expiration"), code=_ts_note("URL shortener", ("Generate compact IDs", "Cache hot redirects", "Track analytics async"), "solve classic")),
        t("Revisao final de trade-offs", "Fechar desenhos com gargalos e proximos passos.", ("bottlenecks", "cost", "complexity", "operability"), interview="Finalize dizendo o que mediria primeiro em producao."),
    )

    microservices_topics = (
        t("Monolito modular vs microservices", "Escolher arquitetura pelo problema, nao por moda.", ("modular monolith", "service boundary", "team autonomy", "operational cost"), code=_ts_note("Microservices", ("Start modular", "Split by bounded context", "Pay operational cost knowingly"), "choose architecture")),
        t("Bounded contexts", "Definir limites de servico por dominio.", ("DDD", "bounded context", "ubiquitous language", "ownership"), interview="Qual dado pertence a qual servico e quem e dono da regra?"),
        t("APIs entre servicos", "Projetar contratos REST/gRPC/eventos.", ("REST", "gRPC", "events", "schema evolution"), code=_ts_note("Service API", ("Version contracts", "Keep payloads explicit", "Avoid chatty calls"), "design interface")),
        t("Banco por servico", "Evitar acoplamento por tabelas compartilhadas.", ("database per service", "ownership", "read model", "replication"), code=_ts_note("Data ownership", ("Do not share write tables", "Expose API/events", "Build read models"), "split data")),
        t("Consistencia eventual", "Usar eventos e reconciliacao quando transacao global nao escala.", ("eventual consistency", "outbox", "saga", "compensation"), code=_ts_note("Consistency", ("Use outbox for reliable events", "Compensate failed steps", "Expose pending states"), "design saga")),
        t("Mensageria e eventos", "Desacoplar servicos com filas e topicos.", ("queue", "topic", "consumer group", "idempotent consumer"), code=_ts_note("Messaging", ("Make consumers idempotent", "Track offsets", "Use DLQ"), "consume events")),
        t("Service discovery e config", "Encontrar servicos e distribuir configuracao.", ("service discovery", "config service", "environment", "feature flags"), code=_ts_note("Discovery", ("Use platform discovery", "Keep config typed", "Audit flag changes"), "operate services")),
        t("API Gateway", "Centralizar entrada sem virar gargalo de regras.", ("routing", "auth", "rate limit", "BFF"), code=_ts_note("API Gateway", ("Route and authenticate", "Avoid business logic bloat", "Rate limit at edge"), "design gateway")),
        t("Observabilidade distribuida", "Correlacionar logs, metricas e traces por request.", ("correlation id", "distributed tracing", "structured logs", "SLO"), code=_ts_note("Tracing", ("Propagate request id", "Trace cross-service calls", "Log structured fields"), "debug distributed")),
        t("Resiliencia: timeout, retry, circuit breaker", "Impedir efeito domino entre servicos.", ("timeout", "retry budget", "backoff", "circuit breaker"), code=_ts_note("Resilience", ("Set timeouts", "Retry only safe calls", "Open circuit on failure"), "protect service")),
        t("Deploy independente", "Permitir mudancas sem coordenacao global.", ("CI/CD", "canary", "backward compatibility", "rollback"), code=_ts_note("Independent deploy", ("Keep contracts compatible", "Use canaries", "Rollback fast"), "deploy service")),
        t("Seguranca service-to-service", "Autenticar chamadas internas e aplicar menor privilegio.", ("mTLS", "service identity", "scopes", "zero trust"), code=_ts_note("Service security", ("Authenticate internal calls", "Authorize by scope", "Rotate credentials"), "secure mesh")),
        t("Testes em microservices", "Combinar unit, contract, integration e e2e.", ("contract tests", "consumer driven", "test pyramid", "sandbox"), code=_ts_note("Microservice tests", ("Contract test APIs", "Keep e2e small", "Use fakes intentionally"), "test services")),
        t("Quando microservices dao errado", "Reconhecer sinais de excesso de distribuicao.", ("distributed monolith", "shared database", "chatty calls", "unclear ownership"), interview="Explique quando voce manteria um monolito modular."),
    )

    messaging_topics = (
        t("Fundamentos de mensageria", "Entender filas, topicos e pub/sub para entrevistas.", ("queue", "topic", "producer", "consumer", "pub/sub"), code=_ts_note("Messaging basics", ("Queue balances work", "Topic broadcasts events", "Consumer processes asynchronously"), "explain messaging")),
        t("Kafka vs RabbitMQ vs SQS", "Comparar log distribuido, broker tradicional e fila gerenciada.", ("Kafka", "RabbitMQ", "SQS", "ordering", "retention"), interview="Escolha ferramenta pelo padrao de consumo, ordenacao e operacao."),
        t("At-least-once e idempotencia", "Lidar com mensagens duplicadas corretamente.", ("at-least-once", "idempotency key", "deduplication", "side effects"), code="type Message = { id: string; type: string; payload: unknown };\nconst processed = new Set<string>();\nfunction handle(message: Message) { if (processed.has(message.id)) return; processed.add(message.id); }"),
        t("Ordering e particionamento", "Garantir ordem por chave sem sacrificar toda escala.", ("partition key", "ordering", "consumer group", "hot partition"), code=_ts_note("Message ordering", ("Order by aggregate key", "Avoid global ordering", "Watch hot partitions"), "design partitions")),
        t("Retries e dead letter queue", "Recuperar falhas temporarias e isolar poison messages.", ("retry", "backoff", "DLQ", "poison message"), code=_ts_note("Retry design", ("Retry transient errors", "Use backoff", "Send repeated failures to DLQ"), "handle failure")),
        t("Outbox pattern", "Publicar eventos com garantia junto da escrita no banco.", ("transactional outbox", "poller", "event relay", "exactly once myth"), code=_ts_note("Outbox", ("Write event in same DB transaction", "Relay later", "Consumer stays idempotent"), "publish reliably")),
        t("Sagas", "Coordenar fluxo distribuido com compensacoes.", ("orchestration", "choreography", "compensation", "state"), code=_ts_note("Saga", ("Persist saga state", "Compensate failed steps", "Avoid hidden synchronous chains"), "coordinate flow")),
        t("Backpressure", "Evitar que consumidores sejam esmagados por picos.", ("consumer lag", "rate limit", "autoscaling", "load shedding"), code=_ts_note("Backpressure", ("Monitor lag", "Scale consumers", "Throttle producers"), "protect consumers")),
        t("Perguntas classicas de mensageria", "Treinar respostas para filas em system design.", ("delivery guarantee", "ordering", "duplication", "retention"), interview="Explique por que exactly-once fim-a-fim costuma ser promessa perigosa."),
    )

    return (
        CourseSpec("prova Aws cloud practitioner", "Curso completo para a prova AWS Cloud Practitioner CLF-C02, com foco forte em dominios, servicos e simulados.", None, aws_topics),
        CourseSpec("React", "Curso completo de React moderno com TypeScript, arquitetura e entrevistas.", None, react_topics),
        CourseSpec("Vite", "Curso pratico de Vite para React TypeScript, build, env e deploy.", None, vite_topics),
        CourseSpec("cybersecurity para saas", "Seguranca aplicada a SaaS multi-tenant, APIs, segredos e CI/CD.", None, saas_security_topics),
        CourseSpec("load balancer", "Balanceamento de carga para entrevistas, AWS e operacao real.", None, lb_topics),
        CourseSpec("GitHub actions", "CI/CD com GitHub Actions, seguranca e deploy profissional.", None, actions_topics),
        CourseSpec("perguntas de entrevista", "Perguntas tecnicas e comportamentais para entrevistas de software.", None, interview_topics),
        CourseSpec("system design", "System design para entrevistas e sistemas reais.", None, system_design_topics),
        CourseSpec("microservices", "Microservices com foco em limites, dados, mensageria e operacao.", None, microservices_topics),
        CourseSpec("mensageira para entrevistas", "Mensageria para entrevistas: filas, eventos, Kafka, SQS, retries e sagas.", None, messaging_topics),
    )


def _clean_code_example(code: str | None) -> str | None:
    if not code:
        return None
    if "StudyNote" in code:
        return None
    return code.strip() or None


def _course_context(course: CourseSpec) -> tuple[str, str, str]:
    name = normalize(course.name)
    if "aws" in name:
        return (
            "Como reconhecer na prova",
            "Leia o cenario e procure palavras de decisao: responsabilidade, custo, seguranca, disponibilidade, tipo de servico e operacao gerenciada. A prova CLF-C02 cobra reconhecer o servico ou conceito certo, nao implementar arquitetura profunda.",
            "Pegadinha comum: confundir nomes parecidos ou escolher o servico mais tecnico quando a pergunta pede uma responsabilidade, um plano de suporte ou uma ferramenta de custo.",
        )
    if name in {"react", "vite", "github actions"}:
        return (
            "Como aplicar no projeto",
            "Transforme o conceito em uma mudanca pequena, testavel e facil de revisar. Prefira exemplos curtos, tipados e ligados ao fluxo real do app em vez de snippets decorativos.",
            "Pegadinha comum: memorizar sintaxe e esquecer comportamento, ciclo de vida, seguranca ou impacto no build/deploy.",
        )
    if "cybersecurity" in name:
        return (
            "Como aplicar em SaaS",
            "Comece pelo limite de tenant, valide identidade e permissao no servidor, registre auditoria util e teste tentativas de acesso cruzado. Seguranca boa precisa aparecer no codigo, no banco, no CI/CD e na operacao.",
            "Pegadinha comum: confiar em tenant enviado pelo cliente, logar dados sensiveis ou tratar autenticacao como se fosse autorizacao.",
        )
    if "system design" in name or "load balancer" in name or "microservices" in name or "mensageira" in name:
        return (
            "Como usar em desenho de sistema",
            "Explique requisitos, volume, gargalos e trade-offs antes de escolher tecnologia. Mostre como o sistema falha, como se recupera e quais metricas provam que a decisao funcionou.",
            "Pegadinha comum: desenhar componentes demais sem justificar custo operacional, consistencia, latencia e observabilidade.",
        )
    return (
        "Como responder em entrevista",
        "Use uma resposta objetiva: defina o conceito, cite um exemplo real, compare uma alternativa e feche com o risco principal.",
        "Pegadinha comum: responder com buzzwords sem conectar a uma experiencia concreta.",
    )


def _section(title: str, body: str, code_example: str | None = None) -> dict:
    section = {"title": title, "body": body}
    if code_example:
        section["code_example"] = code_example
    return section


def build_topic_content(course: CourseSpec, topic: TopicSpec) -> dict:
    concepts = list(topic.concepts)
    code_example = _clean_code_example(topic.code)
    exam_sentence = topic.exam_focus or "Em entrevista, conecte o conceito a um problema real, trade-offs e uma decisao concreta."
    interview_sentence = topic.interview or "Boa resposta: explique o problema, compare alternativas, cite riscos e feche com uma decisao."
    application_title, application_body, pitfall = _course_context(course)
    concept_list = ", ".join(concepts[:6])

    sections = [
        _section(
            "O que precisa ficar claro",
            (
                f"{topic.objective}\n\n"
                f"Conceitos-chave: {concept_list}.\n\n"
                f"Explique com suas palavras: o que muda quando voce entende {concepts[0]} e "
                "qual decisao fica mais facil de tomar."
            ),
        ),
        _section(
            application_title,
            (
                f"{application_body}\n\n"
                f"Neste topico, use {concepts[0]} como pista principal e compare com "
                f"{concepts[1] if len(concepts) > 1 else 'a alternativa mais proxima'} antes de responder."
            ),
        ),
        _section(
            "Armadilhas e revisao",
            (
                f"{exam_sentence}\n\n"
                f"{pitfall}\n\n"
                f"{interview_sentence} Revise tentando criar um exemplo de uma frase, nao copiando uma definicao."
            ),
        ),
    ]
    if code_example:
        sections.append(
            _section(
                "Exemplo pratico",
                "Use este exemplo como apoio, nao como decoracao. Leia o comportamento, depois tente reescrever de memoria.",
                code_example,
            )
        )

    content = {
        "title": topic.title,
        "sections": sections,
        "quiz": [
            {
                "id": 1,
                "question": f"Qual frase resume melhor {topic.title}?",
                "options": [
                    topic.objective,
                    "Uma tecnica que deve ser aplicada em todos os casos sem analisar requisitos.",
                    "Um detalhe apenas visual que nao afeta arquitetura nem operacao.",
                    "Uma regra obsoleta que nao aparece em projetos atuais.",
                ],
                "correct_option": topic.objective,
                "explanation": "A resposta correta conecta o topico ao problema que ele resolve, nao apenas ao nome da tecnologia.",
            },
            {
                "id": 2,
                "question": f"O que torna uma resposta sobre {topic.title} mais forte?",
                "options": [
                    f"Relacionar {concepts[0]} com trade-offs, riscos e criterio de escolha.",
                    "Escolher a ferramenta mais famosa sem explicar o motivo.",
                    "Ignorar seguranca, custo e operacao para responder mais rapido.",
                    "Falar apenas de sintaxe sem explicar comportamento.",
                ],
                "correct_option": f"Relacionar {concepts[0]} com trade-offs, riscos e criterio de escolha.",
                "explanation": "Entrevistas e provas cobram reconhecimento de cenario e decisao, nao apenas memorizacao.",
            },
            {
                "id": 3,
                "question": f"Qual e um risco comum ao estudar {topic.title}?",
                "options": [
                    "Decorar palavras-chave sem conseguir aplicar em um caso real.",
                    "Criar exemplos pequenos em TypeScript para testar entendimento.",
                    "Comparar alternativas antes de decidir.",
                    "Explicar limites e observabilidade da solucao.",
                ],
                "correct_option": "Decorar palavras-chave sem conseguir aplicar em um caso real.",
                "explanation": "O objetivo do curso e transformar conceito em decisao pratica, com exemplos e flashcards.",
            },
        ],
        "flashcards": [
            {
                "front": f"O que lembrar sobre {topic.title}?",
                "back": topic.objective,
            },
            {
                "front": f"Quais conceitos-chave sustentam {topic.title}?",
                "back": ", ".join(concepts),
            },
            {
                "front": f"Qual pegadinha ou trade-off revisar em {topic.title}?",
                "back": exam_sentence,
            },
            {
                "front": f"Como explicar {topic.title} em uma entrevista?",
                "back": interview_sentence,
            },
        ],
    }
    return TopicAIContentSchema.model_validate(content).model_dump(exclude_none=True)


def normalize(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def _load_local_secrets() -> None:
    secrets_path = ROOT / "local.secrets"
    if not secrets_path.exists():
        return
    for raw_line in secrets_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _find_child(session: Session, email: str, child_name: str) -> ChildProfile:
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        raise SeedError(f"User not found: {email}")

    children = session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).all()
    target = normalize(child_name)
    for child in children:
        if normalize(child.name) == target:
            return child
    raise SeedError(f"Child not found for {email}: {child_name}")


def _is_bad_seed_flashcard(card: ProgrammingFlashcard, course: CourseSpec, topic: TopicSpec) -> bool:
    front = normalize(card.front)
    old_prefix = normalize(f"{course.name} / {topic.title}:")
    return (
        front.startswith(old_prefix)
        or "qual problema este topico resolve" in front
        or "cite os conceitos-chave" in front
        or "StudyNote" in (card.code_example or "")
    )


def _delete_flashcard_with_review_items(session: Session, card: ProgrammingFlashcard) -> None:
    review_items = session.exec(
        select(CodingReviewItem).where(CodingReviewItem.flashcard_id == card.id)
    ).all()
    for item in review_items:
        session.delete(item)
    session.delete(card)


def _clean_existing_seed_flashcards(
    session: Session,
    *,
    existing_flashcards: list[ProgrammingFlashcard],
    content: dict,
    course: CourseSpec,
    topic: TopicSpec,
    result: SeedResult,
) -> list[ProgrammingFlashcard]:
    drafts = [
        draft
        for draft in content.get("flashcards", [])
        if str(draft.get("front") or "").strip() and str(draft.get("back") or "").strip()
    ]
    bad_cards = [
        card for card in existing_flashcards if _is_bad_seed_flashcard(card, course, topic)
    ]
    if not bad_cards:
        return existing_flashcards

    bad_object_ids = {id(card) for card in bad_cards}
    kept_cards = [card for card in existing_flashcards if id(card) not in bad_object_ids]
    kept_fronts = {normalize(card.front) for card in kept_cards}

    for draft, card in zip(drafts, bad_cards):
        front = str(draft.get("front") or "").strip()[:500]
        back = str(draft.get("back") or "").strip()[:2000]
        if normalize(front) in kept_fronts:
            _delete_flashcard_with_review_items(session, card)
            result.flashcards_cleaned += 1
            continue
        card.front = front
        card.back = back
        card.code_example = None
        session.add(card)
        kept_cards.append(card)
        kept_fronts.add(normalize(front))
        result.flashcards_cleaned += 1

    for card in bad_cards[len(drafts):]:
        _delete_flashcard_with_review_items(session, card)
        result.flashcards_cleaned += 1

    session.flush()
    return kept_cards


def seed_courses(
    session: Session,
    *,
    email: str = TARGET_EMAIL,
    child_name: str = TARGET_CHILD,
    catalog: Iterable[CourseSpec] | None = None,
) -> SeedResult:
    child = _find_child(session, email, child_name)
    child_id = child.id or 0
    result = SeedResult()
    now = datetime.utcnow()
    courses = tuple(catalog or get_course_catalog())

    existing_subjects = session.exec(
        select(ProgrammingSubject).where(ProgrammingSubject.child_id == child_id)
    ).all()
    subjects_by_name = {normalize(subject.name): subject for subject in existing_subjects}

    for course in courses:
        subject = subjects_by_name.get(normalize(course.name))
        if subject is None:
            subject = ProgrammingSubject(
                child_id=child_id,
                name=course.name,
                description=course.description[:500],
                icon_emoji=course.icon_emoji,
                created_at=now,
            )
            session.add(subject)
            session.flush()
            subjects_by_name[normalize(course.name)] = subject
            result.subjects_created += 1
        else:
            if not subject.description:
                subject.description = course.description[:500]
                session.add(subject)
            if not subject.icon_emoji and course.icon_emoji:
                subject.icon_emoji = course.icon_emoji
                session.add(subject)

        subject_id = subject.id or 0
        existing_topics = session.exec(
            select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)
        ).all()
        topics_by_title = {normalize(topic.title): topic for topic in existing_topics}

        for order_index, topic_spec in enumerate(course.topics):
            content = build_topic_content(course, topic_spec)
            topic = topics_by_title.get(normalize(topic_spec.title))
            if topic is None:
                topic = ProgrammingTopic(
                    subject_id=subject_id,
                    title=topic_spec.title,
                    order_index=order_index,
                    status="not_started",
                    ai_content=content,
                    created_at=now,
                    updated_at=now,
                )
                session.add(topic)
                session.flush()
                topics_by_title[normalize(topic_spec.title)] = topic
                result.topics_created += 1
            else:
                changed = False
                if topic.ai_content != content:
                    topic.ai_content = content
                    changed = True
                if topic.order_index != order_index:
                    topic.order_index = order_index
                    changed = True
                if changed:
                    topic.updated_at = now
                    session.add(topic)
                    result.topics_updated += 1

            topic_id = topic.id or 0
            existing_flashcards = session.exec(
                select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)
            ).all()
            existing_flashcards = _clean_existing_seed_flashcards(
                session,
                existing_flashcards=existing_flashcards,
                content=content,
                course=course,
                topic=topic_spec,
                result=result,
            )
            existing_fronts = {normalize(card.front) for card in existing_flashcards}

            for draft in content.get("flashcards", []):
                front = str(draft.get("front") or "").strip()
                back = str(draft.get("back") or "").strip()
                if not front or not back or normalize(front) in existing_fronts:
                    continue
                card = ProgrammingFlashcard(
                    topic_id=topic_id,
                    subject_id=subject_id,
                    child_id=child_id,
                    front=front[:500],
                    back=back[:2000],
                    code_example=str(draft.get("code_example") or "").strip()[:3000] or None,
                    created_at=now,
                )
                session.add(card)
                session.flush()
                seed_coding_review_item(session, child_id, card.id or 0)
                existing_fronts.add(normalize(front))
                result.flashcards_created += 1
                result.review_items_seeded += 1

    session.commit()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Helber/Henrique coding courses into the configured database.")
    parser.add_argument("--email", default=TARGET_EMAIL)
    parser.add_argument("--child", default=TARGET_CHILD)
    args = parser.parse_args()

    _load_local_secrets()
    from main import engine

    with Session(engine) as session:
        result = seed_courses(session, email=args.email, child_name=args.child)

    print(
        "Seed complete: "
        f"subjects_created={result.subjects_created} "
        f"topics_created={result.topics_created} "
        f"topics_updated={result.topics_updated} "
        f"flashcards_created={result.flashcards_created} "
        f"review_items_seeded={result.review_items_seeded} "
        f"flashcards_cleaned={result.flashcards_cleaned}"
    )


if __name__ == "__main__":
    main()
