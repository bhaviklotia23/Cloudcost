import type { Anomaly } from '../../db/schema';
import { button, emailLayout, escapeHtml } from '../layout';

type Row = { key: string; amount: number; changePct: number | null };
export type DigestInput = {
  orgName: string;
  weekStart: string;
  total: number;
  previousTotal: number | null;
  changePct: number | null;
  monthToDate: number;
  byProject: Row[];
  byService: Row[];
  anomalies: Anomaly[];
  trend: { weekStart: string; total: number | null }[];
  dashboardUrl: string;
  currency: string;
};

const fmtMoney = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);

const fmtWeek = (iso: string) => {
  const start = new Date(`${iso}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
};

const change = (pct: number | null) => {
  if (pct === null) return '<span style="color:#6b7280">new</span>';
  const up = pct > 0;
  const color = up ? '#b91c1c' : '#047857';
  return `<span style="color:${color}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
};

function table(title: string, rows: Row[], currency: string) {
  const body = rows
    .slice(0, 6)
    .map(
      (r) => `<tr>
        <td style="padding:6px 0;font-size:14px;border-bottom:1px solid #eef0f3">${escapeHtml(r.key)}</td>
        <td width="110" style="padding:6px 0;font-size:14px;border-bottom:1px solid #eef0f3;text-align:right;font-variant-numeric:tabular-nums">${fmtMoney(r.amount, currency)}</td>
        <td width="84" style="padding:6px 0 6px 12px;font-size:12px;border-bottom:1px solid #eef0f3;text-align:right;white-space:nowrap">${change(r.changePct)}</td>
      </tr>`,
    )
    .join('');
  return `<h2 style="font-size:14px;margin:24px 0 6px;color:#374151">${title}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>`;
}

/** Tiny inline bar chart — plain HTML so it survives every email client. */
function sparkBars(trend: DigestInput['trend']) {
  const max = Math.max(...trend.map((t) => t.total ?? 0), 1);
  const cells = trend
    .map((t, i) => {
      const h = Math.max(2, Math.round(((t.total ?? 0) / max) * 48));
      const color = i === trend.length - 1 ? '#0f766e' : '#99d5cf';
      return `<td valign="bottom" style="padding:0 2px"><div style="width:18px;height:${h}px;background:${color};border-radius:3px 3px 0 0"></div></td>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>${cells}</tr></table>`;
}

export function digestEmail(d: DigestInput) {
  const week = fmtWeek(d.weekStart);
  const subject = `AWS spend ${week}: ${fmtMoney(d.total, d.currency)}${
    d.changePct !== null ? ` (${d.changePct > 0 ? '+' : ''}${d.changePct.toFixed(1)}%)` : ''
  }${d.anomalies.length ? ` · ${d.anomalies.length} spike${d.anomalies.length > 1 ? 's' : ''}` : ''}`;

  const anomalies = d.anomalies.length
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin-top:20px">
        <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:6px">⚠ ${d.anomalies.length} spend spike${d.anomalies.length > 1 ? 's' : ''} this week</div>
        ${d.anomalies
          .slice(0, 5)
          .map(
            (a) =>
              `<div style="font-size:13px;color:#7f1d1d;line-height:1.6">${escapeHtml(a.key)} <span style="color:#991b1b">(${a.dimension})</span>: ${fmtMoney(a.previous, d.currency)} → <b>${fmtMoney(a.current, d.currency)}</b> ${a.changePct === null ? '(new)' : `(+${a.changePct.toFixed(0)}%)`}</div>`,
          )
          .join('')}
      </div>`
    : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-top:20px;font-size:13px;color:#166534">No unusual spikes this week.</div>`;

  const html = emailLayout({
    preheader: `${d.orgName} spent ${fmtMoney(d.total, d.currency)} on AWS last week.`,
    body: `
      <div style="font-size:13px;color:#6b7280">${escapeHtml(d.orgName)} · Week of ${week}</div>
      <div style="font-size:34px;font-weight:700;margin:6px 0 2px;font-variant-numeric:tabular-nums">${fmtMoney(d.total, d.currency)}</div>
      <div style="font-size:14px;color:#374151">${d.changePct === null ? 'First full week tracked' : `${change(d.changePct)} vs previous week (${fmtMoney(d.previousTotal ?? 0, d.currency)})`}
        &nbsp;·&nbsp; Month to date ${fmtMoney(d.monthToDate, d.currency)}</div>
      ${sparkBars(d.trend)}
      ${anomalies}
      ${table('By project', d.byProject, d.currency)}
      ${table('By service', d.byService, d.currency)}
      <p style="margin:24px 0 0">${button(d.dashboardUrl, 'Open dashboard')}</p>`,
    footer: 'Admins can turn off the weekly digest in organization settings.',
  });

  const text = [
    `${d.orgName} — AWS spend, week of ${week}`,
    `Total: ${fmtMoney(d.total, d.currency)}${d.changePct !== null ? ` (${d.changePct > 0 ? '+' : ''}${d.changePct}% WoW)` : ''}`,
    `Month to date: ${fmtMoney(d.monthToDate, d.currency)}`,
    '',
    d.anomalies.length ? 'Spikes:' : 'No unusual spikes.',
    ...d.anomalies.slice(0, 5).map((a) => `  - ${a.key} (${a.dimension}): ${fmtMoney(a.previous, d.currency)} -> ${fmtMoney(a.current, d.currency)}`),
    '',
    'Top projects:',
    ...d.byProject.slice(0, 6).map((r) => `  - ${r.key}: ${fmtMoney(r.amount, d.currency)}`),
    '',
    `Dashboard: ${d.dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}
