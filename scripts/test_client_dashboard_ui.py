from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "apps/web/src/lib/api.ts").read_text(encoding="utf-8")
WIDGET = (ROOT / "apps/web/src/components/daily-activity-widget.tsx").read_text(encoding="utf-8")
LOG = (ROOT / "apps/web/src/components/daily-activity-log.tsx").read_text(encoding="utf-8")
CHART = (ROOT / "apps/web/src/components/weekly-activity-chart.tsx").read_text(encoding="utf-8")
OVERVIEW = (ROOT / "apps/web/src/components/dashboard-overview.tsx").read_text(encoding="utf-8")
SECTION = (ROOT / "apps/web/src/components/activity-log-section.tsx").read_text(encoding="utf-8")


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
    print("Client dashboard UI checks passed.")


if __name__ == "__main__":
    main()
