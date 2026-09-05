from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
DASHBOARD = ROOT / "apps" / "web" / "src" / "app" / "admin" / "page.tsx"
QUEUE = ROOT / "apps" / "web" / "src" / "components" / "admin-account-queue.tsx"
NAVBAR = ROOT / "apps" / "web" / "src" / "components" / "navbar.tsx"
PARENTS = ROOT / "apps" / "web" / "src" / "app" / "parents" / "page.tsx"
CONNECT = ROOT / "apps" / "web" / "src" / "app" / "connect" / "page.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    api = API.read_text(encoding="utf-8")
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    queue = QUEUE.read_text(encoding="utf-8")
    navbar = NAVBAR.read_text(encoding="utf-8")
    parents = PARENTS.read_text(encoding="utf-8")
    connect = CONNECT.read_text(encoding="utf-8")

    require("export interface AdminNotification" in api, "admin notification type is exposed")
    require("recent_notifications: AdminNotification[]" in api, "overview exposes recent notifications")
    require("adminDeleteUser" in api, "admin account deletion is exposed in the API client")
    require("Visão geral" in dashboard, "dashboard labels the metrics overview")
    require("Últimas notificações" in dashboard, "dashboard renders recent notifications")
    require("Apagar conta" in queue, "account queue exposes the delete action")
    require("window.confirm" in queue, "account deletion requires explicit confirmation")
    require("adminDeleteUser(user.id)" in queue, "queue calls the admin delete endpoint")
    require("filter((item) => item.id !== user.id)" in queue, "queue removes the deleted account locally")
    require("adminSystemHealth" in api, "admin system health is exposed in the API client")
    require("Saude do sistema" in dashboard, "admin dashboard renders system health")
    require("daily_limit" in queue, "admin can change a user's daily AI limit")
    require("Vamos estudar" in navbar and "first_name" in navbar, "hamburger greets the signed-in person")
    require("Conexao com o backend" not in navbar, "normal navigation hides backend support")
    require("URL do Tunnel" not in parents, "parent settings hide backend connection controls")
    require("adminCheck" in connect, "backend connection page verifies administrator access")

    print("Admin dashboard UI checks passed.")


if __name__ == "__main__":
    main()
