"""One branded HTML layout for the portal's emails, written into both flow definitions. Dev tooling.

Usage (from the repo root): python scripts/dataverse/email_template.py
Then deploy: python scripts/dataverse/portal_flows.py

Email-safe HTML: tables + inline styles (Outlook, Gmail, mobile). The logo is a PNG served by the portal at
{chp_SiteUrl}/concreat-logo-email.png; while the site is private, clients show the alt text "CONCREAT" instead.
"""
import io
import json
import os

HERE = os.path.dirname(__file__)
SITE = "@{parameters('Site URL (chp_SiteUrl)')}"
NAVY, INK, TEXT, MUTED, LINK = '#1b2e63', '#0c1633', '#2b3445', '#6b7385', '#2560a8'


def render(heading, name, intro, button, link, expiry):
    """name, link: flow expressions; the rest: plain text."""
    return (
        '<div style="margin:0;padding:0;background:#f3f5f9">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background:#f3f5f9;padding:24px 12px;font-family:\'Segoe UI\',Arial,Helvetica,sans-serif">'
        '<tr><td align="center">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e7ef;border-radius:10px">'
        # Header: white so the black wordmark stays readable; navy accent stripe below.
        '<tr><td style="padding:22px 32px 18px">'
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="vertical-align:middle;padding-right:14px"><img src="{SITE}/concreat-logo-email.png" width="66" height="48" '
        f'alt="CONCREAT" style="display:block;border:0;width:66px;height:48px;font:700 18px Arial,sans-serif;'
        f'letter-spacing:2px;color:{NAVY}"></td>'
        f'<td style="vertical-align:middle;padding-left:14px;border-left:1px solid #e3e7ef">'
        f'<div style="font-size:16px;font-weight:700;color:{NAVY}">Concreat Connect</div>'
        f'<div style="font-size:12px;color:{MUTED}">Customer Portal</div></td>'
        '</tr></table></td></tr>'
        f'<tr><td style="height:4px;background:{NAVY};font-size:0;line-height:0">&nbsp;</td></tr>'
        # Body
        '<tr><td style="padding:32px 32px 8px">'
        f'<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:{INK}">{heading}</h1>'
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:{TEXT}">Hello {name},</p>'
        f'<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:{TEXT}">{intro}</p>'
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="border-radius:7px;background:{NAVY}"><a href="{link}" style="display:inline-block;padding:13px 28px;'
        f'font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:7px">{button}</a></td>'
        '</tr></table>'
        f'<div style="margin:24px 0 0;padding:12px 14px;background:#f3f6fb;border-radius:7px;font-size:13px;'
        f'line-height:1.5;color:#4a5468">{expiry}</div>'
        f'<p style="margin:20px 0 4px;font-size:12px;line-height:1.5;color:{MUTED}">'
        'Button not working? Copy and paste this link into your browser:</p>'
        f'<p style="margin:0 0 8px;font-size:12px;line-height:1.5;word-break:break-all">'
        f'<a href="{link}" style="color:{LINK}">{link}</a></p>'
        '</td></tr>'
        # Footer
        '<tr><td style="padding:20px 32px 28px;border-top:1px solid #eef1f6">'
        f'<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:{MUTED}">'
        "Didn't ask for this? You can safely ignore this email.</p>"
        f'<p style="margin:0;font-size:12px;line-height:1.5;color:{MUTED}">Need assistance? Contact the '
        f'<strong style="color:{TEXT}">Concreat Customer Service Center</strong> at '
        f'<strong style="color:{TEXT}">(02) 8849-3600</strong>.</p>'
        '</td></tr></table>'
        '<p style="margin:14px 0 0;font-size:11px;color:#9aa2b1">&copy; Concreat Holdings</p>'
        '</td></tr></table></div>'
    )


EMAILS = {
    ('activation_flow.json', 'Send_activation_email'): render(
        heading='Activate your account',
        name="@{variables('ContactName')}",
        intro='Use the button below to set your password and finish activating your Concreat Connect account.',
        button='Activate your account',
        link=f"{SITE}/activate/complete?code=@{{outputs('Invitation_code')}}&amp;email=@{{encodeUriComponent(outputs('Email'))}}",
        expiry='This link can be used once and expires in 24 hours.',
    ),
    ('password_reset_flow.json', 'Send_reset_email'): render(
        heading='Reset your password',
        name="@{outputs('Get_contact')?['body/fullname']}",
        intro='We received a request to reset your Concreat Connect password. Use the button below to choose a new one.',
        button='Reset your password',
        link=f"{SITE}/reset-password?@{{outputs('Reset_query')}}&amp;email=@{{encodeUriComponent(outputs('Get_contact')?['body/emailaddress1'])}}",
        expiry='This link expires in 1 hour.',
    ),
}


def find(actions, name):
    for key, action in (actions or {}).items():
        if key == name:
            return action
        hit = find(action.get('actions'), name) or find((action.get('else') or {}).get('actions'), name)
        if hit:
            return hit
    return None


if __name__ == '__main__':
    for (file, action), html in EMAILS.items():
        path = os.path.join(HERE, file)
        definition = json.load(open(path, encoding='utf-8'))
        find(definition['actions'], action)['inputs']['parameters']['emailMessage/Body'] = html
        with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(definition, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f'= {file}: {action} body written')
