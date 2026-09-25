import { button, emailLayout, escapeHtml } from '../layout';

export function inviteEmail(opts: { orgName: string; inviterName: string; role: string; link: string }) {
  const subject = `${opts.inviterName} invited you to ${opts.orgName} on CloudCost`;
  const html = emailLayout({
    preheader: `Join ${opts.orgName} to see its weekly AWS spend.`,
    body: `
      <h1 style="font-size:20px;margin:0 0 12px">You're invited to ${escapeHtml(opts.orgName)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
        ${escapeHtml(opts.inviterName)} invited you to join as <b>${escapeHtml(opts.role)}</b>.
        CloudCost gives your team a weekly breakdown of AWS spend by project, with anomaly flags.
      </p>
      <p style="margin:0 0 20px">${button(opts.link, 'Accept invite')}</p>
      <p style="font-size:12px;color:#6b7280;margin:0">This link expires in 7 days.</p>`,
    footer: "If you weren't expecting this invite, you can ignore this email.",
  });
  const text = `${opts.inviterName} invited you to join ${opts.orgName} on CloudCost as ${opts.role}.\n\nAccept: ${opts.link}\n\nThis link expires in 7 days.`;
  return { subject, html, text };
}
