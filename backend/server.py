from __future__ import annotations

import json
import os
import secrets
from datetime import UTC, datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "backend"))
STATE_PATH = DATA_DIR / "app_state.json"
SESSIONS_PATH = DATA_DIR / "sessions.json"
SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "shift_headcount_session")
APP_ENV = os.environ.get("APP_ENV", "development").lower()
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true" if APP_ENV == "production" else "false").lower() == "true"

USERS = {
    "admin": {
        "password": os.environ.get("ADMIN_PASSWORD", "Admin@123"),
        "role": "admin",
        "name": os.environ.get("ADMIN_NAME", "Operations Admin"),
    },
    "user": {
        "password": os.environ.get("USER_PASSWORD", "User@123"),
        "role": "user",
        "name": os.environ.get("USER_NAME", "Roster User"),
    },
}


def ensure_state_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def read_json_file(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_file(path: Path, payload: dict | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_state() -> dict | None:
    ensure_state_store()
    return read_json_file(STATE_PATH)


def write_state(payload: dict) -> None:
    ensure_state_store()
    write_json_file(STATE_PATH, payload)


def read_sessions() -> dict:
    ensure_state_store()
    return read_json_file(SESSIONS_PATH) or {}


def write_sessions(payload: dict) -> None:
    ensure_state_store()
    write_json_file(SESSIONS_PATH, payload)


def sanitized_session(payload: dict | None) -> dict | None:
    if not payload:
        return None
    return {
        "username": payload["username"],
        "role": payload["role"],
        "name": payload["name"],
    }


def build_session(username: str, account: dict) -> dict:
    return {
        "username": username,
        "role": account["role"],
        "name": account["name"],
        "createdAt": datetime.now(UTC).isoformat(),
    }


def uses_default_credentials() -> bool:
    return (
        USERS["admin"]["password"] == "Admin@123"
        and USERS["user"]["password"] == "User@123"
    )


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.response_cookies: list[str] = []
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.send_json(
                {
                    "status": "ok",
                    "environment": APP_ENV,
                    "cookieSecure": COOKIE_SECURE,
                }
            )
            return
        if self.path == "/api/auth/session":
            self.send_json(
                {
                    "user": sanitized_session(self.get_current_session()),
                    "auth": {
                        "environment": APP_ENV,
                        "usesDefaultCredentials": uses_default_credentials(),
                    },
                }
            )
            return
        if self.path == "/api/state":
            session = self.get_current_session()
            if not session:
                self.send_json({"error": "Authentication required."}, status=HTTPStatus.UNAUTHORIZED)
                return
            payload = read_state()
            if payload is None:
                self.send_json({"state": None})
            else:
                self.send_json({"state": payload})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/auth/logout":
            self.clear_current_session()
            self.send_json({"signedOut": True})
            return

        if self.path not in {"/api/auth/login", "/api/state"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")
            return

        body = self.read_json_body()
        if body is None:
            return

        if self.path == "/api/auth/login":
            username = str(body.get("username", "")).strip().lower()
            password = str(body.get("password", ""))
            account = USERS.get(username)
            if not account or account["password"] != password:
                self.send_json({"error": "Invalid username or password."}, status=HTTPStatus.UNAUTHORIZED)
                return
            session = build_session(username, account)
            self.create_session(session)
            self.send_json({"user": sanitized_session(session)})
            return

        if "state" not in body or not isinstance(body["state"], dict):
            self.send_error(HTTPStatus.BAD_REQUEST, "Expected body.state object")
            return

        session = self.get_current_session()
        if not session:
            self.send_json({"error": "Authentication required."}, status=HTTPStatus.UNAUTHORIZED)
            return

        write_state(body["state"])
        self.send_json({"saved": True})

    def read_json_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON body")
            return None

    def get_current_session_id(self) -> str:
        cookie_header = self.headers.get("Cookie", "")
        if not cookie_header:
            return ""
        cookies = SimpleCookie()
        cookies.load(cookie_header)
        morsel = cookies.get(SESSION_COOKIE_NAME)
        return morsel.value if morsel else ""

    def get_current_session(self) -> dict | None:
        session_id = self.get_current_session_id()
        if not session_id:
            return None
        return read_sessions().get(session_id)

    def create_session(self, session: dict) -> None:
        session_id = secrets.token_urlsafe(32)
        sessions = read_sessions()
        sessions[session_id] = session
        write_sessions(sessions)
        self.set_session_cookie(session_id)

    def clear_current_session(self) -> None:
        session_id = self.get_current_session_id()
        if session_id:
            sessions = read_sessions()
            if session_id in sessions:
                del sessions[session_id]
                write_sessions(sessions)
        self.set_session_cookie("", expires="Thu, 01 Jan 1970 00:00:00 GMT")

    def set_session_cookie(self, session_id: str, expires: str | None = None) -> None:
        parts = [f"{SESSION_COOKIE_NAME}={session_id}", "Path=/", "HttpOnly", "SameSite=Lax"]
        if COOKIE_SECURE:
            parts.append("Secure")
        if expires:
            parts.append(f"Expires={expires}")
        self.response_cookies.append("; ".join(parts))

    def send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        for cookie in self.response_cookies:
            self.send_header("Set-Cookie", cookie)
        self.response_cookies.clear()
        super().end_headers()


def main() -> None:
    ensure_state_store()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving Shift Headcount app at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
