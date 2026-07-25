def render_alert_template(
    title: str,
    incident_type: str,
    severity: str,
    summary: str,
    recommended_actions: list[str],
    latitude: float | None,
    longitude: float | None,
    source: str,
    distance_km: float,
) -> str:
    sev_colors = {
        "critical": "#dc2626",
        "high": "#f97316",
        "moderate": "#eab308",
        "low": "#16a34a",
    }
    sev_key = severity.lower() if severity else "moderate"
    color = sev_colors.get(sev_key, "#6b7280")

    maps_url = ""
    if latitude is not None and longitude is not None:
        maps_url = f"https://www.google.com/maps?q={latitude},{longitude}"

    actions_html = ""
    if recommended_actions:
        items = "".join(f"<li>{a}</li>" for a in recommended_actions)
        actions_html = f'<div style="margin: 16px 0;"><strong style="font-size: 14px;">Recommended Actions:</strong><ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">{items}</ul></div>'

    location_html = ""
    if maps_url:
        location_html = f'<p style="margin: 8px 0;"><a href="{maps_url}" style="color: #2563eb; font-size: 13px;">View on Google Maps &rarr;</a></p>'

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc;">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; padding: 24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
<tr><td style="padding: 4px 0; background: {color}; height: 4px;"></td></tr>
<tr><td style="padding: 28px 32px 8px 32px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td><span style="font-size: 20px; font-weight: 700; color: #0f172a;">KAVACH</span><span style="font-size: 11px; color: #64748b; margin-left: 6px;">Emergency Alert System</span></td>
<td align="right"><span style="display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: {color}; color: #ffffff;">{severity}</span></td>
</tr>
</table>
</td></tr>
<tr><td style="padding: 4px 32px 16px 32px;">
<h1 style="margin: 0; font-size: 22px; color: #0f172a; line-height: 1.3;">{incident_type} Alert</h1>
<p style="margin: 6px 0 0 0; font-size: 14px; color: #475569;">{title}</p>
</td></tr>
<tr><td style="padding: 0 32px;">
<div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 8px 0;">
<p style="margin: 0 0 8px 0; font-size: 13px; color: #334155; line-height: 1.5;">{summary}</p>
{actions_html}
<p style="margin: 4px 0; font-size: 12px; color: #64748b;">Source: {source} &middot; You are <strong>{distance_km} km</strong> from this incident.</p>
{location_html}
</div>
</td></tr>
<tr><td style="padding: 16px 32px 28px 32px; border-top: 1px solid #e2e8f0;">
<p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center;">
KAVACH &middot; Unified Disaster Intelligence Platform<br>
You received this alert because your location is within the notification radius.<br>
<a href="#" style="color: #94a3b8;">Manage alert preferences</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
