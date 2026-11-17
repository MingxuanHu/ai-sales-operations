# Set up Neon PostgreSQL for the M3 demo

This runbook supports [Issue #25](../milestones/M03-01-first-cloud-deploy.md#2-prepare-demo-cognito-and-neon). Use a dedicated Neon project for synthetic demo data. Local development still uses Docker PostgreSQL. The demo uses two PostgreSQL logins on the same database.

| Connection | Role and endpoint | Consumer |
| --- | --- | --- |
| `DIRECT_URL` | Demo database owner, direct host | Manual Prisma migrations in M3 |
| `DATABASE_URL` | `sales_ops_runtime`, pooled host | NestJS runtime via SSM SecureString |

## 1. Create the project and identify the database

1. Sign in to the [Neon Console](https://console.neon.tech/) and select the organisation that owns the demo. If the demo project already exists, open it and record its organisation ID, project ID, Region, branch, database and owner role.
2. If creating a project, review the [Neon plan limits](https://neon.com/pricing) and name it **AI Sales Operations Demo**. Select AWS Sydney if available to match the demo Lambda Region, and use PostgreSQL 18 if available to match local development. The Region is fixed for the project. [Neon Regions](https://neon.com/docs/introduction/regions)
3. The examples below use `neondb` and `neondb_owner`. Substitute the values shown by the project. In **Connect**, choose the demo branch, database and owner role, then turn **Connection pooling** off to identify the direct host.

### Optional CLI setup for repeatable releases

Neon's [onboarding prompt](https://neon.com/get-started/prompt.md) uses `neon init` to link a project, populate local environment variables and install agent tooling. Its default database role can be `neondb_owner`, and it calls the direct URL `DATABASE_URL_UNPOOLED`. This repo uses Docker in the root `.env`, expects `DIRECT_URL` for Prisma, and stores the limited demo runtime credential in SSM. Use the CLI commands below for the demo workflow. [Neon CLI init](https://neon.com/docs/cli/init) · [Neon connection-string defaults](https://neon.com/docs/cli/connection-string)

1. Install the [Neon CLI](https://neon.com/docs/cli/install) and run `neon login`. Authorise the CLI in the browser. A Neon Console session alone does not authenticate the CLI.
2. Confirm the project is listed under the intended organisation, then inspect the project's branches. Substitute the IDs from the console.

   ```bash
   neon projects list --org-id YOUR_DEMO_ORG_ID
   neon branches list --project-id YOUR_DEMO_PROJECT_ID
   ```

3. Record the confirmed branch ID, database and owner role for the CLI migration command in step 3. For console-only setup, keep the direct URL in your protected deployment credential store.

## 2. Create the limited runtime login

Use a current `psql` client. Connect to the direct host with the owner role using separate connection arguments so the password stays out of the command line. Replace the sample host with the direct host from **Connect**. Enter the password at the prompt.

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=DIRECT_HOST dbname=neondb user=neondb_owner sslmode=verify-full sslrootcert=system channel_binding=require'
```

Run `SELECT current_database(), current_user;` and confirm both values, then exit with `\q`. Create the login from a terminal using the block below and the same verified connection details. Neon requires the plaintext password when creating a SQL role. The hidden prompt and psql variable keep it out of the command line and shell history. Use a unique password from your password manager. [Neon role management](https://neon.com/docs/manage/roles)

```bash
(
  set +x
  printf 'Paste the new runtime role password: ' >&2
  IFS= read -rs demo_runtime_password || exit 1
  printf '\n' >&2
  test -n "$demo_runtime_password" || exit 1
  NEON_RUNTIME_PASSWORD="$demo_runtime_password" psql -X -W -v ON_ERROR_STOP=1 \
    'host=DIRECT_HOST dbname=neondb user=neondb_owner sslmode=verify-full sslrootcert=system channel_binding=require' <<'SQL'
\getenv runtime_password NEON_RUNTIME_PASSWORD
BEGIN;
CREATE ROLE sales_ops_runtime LOGIN PASSWORD :'runtime_password';
REVOKE CREATE, TEMPORARY ON DATABASE neondb FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO sales_ops_runtime;
GRANT USAGE ON SCHEMA public TO sales_ops_runtime;
COMMIT;
SQL
)
```

Enter the database owner's password when psql prompts. The database owner retains ownership and can apply migrations. If the role already exists, check its grants and use its existing credential from the password manager.

## 3. Apply the repository migrations

From the repository root, install locked dependencies if needed with `pnpm install --frozen-lockfile`. Confirm the target project, branch, database and owner from step 1. Run the migration during the authorised manual release.

### With the Neon CLI

The CLI retrieves the direct URL for the named owner role each time. For the M3 manual release, the URL stays in the command subshell and is passed to Prisma as `DIRECT_URL`. The runtime SSM parameter holds only the pooled URL. Keep shell tracing off.

```bash
(
  set +x
  demo_migration_url=$(neon connection-string YOUR_DEMO_BRANCH_ID \
    --project-id YOUR_DEMO_PROJECT_ID \
    --database-name neondb --role-name neondb_owner) || exit 1
  case "$demo_migration_url" in
    postgresql://*|postgres://*) ;;
    *) printf 'Neon did not return a PostgreSQL URL.\n' >&2; exit 1 ;;
  esac
  DIRECT_URL="$demo_migration_url" pnpm --filter @ai-sales-operations/api prisma:migrate &&
    DIRECT_URL="$demo_migration_url" pnpm --filter @ai-sales-operations/api exec prisma migrate status
)
```

### With the Neon Console

In **Connect**, select the same branch, database and owner role with **Connection pooling** off. Preserve the connection security settings in the copied URL. Paste it at the hidden terminal prompt in Bash or Zsh.

```bash
(
  set +x
  printf 'Paste demo DIRECT_URL: ' >&2
  IFS= read -rs demo_migration_url || exit 1
  printf '\n' >&2
  test -n "$demo_migration_url" || exit 1
  DIRECT_URL="$demo_migration_url" pnpm --filter @ai-sales-operations/api prisma:migrate &&
    DIRECT_URL="$demo_migration_url" pnpm --filter @ai-sales-operations/api exec prisma migrate status
)
```

Expect `Database schema is up to date`. If deploy or status fails, resolve the reported migration state before proceeding. See the [Prisma deployment workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

## 4. Grant and verify application access

Reconnect as the owner as in step 2. Grant access to the five application tables created by the committed migrations. Review grants when a future migration adds tables. Leave Prisma's migration history accessible only to deployment and administration roles.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.application_users, public.external_identities, public.organisations,
  public.memberships, public.invitations
TO sales_ops_runtime;
```

In Neon **Connect**, select the same branch and database, choose `sales_ops_runtime`, and turn **Connection pooling** on. The hostname contains `-pooler`. Use the pooled URL for that login. If Neon omits the SQL-created login or its password in Connect, use the displayed pooled host and compose the URL with `sales_ops_runtime` and the password from your password manager. Percent-encode the password and preserve Neon's TLS settings. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

Repeat the `psql` connection from step 2 with the pooled host and `user=sales_ops_runtime`. Verify read and write access with a rolled-back synthetic row, then check that the login lacks schema creation, database creation of schemas, temporary tables, and access to Prisma's migration history.

```sql
SELECT current_database(), current_user;

BEGIN;
INSERT INTO public.application_users DEFAULT VALUES RETURNING id;
SELECT count(*) FROM public.application_users;
ROLLBACK;

SELECT
  has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public,
  has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
  has_database_privilege(current_user, current_database(), 'TEMP') AS can_create_temp_table,
  has_table_privilege(current_user, 'public._prisma_migrations', 'SELECT') AS can_read_migrations;
```

Expect all four privilege checks to return false. Stop and review memberships, ownership and grants if a check returns true.

## 5. Store the runtime URL in AWS

Use the demo AWS account and backend Region. In **Systems Manager → Parameter Store → Create parameter**, use `/sales-operations/demo/database-url`, **Standard**, and **SecureString**. Choose the encryption key approved for the account and paste the pooled runtime URL into **Value**. [AWS Parameter Store console steps](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-create-console.html)

### With the AWS CLI

Use this alternative for initial creation when the account permits its default SSM encryption key. Confirm the returned account ID is the demo account. Substitute the AWS profile and Region in both commands.

```bash
aws sts get-caller-identity --profile YOUR_DEMO_PROFILE --region YOUR_DEMO_REGION \
  --query Account --output text
```

The hidden prompt reads the runtime URL. Node checks the host and role, then writes the parameter definition to a private temporary file for the AWS CLI. The subshell removes the file on exit. A parameter with this name already present causes the command to fail, preserving the existing credential.

```bash
(
  set +x
  umask 077
  demo_payload_dir=$(mktemp -d "${TMPDIR:-/tmp}/sales-ops-ssm.XXXXXX") || exit 1
  demo_payload="$demo_payload_dir/parameter.json"
  trap 'rm -f -- "$demo_payload"; rmdir -- "$demo_payload_dir"' EXIT
  printf 'Paste pooled demo DATABASE_URL: ' >&2
  IFS= read -rs demo_runtime_url || exit 1
  printf '\n' >&2
  DATABASE_URL="$demo_runtime_url" node -e '
    const value = process.env.DATABASE_URL;
    const url = URL.parse(value);
    if (!url || !["postgresql:", "postgres:"].includes(url.protocol) ||
        url.username !== "sales_ops_runtime" || !url.password ||
        !/-pooler\..+\.neon\.tech$/.test(url.hostname)) {
      console.error("Expected a pooled Neon URL for sales_ops_runtime.");
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({
      Name: "/sales-operations/demo/database-url",
      Tier: "Standard",
      Type: "SecureString",
      Value: value,
    }));
  ' > "$demo_payload" || exit 1
  aws ssm put-parameter --profile YOUR_DEMO_PROFILE --region YOUR_DEMO_REGION \
    --cli-input-json "file://$demo_payload" --no-cli-pager
)
```

Verify the parameter name, Region and type in Parameter Store. Give Issue #26 only the name or ARN. Record the project and branch, Region, migration status, runtime privilege check results, and parameter name. Keep connection URLs and passwords out of repository env files, Git, logs, screenshots and handoff notes. [PostgreSQL credential policy](security.md#postgresql-connection-urls)
