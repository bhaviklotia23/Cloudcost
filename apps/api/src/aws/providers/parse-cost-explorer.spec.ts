import type { ResultByTime } from '@aws-sdk/client-cost-explorer';
import { parseCostExplorerResults, tagValue } from './parse-cost-explorer';

const group = (tag: string, service: string, amount: string) => ({
  Keys: [tag, service],
  Metrics: { UnblendedCost: { Amount: amount, Unit: 'USD' } },
});

describe('tagValue', () => {
  it('strips the "<key>$" prefix Cost Explorer adds', () => {
    expect(tagValue('Project$checkout-api', 'Project')).toBe('checkout-api');
  });
  it('maps an empty tag value to Untagged', () => {
    expect(tagValue('Project$', 'Project')).toBe('Untagged');
  });
  it('keeps values that contain $', () => {
    expect(tagValue('Project$a$b', 'Project')).toBe('a$b');
  });
});

describe('parseCostExplorerResults', () => {
  const results: ResultByTime[] = [
    {
      TimePeriod: { Start: '2026-09-14', End: '2026-09-15' },
      Groups: [
        group('Project$api', 'Amazon Elastic Compute Cloud - Compute', '10.5'),
        group('Project$api', 'Amazon Relational Database Service', '4.25'),
        group('Project$', 'AWS Lambda', '0.25'),
      ],
    },
    {
      TimePeriod: { Start: '2026-09-15', End: '2026-09-16' },
      Groups: [group('Project$ml', 'Amazon SageMaker', '20'), group('Project$api', 'Amazon Elastic Compute Cloud - Compute', '0')],
    },
    // A day with no spend still appears in the daily series.
    { TimePeriod: { Start: '2026-09-16', End: '2026-09-17' }, Groups: [] },
  ];

  it('folds pair-grouped rows into project, service and daily totals', () => {
    const out = parseCostExplorerResults(results, 'Project');
    expect(out.byProject).toEqual({ api: 14.75, Untagged: 0.25, ml: 20 });
    expect(out.byService).toEqual({
      'Amazon Elastic Compute Cloud - Compute': 10.5,
      'Amazon Relational Database Service': 4.25,
      'AWS Lambda': 0.25,
      'Amazon SageMaker': 20,
    });
    expect(out.daily).toEqual([
      { date: '2026-09-14', amount: 15 },
      { date: '2026-09-15', amount: 20 },
      { date: '2026-09-16', amount: 0 },
    ]);
    expect(out.total).toBe(35);
    expect(out.currency).toBe('USD');
  });

  it('keeps credits (negative amounts) so totals match the bill', () => {
    const out = parseCostExplorerResults(
      [{ TimePeriod: { Start: '2026-09-14', End: '2026-09-15' }, Groups: [group('Project$api', 'EC2', '10'), group('Project$api', 'Credit', '-3')] }],
      'Project',
    );
    expect(out.total).toBe(7);
  });
});
