import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL
from app.templates.alert_email_html import render_alert_template


def _send_single(to_email: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


def send_otp_email(to_email: str, otp: str) -> None:
    subject = "Your KAVACH verification code"
    body = f"""
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h2 style="color: #1e40af;">KAVACH Verification</h2>
  <p>Your one-time verification code is:</p>
  <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
              text-align: center; padding: 20px; margin: 20px 0;
              background: #f1f5f9; border-radius: 12px;">
    {otp}
  </div>
  <p>This code expires in 5 minutes.</p>
  <p style="color: #64748b; font-size: 12px;">If you didn't request this, please ignore this email.</p>
</body>
</html>
"""
    msg = MIMEMultipart("alternative")
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


def send_alerts(
    recipients: list[dict],
    incident_id: str,
    title: str,
    incident_type: str,
    severity: str,
    summary: str,
    recommended_actions: list[str],
    latitude: float | None,
    longitude: float | None,
    source: str,
    radius_km: float,
) -> tuple[int, int]:
    sev_upper = severity.upper() if severity else "ALERT"
    subject = f"\u26a0\ufe0f [{sev_upper}] {incident_type} Alert \u2014 {title[:60]}"

    sent = 0
    failed = 0

    for r in recipients:
        html = render_alert_template(
            title=title,
            incident_type=incident_type,
            severity=severity,
            summary=summary,
            recommended_actions=recommended_actions,
            latitude=latitude,
            longitude=longitude,
            source=source,
            distance_km=r["distance_km"],
        )
        try:
            _send_single(r["email"], subject, html)
            sent += 1
        except Exception as e:
            print(f"[EMAIL] failed to send to {r['email']}: {e}", flush=True)
            failed += 1

    return sent, failed
