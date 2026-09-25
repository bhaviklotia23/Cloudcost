import { cloudFormationTemplate, permissionsPolicy, quickCreateUrl, ROLE_ARN_RE, trustPolicy } from './iam-templates';

describe('IAM templates', () => {
  const principal = 'arn:aws:iam::111122223333:role/cloudcost-app';

  it('trust policy pins both the principal and the ExternalId', () => {
    const stmt = trustPolicy(principal, 'cc-abc').Statement[0];
    expect(stmt.Principal).toEqual({ AWS: principal });
    expect(stmt.Condition).toEqual({ StringEquals: { 'sts:ExternalId': 'cc-abc' } });
  });

  it('permissions are read-only Cost Explorer actions', () => {
    const actions = permissionsPolicy().Statement[0].Action;
    expect(actions.every((a) => a.startsWith('ce:Get'))).toBe(true);
  });

  it('CloudFormation template carries the parameters', () => {
    const yaml = cloudFormationTemplate(principal, 'cc-abc');
    expect(yaml).toContain(`Default: ${principal}`);
    expect(yaml).toContain('Default: cc-abc');
    expect(yaml).toContain('sts:ExternalId: !Ref ExternalId');
  });

  it('quick-create link pre-fills the stack parameters', () => {
    const url = new URL(quickCreateUrl('https://bucket.s3.amazonaws.com/t.yaml', 'cc-abc', principal).replace('#/', ''));
    expect(url.searchParams.get('param_ExternalId')).toBe('cc-abc');
  });

  it('validates role ARNs and captures the account id', () => {
    expect(ROLE_ARN_RE.exec('arn:aws:iam::123456789012:role/CloudCostReadOnly')?.[1]).toBe('123456789012');
    expect(ROLE_ARN_RE.exec('arn:aws:iam::123456789012:role/path/to/Role')).not.toBeNull();
    expect(ROLE_ARN_RE.test('arn:aws:iam::123456789012:user/bob')).toBe(false);
    expect(ROLE_ARN_RE.test('arn:aws:iam::12345:role/x')).toBe(false);
  });
});
