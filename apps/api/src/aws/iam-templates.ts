/**
 * The customer-side IAM setup, generated per connected account.
 *
 * Trust policy: only CloudCost's principal may assume the role, and only when it presents
 * this account's ExternalId. Permissions: read-only Cost Explorer — no access to resources.
 */
export const READONLY_ACTIONS = ['ce:GetCostAndUsage', 'ce:GetDimensionValues', 'ce:GetTags'];

export function trustPolicy(principalArn: string, externalId: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: principalArn },
        Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'sts:ExternalId': externalId } },
      },
    ],
  };
}

export function permissionsPolicy() {
  return {
    Version: '2012-10-17',
    Statement: [{ Sid: 'CloudCostReadOnlyCostExplorer', Effect: 'Allow', Action: READONLY_ACTIONS, Resource: '*' }],
  };
}

export function cloudFormationTemplate(principalArn: string, externalId: string): string {
  return `AWSTemplateFormatVersion: '2010-09-09'
Description: Read-only IAM role that lets CloudCost read Cost Explorer data for this account.
Parameters:
  CloudCostPrincipalArn:
    Type: String
    Default: ${principalArn}
    Description: The CloudCost IAM principal allowed to assume this role.
  ExternalId:
    Type: String
    Default: ${externalId}
    NoEcho: true
    Description: Unique ID CloudCost generated for this connection. Do not change it.
  RoleName:
    Type: String
    Default: CloudCostReadOnly
Resources:
  CloudCostRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Ref RoleName
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Ref CloudCostPrincipalArn
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      Policies:
        - PolicyName: CloudCostReadOnlyCostExplorer
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
${READONLY_ACTIONS.map((a) => `                  - ${a}`).join('\n')}
                Resource: '*'
Outputs:
  RoleArn:
    Description: Paste this into CloudCost to finish connecting.
    Value: !GetAtt CloudCostRole.Arn
`;
}

export function quickCreateUrl(templateUrl: string, externalId: string, principalArn: string): string {
  const params = new URLSearchParams({
    templateURL: templateUrl,
    stackName: 'CloudCostReadOnly',
    param_ExternalId: externalId,
    param_CloudCostPrincipalArn: principalArn,
  });
  return `https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?${params.toString()}`;
}

export const ROLE_ARN_RE = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@\-/]{1,512}$/;
