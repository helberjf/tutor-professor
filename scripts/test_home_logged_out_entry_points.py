"""What a logged-out visitor meets on the home page.

Three defects reported from the live site, all in the same area:

  - the activity cards looked normal but did nothing, because being logged out
    rendered every one of them as a plain div instead of a link;
  - "Entrar" showed up twice, once in the notice and once in the hero;
  - "Área dos pais" led to a login wall, and the login then ignored where the
    visitor was headed and dropped everyone on /study.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOME_PAGE = ROOT / "apps" / "web" / "src" / "app" / "page.tsx"
LOGIN_PAGE = ROOT / "apps" / "web" / "src" / "app" / "login" / "page.tsx"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class HomeCardsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.home = read(HOME_PAGE)

    def test_being_logged_out_does_not_deaden_the_cards(self) -> None:
        # A dead card is indistinguishable from a broken one. Only a missing
        # server (or a status not resolved yet) may disable them.
        self.assertIn("const cardsDisabled = serverMissing || status === 'loading';", self.home)
        self.assertNotIn("isUnauthenticated || status === 'loading'", self.home)

    def test_logged_out_cards_route_through_the_login_and_come_back(self) -> None:
        self.assertRegex(
            self.home,
            r"isUnauthenticated \? `/login\?next=\$\{encodeURIComponent\(href\)\}` : href",
            "a logged-out card must carry the visitor back to where they clicked",
        )
        # Every activity card goes through that helper rather than a bare href.
        for route in ("/dashboard", "/lesson", "/review", "/diverse", "/chat", "/quick-review", "/books"):
            self.assertIn(f"cardHref('{route}')", self.home, f"{route} card bypasses cardHref")

    def test_a_truly_disabled_card_looks_disabled(self) -> None:
        # opacity-90 is invisible; a card nobody can click has to read that way.
        self.assertNotIn("'opacity-90'", self.home)
        self.assertIn("cursor-not-allowed", self.home)
        self.assertIn('aria-disabled="true"', self.home)


class HomeEntrarTests(unittest.TestCase):
    def test_entrar_appears_only_once(self) -> None:
        home = read(HOME_PAGE)
        # Count rendered labels, not the word in comments or aria text.
        occurrences = re.findall(r"^\s*Entrar\s*$", home, flags=re.MULTILINE)
        self.assertEqual(
            len(occurrences), 1,
            f"the home page should offer Entrar once, found {len(occurrences)}",
        )

    def test_the_login_notice_carries_no_buttons_of_its_own(self) -> None:
        home = read(HOME_PAGE)
        notice = home[home.index("Login notice for unauthenticated users"):]
        notice = notice[: notice.index("{/* Hero */}")]
        self.assertNotIn("/login", notice, "the notice must not repeat the hero's buttons")
        self.assertNotIn("/register", notice)


class ParentsAreaTests(unittest.TestCase):
    def test_parents_link_is_hidden_while_logged_out(self) -> None:
        home = read(HOME_PAGE)
        block = home[home.index("Parents area link"):]
        block = block[: block.index("</div>")]
        self.assertIn("isAuthenticated &&", block, "the parents link must not lead to a login wall")


class LoginRedirectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.login = read(LOGIN_PAGE)

    def test_login_honours_where_the_visitor_was_headed(self) -> None:
        self.assertNotIn("const next = '/study';", self.login, "next must not be hardcoded")
        self.assertIn("searchParams.get('next')", self.login)

    def test_login_refuses_an_off_site_redirect(self) -> None:
        # useRequireAuth builds ?next= from the pathname, but the query string is
        # attacker-controllable, so only same-site paths may be followed.
        self.assertIn("raw.startsWith('//')", self.login, "protocol-relative URLs must be rejected")
        self.assertIn("!raw.startsWith('/')", self.login, "absolute URLs must be rejected")


if __name__ == "__main__":
    unittest.main()
