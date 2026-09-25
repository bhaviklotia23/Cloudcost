# How CloudCost reads a customer's AWS bill (cross-account IAM, done properly)

CloudCost needs to read Cost Explorer data in **someone else's AWS account**. There are two ways to do that, and only one of them is acceptable for a SaaS product.

| Approach | What the customer gives you | Problem |
|---|---|---|
| Access keys | An IAM user's `AKIA…` key + secret | Long-lived secret you now have to store, rotate and never leak. Revocation means the customer hunting for the key. |
| **Cross-account role** | A role ARN | Nothing secret changes hands. CloudCost gets 15-minute credentials on demand; the customer revokes by deleting the role. |

CloudCost uses the role approach. This doc walks through the moving parts and the one subtle attack it has to defend against.

## The moving parts

```
 CloudCost's AWS account (111122223333)          Customer's AWS account (123456789012)
┌──────────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ role/cloudcost-app                   │        │ role/CloudCostReadOnly                   │
│  (ECS task role of the API + worker) │ ──①──▶ │  trust: cloudcost-app + ExternalId       │
│                                      │        │  perms: ce:GetCostAndUsage (read only)   │
│                                      │ ──②──▶ │ Cost Explorer                            │
└──────────────────────────────────────┘        └──────────────────────────────────────────┘
 ① sts:AssumeRole(RoleArn, ExternalId)  →  temporary credentials (15 min)
 ② GetCostAndUsage signed with those credentials
```

1. **CloudCost's principal.** The API and worker run on ECS Fargate with a task role, `cloudcost-app`. That role's only notable permission is `sts:AssumeRole` on `arn:aws:iam::*:role/*` — customers may rename the role, and their trust policy + ExternalId are what actually gate access. Its ARN is configured as `CLOUDCOST_PRINCIPAL_ARN`.
2. **The customer's role** (`infra/iam/cloudcost-readonly-role.yaml`, or generated per-connection in the UI):
   - **Trust policy** — who may assume it:
     ```json
     {
       "Effect": "Allow",
       "Principal": { "AWS": "arn:aws:iam::111122223333:role/cloudcost-app" },
       "Action": "sts:AssumeRole",
       "Condition": { "StringEquals": { "sts:ExternalId": "cc-3kP…" } }
     }
     ```
   - **Permissions policy** — what it can do once assumed: `ce:GetCostAndUsage`, `ce:GetDimensionValues`, `ce:GetTags`. No `ec2:*`, no `s3:*`, nothing that touches resources.
3. **Assuming it** (`apps/api/src/aws/sts.service.ts`): `AssumeRole` with the role ARN, the ExternalId and `DurationSeconds: 900`. Credentials are cached in memory until a minute before expiry, then refreshed.

## The confused-deputy problem (why ExternalId exists)

Without an ExternalId condition the trust policy says "CloudCost may assume this role". That sounds fine until you remember **CloudCost acts on behalf of many tenants**:

1. Victim Corp connects its account; its role `arn:aws:iam::999…:role/CloudCostReadOnly` trusts CloudCost.
2. Attacker signs up for CloudCost, clicks *Connect AWS account* and pastes **Victim Corp's** role ARN.
3. CloudCost dutifully assumes it — the trust policy allows CloudCost, and CloudCost is who's asking. The attacker is now reading Victim Corp's bill through CloudCost's dashboard.

CloudCost is the "deputy" that got confused about whose authority it was acting under.

**The fix:** every connection gets an `ExternalId` that **CloudCost generates** (`cc-` + 24 random bytes, `aws-accounts.service.ts`) and the customer bakes into their trust policy. When the attacker pastes Victim Corp's ARN, CloudCost calls `AssumeRole` with *the attacker's* connection's ExternalId, which doesn't match Victim Corp's condition, and STS refuses.

Two details matter:

- **The customer must not choose it.** If customers pick their own ExternalId, an attacker can simply enter the victim's (it's not secret — it sits in their CloudFormation parameters). CloudCost generates it server-side and there is no API to set it.
- **It's unique per connection, not per CloudCost deployment.** A single global ExternalId would be useless — every tenant would know it.

It is *not* a password; it doesn't need to be kept secret from the customer. Its job is to bind "this role" to "this CloudCost tenant".

## Connecting: verify before trusting

`POST /orgs/:orgId/aws-accounts/:id/connect` (`aws-accounts.service.ts`) doesn't just store the ARN:

1. Validates it's a role ARN and extracts the 12-digit account id.
2. Assumes the role with the stored ExternalId. Failure → *"CloudCost couldn't assume this role — check the trust policy and External ID."*
3. Makes one small `GetCostAndUsage` call. `DataUnavailableException` → *"Cost Explorer isn't enabled yet"*; `AccessDenied` → *"role was assumed but Cost Explorer access was denied."*
4. Only then marks the account `connected` and queues a 12-week backfill.

Separating those two failure modes saves customers a support ticket: "wrong trust policy" and "forgot the permissions policy" are different fixes.

If permissions are later revoked, the sync job (`jobs/sync.processor.ts`) recognises access-denied errors, marks the account `error` with a readable message, and **discards** the job instead of retrying — retrying a revoked role four times just adds noise.

## Tagging: where "per project" comes from

Cost Explorer can group by any **activated cost allocation tag**. CloudCost defaults to `Project` (configurable per account). One request per account per week:

```
GetCostAndUsage
  TimePeriod  = Mon → next Mon (End is exclusive; clamped to tomorrow for the current week)
  Granularity = DAILY
  Metrics     = [UnblendedCost]
  GroupBy     = [TAG Project, DIMENSION SERVICE]
```

Grouping by the (tag, service) *pair* returns rows like `["Project$checkout-api", "Amazon RDS"]`. `parse-cost-explorer.ts` folds those into per-project, per-service and per-day totals in one pass, so a single call ($0.01) feeds every view on the dashboard. Resources missing the tag come back as `"Project$"` and are shown as **Untagged** — which is itself a useful number to drive down.

Gotcha worth knowing: a tag must be **activated** in *Billing → Cost allocation tags*, and data is only tagged from activation onward.

## Cost of running this

- Cost Explorer API: $0.01/request. Daily sync = 2 requests/account/day (last week + this week) ≈ **$0.60/account/month**. First-connect backfill: 13 requests.
- STS: free.

## Dogfooding (planned, with the Terraform phase)

CloudCost's own infrastructure will be deployed with Terraform with a `Project` tag on every resource, and its own AWS account connected to itself through exactly this flow — so the public demo shows CloudCost's real bill.
