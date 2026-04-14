from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from schemas.schemas import QuizSchema


class ContentService:
    def __init__(self, quiz_dir: str | Path):
        self.quiz_dir = Path(quiz_dir)

    def _read_json(self, path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))

    def list_quizzes(self) -> list[QuizSchema]:
        quizzes: list[QuizSchema] = []
        for quiz_file in sorted(self.quiz_dir.glob("*.json")):
            quizzes.append(QuizSchema.model_validate(self._read_json(quiz_file)))
        return quizzes

    def get_quiz_for_lesson(self, lesson_id: int | None) -> QuizSchema | None:
        quizzes = self.list_quizzes()
        if not quizzes:
            return None

        if lesson_id is not None:
            for quiz in quizzes:
                if quiz.lesson_id == lesson_id:
                    return quiz

        return quizzes[0]
