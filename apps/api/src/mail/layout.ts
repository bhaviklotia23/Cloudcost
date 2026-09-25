/** Minimal, table-based email layout — renders in Gmail/Outlook without external CSS. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function emailLayout(opts: { preheader: string; body: string; footer?: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2330">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:15px;font-weight:700;color:#0f766e;padding-bottom:18px">&#9729;&#xFE0E; CloudCost</td></tr>
<tr><td>${opts.body}</td></tr>
</table>
<p style="font-size:12px;color:#6b7280;margin-top:16px">${opts.footer ?? 'You are receiving this because you are a member of a CloudCost organization.'}</p>
</td></tr></table></body></html>`;
}

export function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(label)}</a>`;
}
