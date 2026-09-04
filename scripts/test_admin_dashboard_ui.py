from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
DASHBOARD = ROOT / "apps" / "web" / "src" / "app" / "admin" / "page.tsx"
QUEUE = ROOT / "apps" / "web" / "src" / "components" / "admin-account-queue.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    api = API.read_text(encoding="utf-8")
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    queue = QUEUE.read_text(encoding="utf-8")

    require("export interface AdminNotification" in api, "admin notification type is exposed")
    require("recent_notifications: AdminNotification[]" in api, "overview exposes recent notifications")
    require("adminDeleteUser" in api, "admin account deletion is exposed in the API client")
    require("Visão geral" in dashboard, "dashboard labels the metrics overview")
    require("Últimas notificações" in dashboard, "dashboard renders recent notifications")
    require("Apagar conta" in queue, "account queue exposes the delete action")
    require("window.confirm" in queue, "account deletion requires explicit confirmation")
    require("adminDeleteUser(user.id)" in queue, "queue calls the admin delete endpoint")
    require("filter((item) => item.id !== user.id)" in queue, "queue removes the deleted account locally")

    print("Admin dashboard UI checks passed.")


if __name__ == "__main__":
    main()
