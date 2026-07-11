"""Contract checks for appending AI questions to a canonical Diverse lesson."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "apps/api/main.py").read_text(encoding="utf-8")
schemas = (ROOT / "apps/api/schemas/schemas.py").read_text(encoding="utf-8")

assert "class GenerateDiverseQuestionsSchema" in schemas
assert "study_date: date" in schemas.split("class GenerateDiverseQuestionsSchema", 1)[1]
assert "subject_index: int = Field(ge=0)" in schemas
assert "lesson_id: str = Field(min_length=1, max_length=80)" in schemas
assert "context: Optional[str] = Field(default=None, max_length=1000)" in schemas

assert '@app.post("/api/study/diverse/questions/generate"' in main
endpoint = main.split("def generate_diverse_questions", 1)[1]
endpoint = endpoint.split("\n@app.", 1)[0]
assert "exam-style" in endpoint.lower()
assert "technical subject" in endpoint.lower()
assert "validate_card_batch" in endpoint
assert "topic_ids" in endpoint
assert "phrase_generation_service.generate_json_text" in endpoint
assert endpoint.count("session.commit()") == 1
assert "session.delete(" not in endpoint
assert endpoint.count("phrase_generation_service.generate_json_text") == 1
