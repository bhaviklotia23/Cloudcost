import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@smithy/types';
import { Injectable } from '@nestjs/common';

type Cached = { creds: AwsCredentialIdentity; expiresAt: number };

/**
 * Assumes a customer's read-only role. CloudCost's own principal (the ECS task role in prod)
 * calls sts:AssumeRole, passing the ExternalId CloudCost generated for that account. The
 * customer's trust policy only allows the call when that ExternalId matches, so another
 * CloudCost tenant can't point us at someone else's role (the "confused deputy" problem).
 */
@Injectable()
export class StsService {
  private readonly client = new STSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  private readonly cache = new Map<string, Cached>();

  async credentialsFor(roleArn: string, externalId: string, sessionTag: string): Promise<AwsCredentialIdentity> {
    const key = `${roleArn}|${externalId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.creds;

    const { Credentials } = await this.client.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        ExternalId: externalId,
        RoleSessionName: `cloudcost-${sessionTag}`.slice(0, 64),
        DurationSeconds: 900,
      }),
    );
    if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey) throw new Error('STS returned no credentials');

    const creds: AwsCredentialIdentity = {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
      expiration: Credentials.Expiration,
    };
    this.cache.set(key, { creds, expiresAt: Credentials.Expiration?.getTime() ?? Date.now() + 900_000 });
    return creds;
  }
}
