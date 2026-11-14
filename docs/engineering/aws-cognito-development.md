# AWS and Cognito for local development

This runbook covers developer access to AWS and the development Cognito resources for [M2 Issue 13](../milestones/M02-01-identity.md#2-configure-development-aws-and-cognito). IAM Identity Center signs developers in to AWS. Cognito Managed Login signs synthetic application users in to the local React app. Vite, NestJS and PostgreSQL still run locally using the [local development guide](local-development.md).

You can complete the AWS CLI setup now. The CDK commands use the TypeScript infrastructure package described in step 3.

## Create your local setup record

From the repository root, copy the [AWS settings template](../../.env.aws.example) once.

```bash
cp -n .env.aws.example .env.aws
```

Fill in `.env.aws` as you go. Git ignores the local copy and allows the template to be committed. Use this file as a reference for infrastructure setup. AWS CLI reads its profile and workload Region from `~/.aws/config`. The apps use the repository-root `.env`. Keep passwords, access keys, tokens and the Google client secret out of `.env.aws`.

## 1. Set up the AWS account

1. If you already have an approved development account, get its account ID, workload Region and IAM Identity Center access details from the account owner. Otherwise, use the [standard AWS signup flow](https://docs.aws.amazon.com/accounts/latest/reference/getting-started.html). Verify the email address, complete contact and payment verification, review the account and support plan, and wait for activation.
2. For a new standalone account, sign in as root for initial setup and register MFA under **Security credentials**. Keep access to the root email and MFA recovery method. Leave root access keys uncreated and reserve root for account-owner tasks. [AWS sign-in security practices](https://docs.aws.amazon.com/signin/latest/userguide/best-practices-admin.html)
3. For a new account, have the account owner enable an **organization instance** of IAM Identity Center from the AWS Organizations management account. In **Users**, add the developer and complete the invitation. In **AWS accounts**, select the development account, choose **Assign users or groups**, and assign the developer an approved permission set. For an existing organization, use the owner's existing access process. Enable MFA for the developer through the identity provider. Record the AWS access portal URL, Identity Center Region, account ID and permission set name in `.env.aws`. [AWS account access setup](https://docs.aws.amazon.com/singlesignon/latest/userguide/getting-started.html)
4. Sign out of the root session and use the access portal to verify that the developer can open the development account. Keep permissions scoped to the task. Ask the account owner to provide any bootstrap or deployment roles through the existing account process.
5. In **Billing and Cost Management → Budgets**, create a monthly cost budget with an email alert you monitor. Check Cognito Essentials, verification email, Secrets Manager and any CDK bootstrap storage costs in the intended Region. An alert does not cap spending. [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html), [Cognito pricing](https://aws.amazon.com/cognito/pricing/), [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/), [CloudFormation pricing](https://aws.amazon.com/cloudformation/pricing/)

## 2. Install and verify the AWS CLI

1. Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) with the installer for your operating system. On macOS, Homebrew users can run `brew install awscli`. Run `aws --version` and confirm it starts with `aws-cli/2.`.
2. Configure a named profile. In the wizard enter a session name such as `sales-operations`, the access portal URL, and the **Identity Center Region**. Keep the default account access scope, approve the browser prompt, and select the development account and assigned role. Set the **CLI default Region** to the workload Region where the Cognito stack will live. It can differ from the Identity Center Region. Record the Identity Center and workload Regions in `.env.aws`. Use `json` for output. [AWS CLI SSO setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)

   ```bash
   aws configure sso --profile sales-operations-dev
   aws sso login --profile sales-operations-dev
   aws sts get-caller-identity --profile sales-operations-dev
   aws configure get region --profile sales-operations-dev
   ```

3. Check that STS reports the expected development account and role, and that the last command reports the intended workload Region. Stop if either differs. If the session expires, repeat `aws sso login`. Keep the CLI session and SSO cache local. If a command returns `AccessDenied`, verify the profile and Region, then ask the account owner about the specific denied action.

## 3. Install, configure and verify TypeScript CDK

1. **Use the infrastructure package.** The Issue 13 CDK app lives in `infra/cognito/`, alongside the top-level `apps/` directory. The package contains `cdk.json` (the command CDK uses to start the TypeScript app), the stack source and a `package.json` with the local CDK CLI (`aws-cdk`) and construct library (`aws-cdk-lib`). The workspace registers `infra/*` and the shared lockfile pins the package dependencies. [AWS CDK with TypeScript](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html)
2. **Install and verify the project CLI.** Set up Node.js and pnpm using the [local development guide](local-development.md) and check the [CDK-supported Node.js versions](https://docs.aws.amazon.com/cdk/v2/guide/node-versions.html). Run the following from the repository root. The version command should report CDK v2. Run subsequent CDK commands from `infra/cognito/`, where the CLI can find `cdk.json`.

   ```bash
   pnpm install --frozen-lockfile
   cd infra/cognito
   pnpm exec cdk --version
   ```

3. **Confirm the bootstrap target.** Use the AWS CLI profile verified in step 2. Substitute the account ID, workload Region and profile from `.env.aws` below. Check the caller identity and Region before proceeding. In the AWS Console, open CloudFormation in that account and Region and look for the default bootstrap stack, `CDKToolkit`.

   ```bash
   account_id=YOUR_DEVELOPMENT_ACCOUNT_ID
   region=ap-southeast-2
   profile=sales-operations-dev

   aws sts get-caller-identity --profile "$profile"
   aws configure get region --profile "$profile"
   ```

4. **Bootstrap if needed.** If the environment lacks a compatible bootstrap stack, have the account owner review and run this from `infra/cognito/` with an authorised profile. Bootstrapping creates shared AWS resources and IAM roles for that account and Region. An existing compatible bootstrap can be reused. [AWS CDK bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html)

   ```bash
   pnpm exec cdk bootstrap "aws://$account_id/$region" --profile "$profile"
   ```

5. **Verify bootstrap.** Check that CloudFormation reports `CREATE_COMPLETE` or `UPDATE_COMPLETE` for `CDKToolkit` in the target environment. The read-only CLI equivalent is below. If access is denied, ask the account owner to verify the stack status.

   ```bash
   aws cloudformation describe-stacks --stack-name CDKToolkit \
     --profile "$profile" --region "$region" \
     --query 'Stacks[0].StackStatus' --output text
   ```

## 4. Create the development Cognito pool with CloudFormation

The Issue 13 TypeScript CDK app defines the User Pool, Managed Login domain, branding, public app client and API resource server. CDK generates the CloudFormation JSON automatically, and CloudFormation creates the resources when you execute the reviewed change set. The app reads the account, workload Region, stack name and prefix from the ignored root `.env.aws`. Git tracks the source, package configuration and lockfile. Git ignores `cdk.out/` and `node_modules/`. [AWS CDK synthesis](https://docs.aws.amazon.com/cdk/v2/guide/configure-synth.html)

1. **Fill in the development settings.** In `.env.aws`, confirm `AWS_PROFILE`, `AWS_ACCOUNT_ID`, `AWS_REGION` and `COGNITO_STACK_NAME`. Confirm `VITE_COGNITO_API_RESOURCE_URL=http://localhost:5173/api` in the root `.env` using `.env.example` as the template. Choose a prefix such as `sales-ops-dev-k7m4` for `COGNITO_DOMAIN_PREFIX`. Use lowercase letters, digits and hyphens, start and end with a letter or digit, and avoid the reserved text `aws`, `amazon` and `cognito`. CloudFormation attaches the domain to the pool. If the intended stack already has a domain, use its existing prefix. If AWS reports that a new prefix is taken, choose another and prepare a fresh change set. [AWS prefix domains](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-assign-domain-prefix.html), [AWS domain naming rules](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-assign-domain.html)
2. **Generate the CloudFormation template.** From the CDK package directory, substitute your profile and stack name below. Confirm the profile Region matches `.env.aws`. The synth command writes the generated `*.template.json` under `cdk.out/`. To change resource settings, edit the CDK source or its inputs and synthesize again.

   ```bash
   export AWS_PROFILE=sales-operations-dev
   export AWS_REGION="$(aws configure get region --profile "$AWS_PROFILE")"
   stack=SalesOperationsDevCognito
   change_set=issue-13-native-cognito

   pnpm exec cdk list --profile "$AWS_PROFILE"
   pnpm exec cdk synth "$stack" --profile "$AWS_PROFILE"
   ```

   In the generated template, check these settings against the [identity design](../architecture/identity.md).

   | Resource | Expected configuration |
   | --- | --- |
   | User Pool | Essentials tier, native self-registration, username-only sign-in, required and automatically verified email, and email sign-in alias disabled. Enable pool deletion protection and retain the pool on stack deletion and replacement. |
   | Domain and branding | Development prefix, Managed Login version 2, and default Cognito Managed Login branding attached to the app client. |
   | Public app client | Native Cognito as the sole provider for the first deployment, OAuth authorization code grant only, `openid` scope, client-secret generation disabled. The local OAuth client supplies PKCE S256. |
   | API resource server | Identifier matches `VITE_COGNITO_API_RESOURCE_URL` in the root `.env`. This registers the audience inside the pool. NestJS serves the API and login uses the existing `openid` scope. |
   | URL allowlists | Callback `http://localhost:5173/auth/callback` and sign-out `http://localhost:5173/`. |
   | Tokens | 10-minute access and ID tokens, 8-hour refresh token, refresh rotation with a 5-second grace period, and token revocation. Disable `ALLOW_REFRESH_TOKEN_AUTH` and refresh through the OAuth token endpoint. |
   | Outputs | Public User Pool ID, issuer, Managed Login base URL and app client ID. |

3. **Prepare and review the change set.** Run these commands in the same shell. Preparing the change set leaves it ready for review without applying it. [CDK deploy reference](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html)

   ```bash
   pnpm exec cdk deploy "$stack" --profile "$AWS_PROFILE" \
     --method=prepare-change-set --change-set-name "$change_set"

   aws cloudformation describe-change-set --stack-name "$stack" \
     --change-set-name "$change_set" --profile "$AWS_PROFILE" --region "$AWS_REGION"
   ```

   In **CloudFormation → Stacks → Change sets**, confirm the change set is executable and review its proposed resources. For updates, stop if the pool would be removed or replaced, including conditional replacement. Check whether the app client or domain would change. An empty change set needs no execution. [CloudFormation change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html)
4. **Execute the reviewed change set.** After developer approval, choose **Execute change set** in CloudFormation and watch **Events** for `CREATE_COMPLETE` or `UPDATE_COMPLETE`. If it rolls back, inspect the first failed resource event, fix the cause and prepare a fresh change set. For an update, compare the User Pool ID before and after.
5. **Verify the resource server and copy the deployed domain.** Check that the stack **Resources** tab lists `DevelopmentApiResourceServer` and that its physical ID matches the API resource URL. In step 6, pass that same value as `resource` and verify the access token audience at sign-in and after refresh. Open the stack's **Outputs** tab and copy the Managed Login URL. Confirm it matches **Amazon Cognito → User pools → your development pool → Branding → Domain** in the workload Region. Use that exact URL for Google registration in step 5.

## 5. Register Google and update the Cognito stack

### A. Copy the deployed Cognito URLs

1. In the AWS Console, select the development Region and open **CloudFormation → Stacks → your Cognito stack → Outputs**. Copy the value of `ManagedLoginUrl` without a trailing slash. For the Sydney example, it is `https://sales-ops-dev-k7m4.auth.ap-southeast-2.amazoncognito.com`. Use the value from your own stack.
2. Append `/oauth2/idpresponse` to that base URL and save the complete URL as `GOOGLE_OAUTH_REDIRECT_URI` in the root `.env.aws`. The Sydney example looks like this:

   ```text
   https://sales-ops-dev-k7m4.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
   ```

   Google returns users to this HTTPS endpoint. Cognito then returns them to the app's existing localhost callback. [AWS Google federation setup](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-google.html)

### B. Create the Google OAuth client

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Use the project picker at the top to select or create a development project. Record its **Project ID** as `GOOGLE_CLOUD_PROJECT_ID` in `.env.aws`.
2. If Google asks you to configure the app, choose **Get started**. Enter a development app name such as **Sales Operations Dev**, select a user support email, and enter a developer contact email. Choose **External** if you plan to test with a personal Google account. Keep the app in **Testing**. Under **Audience → Test users**, add the Google account you plan to use for the smoke test if the section is available.
3. Under **Branding → Authorized domains**, use `amazoncognito.com` for the Cognito-hosted domain if prompted. Under **Data Access**, use the basic sign-in scopes for OpenID, email and profile.
4. Open **Clients → Create client**. Set **Application type** to **Web application** and name it **Sales Operations Dev Cognito**.
5. Under **Authorized JavaScript origins**, choose **Add URI** and paste the base `ManagedLoginUrl` from part A. Under **Authorized redirect URIs**, choose **Add URI** and paste the full URL ending in `/oauth2/idpresponse`. Choose **Create**.
6. Copy the **Client ID** to `GOOGLE_OAUTH_CLIENT_ID` in `.env.aws`. Keep the **Client secret** available for the next part and paste it directly into AWS Secrets Manager. Keep the secret out of both env files, Git, chat and screenshots. [AWS Google OAuth client settings](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-google.html), [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

### C. Save the client secret in AWS

1. In the development AWS account, switch to the same Region as the Cognito stack. Open **Secrets Manager → Store a new secret**. If you already have the secret in Key/value pairs with the key `client_secret`, use its existing reference in step 4 below.
2. Choose **Other type of secret**. In **Key/value pairs**, enter `client_secret` in the key field and paste the Google OAuth client secret in the value field. Keep the default encryption key unless your account requires a different one. Choose **Next**.
3. Enter a name such as `sales-operations/dev/google-oauth`. Choose **Next**, leave automatic rotation off for this manually managed Google credential, choose **Next** again, then **Store**.
4. Open the saved secret and copy its **Secret name** or **ARN** into `GOOGLE_OAUTH_CLIENT_SECRET_REF` in `.env.aws`. This field identifies the secret for CloudFormation. [AWS Secrets Manager console steps](https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html)

### D. Hand off the CDK update

Once the four `GOOGLE_*` fields are filled in and the secret is stored, the manual setup is complete. The CDK app enables Google when both `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET_REF` are set. Synthesize the stack again with those values in place.

The CDK update adds Google alongside native Cognito on the existing app client, requests `openid email profile`, and maps Google `email` and `email_verified` to the pool attributes. CloudFormation reads the `client_secret` JSON key through a Secrets Manager dynamic reference. The CloudFormation execution role needs access to that secret.

Use the [change-set workflow](#4-create-the-development-cognito-pool-with-cloudformation) with a fresh name. Expect one Google provider to be added and the existing app client to be updated. Verify the pool, domain and app client are preserved. After the reviewed update, confirm Managed Login offers Google and continue to step 6.

When rotating the Google credential later, update the secret and the Cognito identity-provider resource so CloudFormation resolves the new value, then repeat the Google smoke test. [CloudFormation secret references](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-secretsmanager.html)

## 6. Record public settings and smoke-test login

Record the stack's public outputs in the root `.env` as `COGNITO_USER_POOL_ID`, `VITE_COGNITO_ISSUER`, `VITE_COGNITO_DOMAIN` and `VITE_COGNITO_CLIENT_ID`. Keep the callback, sign-out URL and API resource URL there too. When sign-in is wired up, local NestJS configuration will map the shared public values from the root `.env` to its backend settings. See the [hosting decision](../decisions/0003-hosting.md#application-configuration). The User Pool issuer in the standard AWS partition is `https://cognito-idp.<region>.amazonaws.com/<pool-id>`, and its signing keys are at `<issuer>/.well-known/jwks.json`. Use the separate Managed Login base URL for authorization, token exchange, revocation and logout. React needs the public client ID, issuer, Managed Login URL, local callback, sign-out URL and API resource URL. NestJS needs the issuer, public client ID and API resource URL.

Before the React integration lands, use a local OAuth/OIDC test client that can listen on `http://localhost:5173/auth/callback`, set a resource parameter and use PKCE S256. Stop Vite if it is already using port 5173. Keep tokens in memory and redact codes, credentials and callback query strings from logs and screenshots.

1. Start authorization at `/oauth2/authorize` with `response_type=code`, the client ID, the exact callback, `scope=openid`, the API `resource`, random `state` and `nonce`, and the PKCE challenge with `code_challenge_method=S256`. Register a synthetic native username using a test email inbox you control, confirm the verification code, and sign in.
2. Check the callback URL and matching `state`. Exchange the code at `/oauth2/token` with the same redirect URI and original PKCE verifier. Verify the returned access token locally against the pool's signing keys and check the issuer, `client_id`, `token_use=access`, expiry and `aud=http://localhost:5173/api`. Verify the ID token and its nonce through the OIDC client. Use a fresh code for each exchange test.
3. Re-run the flow in a fresh browser session using Google. Use the same controlled test email as the native signup to verify that the two sign-in methods produce distinct Cognito subjects. Record the observed result and investigate any email or mapping error before declaring the test passed.
4. Refresh via `/oauth2/token` with `grant_type=refresh_token`, the public client ID and the latest refresh token. Confirm the access token still has the same API audience and the response provides a new refresh token. After the five-second grace period, try the previous refresh token once and verify rejection.
5. Revoke the latest refresh token at `/oauth2/revoke`, then visit `/logout` with the client ID and `logout_uri=http://localhost:5173/`. Confirm the sign-out redirect and verify that the revoked refresh token can no longer refresh. The Google browser session can remain signed in.
6. Start a new authorization request with an unregistered callback such as `http://localhost:5173/unregistered`. Confirm Cognito rejects it without delivering an authorization code to that address.
7. Record the date, Region, stack status, whether the pool ID was preserved on update, and the pass/fail result of each check. Keep passwords, tokens, verification codes and identity details out of the evidence. Run `node scripts/check-docs.mjs`. [Cognito token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html), [Cognito logout endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html)


### Development smoke-test evidence

**14 November 2026 · ap-southeast-2 · `UPDATE_COMPLETE`.** The Google federation and API resource-server updates preserved the existing User Pool, domain and app client.

- Native registration and email verification succeeded. Native Cognito and Google sign-in both passed PKCE code exchange and signed token checks. Signing in through both providers with the same test email produced distinct Cognito subjects.
- Both flows issued access tokens with the configured API audience and preserved that audience on refresh. Refresh token rotation succeeded, the old token was rejected after the grace period, and revocation blocked further refresh.
- Both flows returned to the allowlisted sign-out URL. Cognito rejected the unregistered callback.

For M3, carry forward the CDK resource settings and smoke-test procedure. Use a separate demo pool, app client, domain and Google OAuth registration with the deployed HTTPS callback and sign-out URLs and the demo API resource URL. Keep development callbacks and synthetic development users confined to the development pool.
