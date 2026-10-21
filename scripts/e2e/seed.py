"""Synthetic fixtures only; never invoked with the user's application database."""
from datetime import date, datetime
import os

from safety import validate_database


def seed(main):
    validate_database(main.DATABASE_URL, os.environ["E2E_WORKSPACE"], os.environ["E2E_RUN_ID"])
    from sqlmodel import Session
    from models.database import User, ChildProfile, Lesson, LessonItem

    with Session(main.engine) as session:
        admin = User(first_name="Admin", last_name="E2E", email="admin@e2e.invalid",
                     cpf_hash="synthetic-admin", password_hash=main.hash_password("E2e!Synthetic123"),
                     status="approved", email_verified_at=datetime.utcnow(),
                     onboarding_completed_at=datetime.utcnow())
        session.add(admin)
        session.flush()
        session.add(ChildProfile(name="Estudante Admin E2E", user_id=admin.id, age_group="18+",
                                 birth_date=date(2000, 1, 1), auto_audio=False))
        student = User(first_name="Aluno", last_name="E2E", email="student@e2e.invalid",
                       cpf_hash="synthetic-student", password_hash=main.hash_password("E2e!Synthetic123"),
                       status="approved", email_verified_at=datetime.utcnow(),
                       onboarding_completed_at=datetime.utcnow())
        session.add(student)
        session.flush()
        session.add(ChildProfile(name="Estudante Codegen E2E", user_id=student.id, age_group="18+",
                                 birth_date=date(2000, 1, 1), auto_audio=False))
        lesson = Lesson(title="Saudações E2E", theme="Saudações", objective="Aprender saudações",
                        content={"daily_goal": "3 frases"}, target_language="English")
        session.add(lesson)
        session.flush()
        for english, portuguese in [("Good morning", "Bom dia"), ("Thank you", "Obrigado"),
                                     ("See you later", "Até mais")]:
            session.add(LessonItem(lesson_id=lesson.id, word_en=english, word_pt=portuguese,
                                   example_sentence_en=f"We say {english} every day.",
                                   example_sentence_pt=f"Dizemos {portuguese} todos os dias."))
        session.commit()
