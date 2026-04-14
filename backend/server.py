from __future__ import annotations

import json
import os
import secrets
import sqlite3
import tempfile
import time
from datetime import UTC, datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "backend"))
STATE_PATH = DATA_DIR / "app_state.json"
SESSIONS_PATH = DATA_DIR / "sessions.json"
SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "shift_headcount_session")
APP_ENV = os.environ.get("APP_ENV", "development").lower()
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true" if APP_ENV == "production" else "false").lower() == "true"
AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "true" if APP_ENV == "development" else "false").lower() == "true"
DEFAULT_DB_DIR = (
    Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "shift-headcount-app"
    if APP_ENV == "development"
    else DATA_DIR
)
DB_PATH = Path(os.environ.get("DB_PATH", DEFAULT_DB_DIR / "app.db"))
ACTIVE_DB_PATH = DB_PATH
OPEN_ACCESS_SESSION = {
    "username": "open-access",
    "role": "admin",
    "name": "Open Access",
}

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

SESSION_CACHE: dict = {}


def ensure_state_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    global ACTIVE_DB_PATH
    ensure_state_store()
    try:
        ACTIVE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        ACTIVE_DB_PATH = Path(tempfile.gettempdir()) / "shift-headcount-app" / "app.db"
        ACTIVE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(ACTIVE_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_database() -> None:
    with get_db_connection() as connection:
      connection.executescript(
          """
          CREATE TABLE IF NOT EXISTS app_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              weeks_in_year INTEGER NOT NULL,
              annual_days INTEGER NOT NULL,
              days_off INTEGER NOT NULL,
              public_holidays INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS baseline_rows (
              id TEXT PRIMARY KEY,
              main_department TEXT NOT NULL,
              sub_department TEXT NOT NULL,
              shift_name TEXT NOT NULL,
              position_name TEXT NOT NULL,
              row_type TEXT NOT NULL DEFAULT 'shift',
              required_fte TEXT NOT NULL DEFAULT '',
              budget_headcount TEXT NOT NULL DEFAULT '',
              sun INTEGER NOT NULL DEFAULT 0,
              mon INTEGER NOT NULL DEFAULT 0,
              tue INTEGER NOT NULL DEFAULT 0,
              wed INTEGER NOT NULL DEFAULT 0,
              thu INTEGER NOT NULL DEFAULT 0,
              fri INTEGER NOT NULL DEFAULT 0,
              sat INTEGER NOT NULL DEFAULT 0,
              weekly_total INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS department_mappings (
              id TEXT PRIMARY KEY,
              source_name TEXT NOT NULL,
              target_name TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS roster_uploads (
              week_start TEXT PRIMARY KEY,
              label TEXT NOT NULL,
              week_label TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              raw_text TEXT NOT NULL DEFAULT '',
              rows_json TEXT NOT NULL DEFAULT '[]',
              issues_json TEXT NOT NULL DEFAULT '[]',
              row_count INTEGER NOT NULL DEFAULT 0,
              issue_count INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS attendance_uploads (
              week_start TEXT PRIMARY KEY,
              label TEXT NOT NULL,
              week_label TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              raw_text TEXT NOT NULL DEFAULT '',
              rows_json TEXT NOT NULL DEFAULT '[]',
              issues_json TEXT NOT NULL DEFAULT '[]',
              row_count INTEGER NOT NULL DEFAULT 0,
              issue_count INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS app_meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
          );
          """
      )


def read_json_file(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_file(path: Path, payload: dict | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_state() -> dict | None:
    ensure_database()
    migrate_json_state_if_needed()
    with get_db_connection() as connection:
        baseline_rows = [
            {
                "id": row["id"],
                "mainDepartment": row["main_department"],
                "subDepartment": row["sub_department"],
                "shiftName": row["shift_name"],
                "positionName": row["position_name"],
                "rowType": row["row_type"],
                "requiredFte": row["required_fte"],
                "budgetHeadcount": row["budget_headcount"],
                "Sun": row["sun"],
                "Mon": row["mon"],
                "Tue": row["tue"],
                "Wed": row["wed"],
                "Thu": row["thu"],
                "Fri": row["fri"],
                "Sat": row["sat"],
                "weeklyTotal": row["weekly_total"],
            }
            for row in connection.execute(
                """
                SELECT id, main_department, sub_department, shift_name, position_name,
                       row_type, required_fte, budget_headcount, sun, mon, tue, wed, thu, fri, sat, weekly_total
                FROM baseline_rows
                ORDER BY main_department, sub_department, shift_name, position_name, id
                """
            ).fetchall()
        ]
        mappings = [
            {
                "id": row["id"],
                "sourceName": row["source_name"],
                "targetName": row["target_name"],
            }
            for row in connection.execute(
                "SELECT id, source_name, target_name FROM department_mappings ORDER BY source_name, target_name, id"
            ).fetchall()
        ]
        settings_row = connection.execute(
            "SELECT weeks_in_year, annual_days, days_off, public_holidays FROM app_settings WHERE id = 1"
        ).fetchone()
        settings = (
            {
                "weeksInYear": settings_row["weeks_in_year"],
                "annualDays": settings_row["annual_days"],
                "daysOff": settings_row["days_off"],
                "publicHolidays": settings_row["public_holidays"],
            }
            if settings_row
            else None
        )
        roster_uploads = read_upload_table(connection, "roster_uploads")
        attendance_uploads = read_upload_table(connection, "attendance_uploads")
        current_roster_week = read_meta_value(connection, "current_roster_week")
        current_attendance_week = read_meta_value(connection, "current_attendance_week")
        roster_upload = pick_current_upload(roster_uploads, current_roster_week)
        attendance_upload = pick_current_upload(attendance_uploads, current_attendance_week)

        if not any([baseline_rows, mappings, settings, roster_uploads, attendance_uploads]):
            return None

        return {
            "baselineRows": baseline_rows,
            "mappings": mappings,
            "settings": settings or {},
            "rosterUpload": roster_upload,
            "rosterHistory": roster_uploads,
            "attendanceUpload": attendance_upload,
            "attendanceHistory": attendance_uploads,
        }


def write_state(payload: dict) -> None:
    ensure_database()
    with get_db_connection() as connection:
        connection.execute("DELETE FROM baseline_rows")
        for row in payload.get("baselineRows", []):
            connection.execute(
                """
                INSERT INTO baseline_rows (
                    id, main_department, sub_department, shift_name, position_name,
                    row_type, required_fte, budget_headcount, sun, mon, tue, wed, thu, fri, sat, weekly_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("id", ""),
                    row.get("mainDepartment", ""),
                    row.get("subDepartment", ""),
                    row.get("shiftName", ""),
                    row.get("positionName", ""),
                    row.get("rowType", "shift"),
                    str(row.get("requiredFte", "")),
                    str(row.get("budgetHeadcount", "")),
                    int(row.get("Sun", 0) or 0),
                    int(row.get("Mon", 0) or 0),
                    int(row.get("Tue", 0) or 0),
                    int(row.get("Wed", 0) or 0),
                    int(row.get("Thu", 0) or 0),
                    int(row.get("Fri", 0) or 0),
                    int(row.get("Sat", 0) or 0),
                    int(row.get("weeklyTotal", 0) or 0),
                ),
            )

        connection.execute("DELETE FROM department_mappings")
        for row in payload.get("mappings", []):
            connection.execute(
                "INSERT INTO department_mappings (id, source_name, target_name) VALUES (?, ?, ?)",
                (row.get("id", ""), row.get("sourceName", ""), row.get("targetName", "")),
            )

        settings = payload.get("settings", {})
        connection.execute(
            """
            INSERT INTO app_settings (id, weeks_in_year, annual_days, days_off, public_holidays)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                weeks_in_year = excluded.weeks_in_year,
                annual_days = excluded.annual_days,
                days_off = excluded.days_off,
                public_holidays = excluded.public_holidays
            """,
            (
                int(settings.get("weeksInYear", 52) or 52),
                int(settings.get("annualDays", 365) or 365),
                int(settings.get("daysOff", 104) or 104),
                int(settings.get("publicHolidays", 12) or 12),
            ),
        )

        save_upload_table(connection, "roster_uploads", payload.get("rosterHistory", []), payload.get("rosterUpload"))
        save_upload_table(connection, "attendance_uploads", payload.get("attendanceHistory", []), payload.get("attendanceUpload"))
        write_meta_value(connection, "current_roster_week", payload.get("rosterUpload", {}).get("weekStart", ""))
        write_meta_value(connection, "current_attendance_week", payload.get("attendanceUpload", {}).get("weekStart", ""))
        bump_state_version(connection)
        connection.commit()


def read_upload_table(connection: sqlite3.Connection, table_name: str) -> list[dict]:
    rows = connection.execute(
        f"""
        SELECT week_start, label, week_label, created_at, raw_text, rows_json, issues_json, row_count, issue_count
        FROM {table_name}
        ORDER BY week_start DESC, created_at DESC
        """
    ).fetchall()
    return [
        {
            "weekStart": row["week_start"],
            "label": row["label"],
            "weekLabel": row["week_label"],
            "createdAt": row["created_at"],
            "rawText": row["raw_text"],
            "rows": json.loads(row["rows_json"] or "[]"),
            "issues": json.loads(row["issues_json"] or "[]"),
            "rowCount": row["row_count"],
            "issueCount": row["issue_count"],
        }
        for row in rows
    ]


def save_upload_table(
    connection: sqlite3.Connection, table_name: str, history: list[dict], current_upload: dict | None
) -> None:
    uploads: dict[str, dict] = {}
    for item in history or []:
        week_start = str(item.get("weekStart", "")).strip()
        if week_start:
            uploads[week_start] = normalize_upload_snapshot(item)
    if current_upload and current_upload.get("weekStart"):
        uploads[str(current_upload["weekStart"]).strip()] = normalize_upload_snapshot(current_upload)

    connection.execute(f"DELETE FROM {table_name}")
    for week_start, item in sorted(uploads.items(), reverse=True):
        connection.execute(
            f"""
            INSERT INTO {table_name} (
                week_start, label, week_label, created_at, raw_text,
                rows_json, issues_json, row_count, issue_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                week_start,
                item.get("label", ""),
                item.get("weekLabel", ""),
                item.get("createdAt", datetime.now(UTC).isoformat()),
                item.get("rawText", ""),
                json.dumps(item.get("rows", [])),
                json.dumps(item.get("issues", [])),
                int(item.get("rowCount", len(item.get("rows", []))) or 0),
                int(item.get("issueCount", len(item.get("issues", []))) or 0),
            ),
        )


def normalize_upload_snapshot(item: dict) -> dict:
    rows = item.get("rows", [])
    issues = item.get("issues", [])
    return {
        "weekStart": str(item.get("weekStart", "")).strip(),
        "label": item.get("label", ""),
        "weekLabel": item.get("weekLabel", ""),
        "createdAt": item.get("createdAt", datetime.now(UTC).isoformat()),
        "rawText": item.get("rawText", ""),
        "rows": rows,
        "issues": issues,
        "rowCount": int(item.get("rowCount", len(rows)) or 0),
        "issueCount": int(item.get("issueCount", len(issues)) or 0),
    }


def read_meta_value(connection: sqlite3.Connection, key: str) -> str:
    row = connection.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else ""


def write_meta_value(connection: sqlite3.Connection, key: str, value: str) -> None:
    connection.execute(
        """
        INSERT INTO app_meta (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value or ""),
    )


def read_state_version() -> int:
    with get_db_connection() as connection:
        return int(read_meta_value(connection, "state_version") or "0")


def bump_state_version(connection: sqlite3.Connection) -> int:
    current = int(read_meta_value(connection, "state_version") or "0") + 1
    write_meta_value(connection, "state_version", str(current))
    return current


def pick_current_upload(history: list[dict], preferred_week: str) -> dict:
    if preferred_week:
        for item in history:
            if item.get("weekStart") == preferred_week:
                return item
    return history[0] if history else {}


def database_has_state() -> bool:
    with get_db_connection() as connection:
        counts = [
            connection.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()["count"]
            for table in ("baseline_rows", "department_mappings", "roster_uploads", "attendance_uploads")
        ]
        settings_row = connection.execute("SELECT COUNT(*) AS count FROM app_settings").fetchone()["count"]
        return any(counts) or settings_row > 0


def migrate_json_state_if_needed() -> None:
    if database_has_state():
        return
    legacy_state = read_json_file(STATE_PATH)
    if not legacy_state:
        return
    write_state(legacy_state)


def read_sessions() -> dict:
    ensure_state_store()
    return SESSION_CACHE or read_json_file(SESSIONS_PATH) or {}


def write_sessions(payload: dict) -> None:
    global SESSION_CACHE
    SESSION_CACHE = dict(payload)
    ensure_state_store()
    try:
        write_json_file(SESSIONS_PATH, payload)
    except OSError:
        # Keep the in-memory session cache active even if the local disk is slow or locked.
        pass


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
                    "storage": "sqlite",
                    "authDisabled": AUTH_DISABLED,
                }
            )
            return
        if self.path == "/api/auth/session":
            self.send_json(
                {
                    "user": sanitized_session(self.get_current_session_or_open_access()),
                    "auth": {
                        "environment": APP_ENV,
                        "usesDefaultCredentials": uses_default_credentials(),
                        "authDisabled": AUTH_DISABLED,
                    },
                }
            )
            return
        if self.path == "/api/updates":
            session = self.get_current_session_or_open_access()
            if not session:
                self.send_json({"error": "Authentication required."}, status=HTTPStatus.UNAUTHORIZED)
                return
            self.stream_updates()
            return
        if self.path == "/api/state":
            session = self.get_current_session_or_open_access()
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
            if AUTH_DISABLED:
                self.send_json({"signedOut": True, "authDisabled": True})
                return
            self.clear_current_session()
            self.send_json({"signedOut": True})
            return

        if self.path not in {"/api/auth/login", "/api/state"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")
            return

        body = self.read_request_body()
        if body is None:
            return

        if self.path == "/api/auth/login":
            if AUTH_DISABLED:
                if self.is_form_post():
                    self.send_response(HTTPStatus.SEE_OTHER)
                    self.send_header("Location", "/")
                    self.end_headers()
                    return
                self.send_json({"user": sanitized_session(OPEN_ACCESS_SESSION), "authDisabled": True})
                return
            username = str(body.get("username", "")).strip().lower()
            password = str(body.get("password", ""))
            account = USERS.get(username)
            if not account or account["password"] != password:
                if self.is_form_post():
                    self.redirect_with_message("Invalid username or password.")
                    return
                self.send_json({"error": "Invalid username or password."}, status=HTTPStatus.UNAUTHORIZED)
                return
            session = build_session(username, account)
            self.create_session(session)
            if self.is_form_post():
                self.send_response(HTTPStatus.SEE_OTHER)
                self.send_header("Location", "/")
                self.end_headers()
                return
            self.send_json({"user": sanitized_session(session)})
            return

        if "state" not in body or not isinstance(body["state"], dict):
            self.send_error(HTTPStatus.BAD_REQUEST, "Expected body.state object")
            return

        session = self.get_current_session_or_open_access()
        if not session:
            self.send_json({"error": "Authentication required."}, status=HTTPStatus.UNAUTHORIZED)
            return

        write_state(body["state"])
        self.send_json({"saved": True, "version": read_state_version()})

    def read_request_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        content_type = self.headers.get("Content-Type", "").lower()
        if "application/x-www-form-urlencoded" in content_type:
            parsed = parse_qs(raw_body.decode("utf-8"), keep_blank_values=True)
            return {key: values[0] if values else "" for key, values in parsed.items()}
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON body")
            return None

    def is_form_post(self) -> bool:
        return "application/x-www-form-urlencoded" in self.headers.get("Content-Type", "").lower()

    def redirect_with_message(self, message: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", f"/?login_error={quote(message)}")
        self.end_headers()

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

    def get_current_session_or_open_access(self) -> dict | None:
        if AUTH_DISABLED:
            return OPEN_ACCESS_SESSION
        return self.get_current_session()

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

    def stream_updates(self) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        last_version = read_state_version()
        try:
            self.write_sse_event("ready", {"version": last_version})
            while True:
                time.sleep(1.5)
                current_version = read_state_version()
                if current_version != last_version:
                    last_version = current_version
                    self.write_sse_event("state", {"version": current_version})
                else:
                    self.write_sse_event("heartbeat", {"version": current_version})
        except (BrokenPipeError, ConnectionResetError):
            return

    def write_sse_event(self, event_name: str, payload: dict) -> None:
        message = f"event: {event_name}\ndata: {json.dumps(payload)}\n\n".encode("utf-8")
        self.wfile.write(message)
        self.wfile.flush()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        for cookie in self.response_cookies:
            self.send_header("Set-Cookie", cookie)
        self.response_cookies.clear()
        super().end_headers()


def main() -> None:
    global SESSION_CACHE
    ensure_state_store()
    ensure_database()
    SESSION_CACHE = read_json_file(SESSIONS_PATH) or {}
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving Shift Headcount app at http://{host}:{port} using database {ACTIVE_DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
