import { detectAnomalies } from './anomalies';

const rules = { thresholdPct: 30, minDelta: 10 };
const week = (byProject: Record<string, number>, byService: Record<string, number> = {}) => ({
  byProject,
  byService,
  total: Object.values(byProject).reduce((a, b) => a + b, 0),
});

describe('detectAnomalies', () => {
  it('returns nothing without a previous week to compare against', () => {
    expect(detectAnomalies(null, week({ api: 500 }), rules)).toEqual([]);
  });

  it('flags items over both the % threshold and the $ floor', () => {
    const out = detectAnomalies(week({ api: 100, ml: 50 }), week({ api: 105, ml: 120 }), rules);
    expect(out).toEqual([
      expect.objectContaining({ dimension: 'total', key: 'All spend', delta: 75, changePct: 50 }),
      expect.objectContaining({ dimension: 'project', key: 'ml', previous: 50, current: 120, changePct: 140 }),
    ]);
  });

  it('ignores big percentage jumps on tiny amounts', () => {
    expect(detectAnomalies(week({ lambda: 0.4 }), week({ lambda: 3 }), rules)).toEqual([]);
  });

  it('ignores large dollar moves below the % threshold', () => {
    expect(detectAnomalies(week({ ec2: 1000 }), week({ ec2: 1200 }), rules)).toEqual([]);
  });

  it('flags brand-new items with changePct null', () => {
    const out = detectAnomalies(week({ api: 100 }, {}), week({ api: 100 }, { 'Amazon SageMaker': 40 }), rules);
    expect(out).toEqual([expect.objectContaining({ dimension: 'service', key: 'Amazon SageMaker', previous: 0, changePct: null })]);
  });

  it('never flags decreases', () => {
    expect(detectAnomalies(week({ api: 500 }), week({ api: 100 }), rules)).toEqual([]);
  });

  it('sorts by dollar impact, largest first', () => {
    const out = detectAnomalies(week({ a: 100, b: 100 }), week({ a: 150, b: 300 }), { thresholdPct: 30, minDelta: 10 });
    expect(out.map((a) => a.key)).toEqual(['All spend', 'b', 'a']);
  });
});
