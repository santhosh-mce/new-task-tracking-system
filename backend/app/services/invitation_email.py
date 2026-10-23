import hashlib
import os
import secrets
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import quote, urlsplit


class InvitationEmailError(Exception):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(32)


def hash_invitation_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _configured_value(name: str, *aliases: str) -> str:
    for key in (name, *aliases):
        value = os.getenv(key, "").strip()
        if value:
            return value
    raise InvitationEmailError("Invitation email is not configured.")


def send_invitation_email(
    email: str,
    role: str,
    token: str,
    expires_at: datetime,
) -> None:
    host = _configured_value("SMTP_HOST", "MAIL_HOST")
    username = os.getenv("SMTP_USERNAME", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not from_email and "@" in username:
        from_email = username
    if not from_email:
        raise InvitationEmailError(
            "Invitation email is not configured. Set SMTP_FROM_EMAIL."
        )
    frontend_url = _configured_value(
        "FRONTEND_BASE_URL",
        "FRONTEND_VERIFY_URL",
    ).rstrip("/")
    frontend_path = urlsplit(frontend_url).path.rstrip("/")
    registration_url = (
        frontend_url
        if frontend_path.lower().endswith("/register")
        else f"{frontend_url}/register"
    )
    registration_url = f"{registration_url}?token={quote(token, safe='')}"
    parsed_url = urlsplit(frontend_url)
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        raise InvitationEmailError("Invitation email configuration is invalid.")

    try:
        port = int(os.getenv("SMTP_PORT") or os.getenv("MAIL_PORT") or "587")
    except ValueError as exc:
        raise InvitationEmailError("Invitation email configuration is invalid.") from exc
    if not 1 <= port <= 65535:
        raise InvitationEmailError("Invitation email configuration is invalid.")

    tls_setting = os.getenv("SMTP_USE_TLS", "true").strip().lower()
    if tls_setting not in ("true", "false", "1", "0", "yes", "no"):
        raise InvitationEmailError("Invitation email configuration is invalid.")
    use_tls = tls_setting in ("true", "1", "yes")

    password = os.getenv("SMTP_PASSWORD", "")
    if bool(username) != bool(password):
        raise InvitationEmailError("Invitation email configuration is invalid.")

    expiry_text = ensure_utc(expires_at).strftime("%Y-%m-%d %H:%M:%S UTC")
    message = EmailMessage()
    message["Subject"] = "Your TaskFlow invitation"
    message["From"] = from_email
    message["To"] = email
    message.set_content(
        "You have been invited to TaskFlow.\n\n"
        f"Assigned role: {role.capitalize()}\n"
        f"Complete your registration here: {registration_url}\n"
        f"This single-use link expires at {expiry_text} (in 5 minutes).\n\n"
        "If you were not expecting this invitation, you can ignore this email."
    )

    try:
        if port == 465:
            with smtplib.SMTP_SSL(
                host,
                port,
                timeout=10,
                context=ssl.create_default_context(),
            ) as server:
                if username:
                    server.login(username, password)
                server.send_message(message)
            return

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.ehlo()
            if use_tls:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if username:
                server.login(username, password)
            server.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise InvitationEmailError(
            "SMTP authentication failed. Check the provider username and app password."
        ) from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise InvitationEmailError(
            "The mail server rejected the recipient address."
        ) from exc
    except smtplib.SMTPNotSupportedError as exc:
        raise InvitationEmailError(
            "The mail server does not support the configured TLS method."
        ) from exc
    except OSError as exc:
        raise InvitationEmailError(
            "Could not connect to the configured SMTP server. Check the host, port, and network access."
        ) from exc
    except smtplib.SMTPException as exc:
        raise InvitationEmailError(
            "The SMTP server rejected the invitation message."
        ) from exc


def send_temporary_password_email(
    email: str,
    role: str,
    temporary_password: str,
    login_url: str | None = None,
) -> None:
    host = _configured_value("SMTP_HOST", "MAIL_HOST")
    username = os.getenv("SMTP_USERNAME", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not from_email and "@" in username:
        from_email = username
    if not from_email:
        raise InvitationEmailError(
            "Invitation email is not configured. Set SMTP_FROM_EMAIL."
        )
    if not login_url:
        frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
        login_url = f"{frontend_url}/"

    try:
        port = int(os.getenv("SMTP_PORT") or os.getenv("MAIL_PORT") or "587")
    except ValueError as exc:
        raise InvitationEmailError("Invitation email configuration is invalid.") from exc
    if not 1 <= port <= 65535:
        raise InvitationEmailError("Invitation email configuration is invalid.")

    tls_setting = os.getenv("SMTP_USE_TLS", "true").strip().lower()
    if tls_setting not in ("true", "false", "1", "0", "yes", "no"):
        raise InvitationEmailError("Invitation email configuration is invalid.")
    use_tls = tls_setting in ("true", "1", "yes")

    password = os.getenv("SMTP_PASSWORD", "")
    if bool(username) != bool(password):
        raise InvitationEmailError("Invitation email configuration is invalid.")

    message = EmailMessage()
    message["Subject"] = "Welcome to TaskFlow - Your Login Credentials"
    message["From"] = from_email
    message["To"] = email
    message.set_content(
        "Welcome to Ingage TaskFlow.\n\n"
        "Your account has been created with the following details:\n"
        f"Login Email: {email}\n"
        f"Assigned Role: {role.capitalize()}\n"
        f"Temporary Password: {temporary_password}\n"
        f"Login URL: {login_url}\n\n"
        "IMPORTANT: Please log in at the URL above and immediately change your temporary password to complete your account setup and profile onboarding.\n\n"
        "If you have any questions, please contact your workspace administrator."
    )

    try:
        if port == 465:
            with smtplib.SMTP_SSL(
                host,
                port,
                timeout=10,
                context=ssl.create_default_context(),
            ) as server:
                if username:
                    server.login(username, password)
                server.send_message(message)
            return

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.ehlo()
            if use_tls:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if username:
                server.login(username, password)
            server.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise InvitationEmailError(
            "SMTP authentication failed. Check the provider username and app password."
        ) from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise InvitationEmailError(
            "The mail server rejected the recipient address."
        ) from exc
    except smtplib.SMTPNotSupportedError as exc:
        raise InvitationEmailError(
            "The mail server does not support the configured TLS method."
        ) from exc
    except OSError as exc:
        raise InvitationEmailError(
            "Could not connect to the configured SMTP server. Check the host, port, and network access."
        ) from exc
    except smtplib.SMTPException as exc:
        raise InvitationEmailError(
            "The SMTP server rejected the invitation message."
        ) from exc


def record_invitation_attempt(invitation, now: datetime) -> None:
    from datetime import timedelta
    from fastapi import HTTPException, status
    last_attempt = invitation.last_attempt_at
    if last_attempt and now - ensure_utc(last_attempt) < timedelta(seconds=30):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another invitation email.",
        )
    window_started = invitation.attempt_window_started_at
    if (
        window_started is None
        or now - ensure_utc(window_started) >= timedelta(hours=1)
    ):
        invitation.attempt_window_started_at = now
        invitation.window_attempt_count = 0
    if (invitation.window_attempt_count or 0) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Invitation resend limit reached. Try again later.",
        )
    invitation.window_attempt_count += 1
    invitation.last_attempt_at = now

