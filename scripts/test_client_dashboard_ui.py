from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "apps/web/src/lib/api.ts").read_text(encoding="utf-8")
WIDGET = (ROOT / "apps/web/src/components/daily-activity-widget.tsx").read_text(encoding="utf-8")
LOG = (ROOT / "apps/web/src/components/daily-activity-log.tsx").read_text(encoding="utf-8")
CHART = (ROOT / "apps/web/src/components/weekly-activity-chart.tsx").read_text(encoding="utf-8")
OVERVIEW = (ROOT / "apps/web/src/components/dashboard-overview.tsx").read_text(encoding="utf-8")
SECTION = (ROOT / "apps/web/src/components/activity-log-section.tsx").read_text(encoding="utf-8")
DASHBOARD_PAGE = (ROOT / "apps/web/src/app/dashboard/page.tsx").read_text(encoding="utf-8")
STUDY_START = (ROOT / "apps/web/src/components/study-start-section.tsx").read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require("getActivityMonth" in API, "monthly activity endpoint is exposed")
    require("question" in WIDGET and "exam" in WIDGET, "widget supports question and exam activity types")
    require("total_duration_seconds" in WIDGET, "widget shows registered study time")
    require("average_score" in WIDGET, "widget shows average score")
    require("visibilitychange" in WIDGET and "addEventListener('focus'" in WIDGET, "widget refreshes on focus")
    require("slice(-3)" not in WIDGET, "dashboard timeline is not limited to three items")
    require("activityCount" in OVERVIEW, "30-day overview uses daily activity counts")
    require("getActivityMonth" in OVERVIEW, "overview loads the monthly activity feed")
    require("previousWeekActivities" in OVERVIEW and "Comparativo semanal" in OVERVIEW, "overview compares current and previous week")
    require("question" in LOG and "exam" in LOG, "full log labels new activity types")
    require("question" in CHART and "exam" in CHART, "weekly chart colors new activity types")
    require("'Quiz'" not in WIDGET + LOG + CHART, "quiz is presented as questions, not a separate category")
    require("quizzes" not in SECTION.lower(), "dashboard copy exposes only the simplified activity groups")
    require("visibleTypes" in CHART, "weekly legend only exposes activity types returned by the API")
    require("StudyStartSection" in DASHBOARD_PAGE, "dashboard must render the study launcher")
    require("Iniciar estudo" in STUDY_START, "dashboard must offer a direct study launcher")
    require("3 frases por dia" in STUDY_START, "English launcher must describe the daily phrase goal")
    require("/lesson" in STUDY_START, "dashboard launcher must link to lessons")
    require("/study?tab=english#english-questions" in STUDY_START, "dashboard launcher must deep-link to questions")
    require("/study?tab=english#english-grammar" in STUDY_START, "dashboard launcher must deep-link to grammar")
    require("/review" in STUDY_START, "dashboard launcher must link to review")
    require("/exams" in STUDY_START, "dashboard launcher must link to standalone simulados")
    require("Escolha como estudar hoje" not in STUDY_START, "old free-choice title must be replaced")
    print("Client dashboard UI checks passed.")


if __name__ == "__main__":
    main()
