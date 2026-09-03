"""Optional product modules, switched on per account.

The app grew a second personality: besides the language tutor for children it
carries a programming curriculum, a LeetCode method trainer and flashcard decks.
Most accounts want one or the other, and showing both at once makes the product
harder to explain than it needs to be.

So each module is a switch. Only `language` is permanent; `coding` starts off
and the account turns it on in the settings page. A plan can later restrict the
same switches without any other part of the code learning a new concept.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModuleDefinition:
    id: str
    label: str
    description: str
    default_enabled: bool
    # A locked module cannot be switched off: without it there is no product.
    locked: bool = False


MODULE_DEFINITIONS: tuple[ModuleDefinition, ...] = (
    ModuleDefinition(
        id="language",
        label="Idiomas",
        description="Licoes diarias, quiz, revisao espacada e audio.",
        default_enabled=True,
        locked=True,
    ),
    ModuleDefinition(
        id="diverse",
        label="Estudos gerais",
        description="Materias livres com questoes geradas por IA.",
        default_enabled=True,
    ),
    ModuleDefinition(
        id="books",
        label="Livros",
        description="Historias geradas por IA com leitura assistida.",
        default_enabled=True,
    ),
    ModuleDefinition(
        id="exams",
        label="Simulados",
        description="Provas cronometradas com banco de questoes.",
        default_enabled=True,
    ),
    ModuleDefinition(
        id="coding",
        label="Programacao",
        description=(
            "Curriculo de programacao, flashcards de codigo, revisao por deck e "
            "treinador de metodos LeetCode."
        ),
        default_enabled=False,
    ),
)

MODULE_IDS: tuple[str, ...] = tuple(module.id for module in MODULE_DEFINITIONS)
MODULES_BY_ID: dict[str, ModuleDefinition] = {module.id: module for module in MODULE_DEFINITIONS}
DEFAULT_MODULES: dict[str, bool] = {
    module.id: module.default_enabled for module in MODULE_DEFINITIONS
}


def resolve_modules(stored: dict | None) -> dict[str, bool]:
    """Merge what the account chose over the defaults.

    Unknown keys from an older or newer version are dropped rather than trusted,
    and a locked module is always reported as on.
    """

    resolved = dict(DEFAULT_MODULES)
    for module_id, enabled in (stored or {}).items():
        if module_id in MODULES_BY_ID:
            resolved[module_id] = bool(enabled)
    for module in MODULE_DEFINITIONS:
        if module.locked:
            resolved[module.id] = True
    return resolved


def is_module_enabled(stored: dict | None, module_id: str) -> bool:
    return resolve_modules(stored).get(module_id, False)


def apply_module_changes(stored: dict | None, changes: dict) -> dict[str, bool]:
    """Return the new stored value after applying a settings update.

    Raises ValueError on an unknown module or an attempt to switch off a locked
    one, so the endpoint can answer 422 instead of silently ignoring the change.
    """

    updated = dict(stored or {})
    for module_id, enabled in changes.items():
        module = MODULES_BY_ID.get(module_id)
        if module is None:
            raise ValueError(f"Modulo desconhecido: {module_id}")
        if module.locked and not enabled:
            raise ValueError(f"O modulo {module.label} nao pode ser desligado.")
        updated[module_id] = bool(enabled)
    return {module_id: bool(value) for module_id, value in updated.items() if module_id in MODULES_BY_ID}
