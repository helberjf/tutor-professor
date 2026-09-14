"""Catch common unaccented Portuguese words in product-facing copy.

The scan deliberately ignores identifiers and comments. JSON translation fields,
Python string literals, and TypeScript/JSX string/text nodes are what reach users.
"""
from __future__ import annotations

import ast
import json
import re
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORED_STRING_VALUES = {
    "materia",
    "titulo",
    "'titulo'",
    "typescript-tipos-basicos",
    "'materia'",
    '"materia"',
}
FORBIDDEN = re.compile(
    r"\b(?:nao|voce|sessao|sessoes|licao|licoes|revisao|revisoes|questao|questoes|"
    r"inicio|possivel|impossivel|configuracao|configuracoes|proxima|proximo|ingles|"
    r"conteudo|conteudos|descricao|titulo|ja|faca|faco|alcanca|alcancar|"
    r"criacao|materia|materias|usuario|usuarios|"
    r"endereco|numero|pagina|informacao|informacoes|"
    r"tambem|"
    r"educacao|familia|saude|memoria|reuniao|opiniao|opinioes|deveriamos|"
    r"afirmacao|afirmacoes|expressao|expressoes|variacoes|validos|valido|"
    r"comecar|traducao|pontuacao|aprovacao|metodo|definicao|explicacao|distracao|"
    r"aparecerao|rapida|incrivel|geracao|credito|serao|pratica|emergencia|atencao|"
    r"tecnico|raciocinio|maximo|unica|unico|diferencas|definicoes|numeros|manha|"
    r"calca|agua|ceu|frances|programacao|situacoes|codigo|valido|expressao|comentarios|"
    r"portugues|vespera|secoes|duvida|introducao|motivacao|ligacao|saudacao|conclusao|classicas|"
    r"saidas|restricoes|mao|entao|diario|diaria|diarias|espacada|variaveis|minimo|minima|"
    r"unicos|unicas|solucao|solucoes|posicoes|recursao|tao|ate|amanha|seguranca|obrigatorio|"
    r"obrigatoria|invalido|invalida|paginas|apos|publico|autorizacao|historico|opcoes|automatico|"
    r"gramatica|criara|tres|facil|rapido|versao|peca|periodo|distracoes|observacao|notificacao|"
    r"interacao|repeticao|adicao|edicao|selecao|exibicao|situacao|duracao|observacoes|avaliacao|"
    r"recomendacao|confianca|tecnicos|analise|resolucao|aproximacao|automatica|proximas|"
    r"dificil|instavel|ouca|padroes|obrigacoes|autenticacao|protecao|validacao|conexao|genericas|"
    r"compativel|publica|historica|apresentacao|organizacao|medicao|compensacao|repeticoes|"
    r"disponivel|indisponivel|permissoes|parabens|basico|basicos|intermediario|intermediarios|"
    r"avancado|avancados|funcao|funcoes|assincrona|assincrono|servico|servicos|historia|historias|"
    r"maquina|maquinas|condicao|condicoes|aplicacao|aplicacoes|requisicao|requisicoes|gravacao|"
    r"trafego|transito|imutavel|imutaveis|temporaria|temporarias|latencia|cenario|cenarios|dominio|"
    r"dominios|logica|operacao|operacoes|politica|politicas|creditos|concluido|concluida|"
    r"disponiveis|propria|modulo|secao|sugestao|orientacao|subtopicos|util|classico|"
    r"paragrafos|progressao|visivel|indice|combinacao|concessao|oracao|decisao|comite|"
    r"preco|cartao|avo|exercicio|engracado|alemao|multipla|responsavel|precos|notavel|"
    r"feijao|mae|irma|irmao|cabeca|doi|onibus|aviao|estacao|medico|musica|cha|"
    r"licenca|otima|vovo|lapis|atras|oculos|gemeos|sabados|almocamos|continuo|"
    r"meu nome e|não e incomum|descrever como alguém e|como ele e|uteis|esforco|"
    r"migracao|decoracao|voltara|otimo|instalacao|sera|valida|sao|meu avó|"
    r"não achár|não e incomum|saido|proprio|nao|voce)\b",
    re.IGNORECASE,
)


def json_strings(value: object, key: str = ""):
    if isinstance(value, dict):
        for child_key, child in value.items():
            yield from json_strings(child, child_key)
    elif isinstance(value, list):
        for child in value:
            yield from json_strings(child, key)
    elif isinstance(value, str) and not key.endswith("_en") and key not in {"en", "slug", "id"}:
        yield value


def python_strings(path: Path):
    try:
        tokens = tokenize.generate_tokens(path.read_text(encoding="utf-8").splitlines(keepends=True).__iter__().__next__)
    except (SyntaxError, tokenize.TokenError, UnicodeDecodeError):
        return []
    found: list[str] = []
    for token in tokens:
        if token.type != tokenize.STRING:
            continue
        try:
            value = ast.literal_eval(token.string)
            if isinstance(value, str):
                found.append(value)
        except (SyntaxError, ValueError):
            found.append(token.string)
    return found


def typescript_strings(path: Path):
    text = path.read_text(encoding="utf-8")
    found = re.findall(r"'(?:\\.|[^'\\\r\n])*'|\"(?:\\.|[^\"\\\r\n])*\"|`(?:\\.|[^`\\])*`", text)
    found.extend(re.findall(r">([^<>\n{}]+)<", text))
    return found


def check(path: Path):
    if path.suffix == ".json":
        try:
            values = json_strings(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            return []
    elif path.suffix == ".py":
        values = python_strings(path)
    else:
        values = typescript_strings(path)
    return [
        (path, value.strip(), FORBIDDEN.search(value).group(0))
        for value in values
        if value.strip() not in IGNORED_STRING_VALUES and FORBIDDEN.search(value)
    ]


paths = []
for root, suffixes in ((ROOT / "apps" / "web" / "src", {".ts", ".tsx"}), (ROOT / "apps" / "api", {".py", ".json"})):
    paths.extend(path for path in root.rglob("*") if path.is_file() and path.suffix in suffixes)

violations = [violation for path in paths for violation in check(path)]
if violations:
    sample = "\n".join(f"{path.relative_to(ROOT)}: {word}: {value}" for path, value, word in violations[:80])
    raise SystemExit(f"unaccented Portuguese product copy found ({len(violations)} occurrences):\n{sample}")

print("Portuguese product copy checks passed.")
