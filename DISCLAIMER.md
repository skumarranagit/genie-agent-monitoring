# Disclaimer

> **This repository is a blueprint / reference implementation for learning and evaluation.
> It is not production-ready and must not be deployed to a production environment as-is.**

Please read this before using any part of this repository.

## 1. Blueprint, not a product

- This is an illustrative **reference solution** showing one way to assemble Genie Agent observability from documented
  Databricks capabilities (Genie Conversation API, Unity Catalog system tables, Lakeflow Jobs, Databricks Apps).
- It is **not an official Databricks product or feature**, is **not covered by Databricks Support**, and comes with
  **no SLA, maintenance commitment or guarantee of future updates**.
- The code is provided **"AS IS", without warranty of any kind**, express or implied, including fitness for a particular
  purpose. You use it at your own risk, and you are responsible for any deployment, operation and outcome.

## 2. Before any production use, you must at minimum

- [ ] Complete your organization's **security, privacy and architecture review**.
- [ ] Add **tests**, robust **error handling**, retries/back-off for API **rate limits**, and alerting on job failures.
- [ ] Put it under your **CI/CD** process (e.g. Declarative Automation Bundles) with separate dev / test / prod targets.
- [ ] Run the job as a dedicated **service principal** with least privilege, not a personal user.
- [ ] Review and remediate **third-party dependencies** (see §6).
- [ ] Validate **scale and cost** for your number of agents, conversations and refresh frequency (see §5).
- [ ] Define **data retention, deletion and access policies** for the trace tables (see §3).

## 3. Sensitive data

- The trace tables store **every user's prompts, Genie's answers, generated SQL, query result previews (Agent mode),
  feedback notes, user identities, source IP addresses and user agents**.
- Prompts and answers can contain **PII, PHI or other regulated / confidential data**. You are responsible for compliance
  with applicable laws and policies (e.g. HIPAA, GDPR, CCPA, internal data-classification rules).
- Apply Unity Catalog controls before broad access: grants, **row filters** (e.g. by `space_id`), **column masks**
  (e.g. on `prompt_text`, `answer_text`, `source_ip`), and a retention policy.
- The bronze table (`genie_api_raw`) intentionally **retains raw payloads even after a user deletes a conversation in Genie**.
  Confirm this matches your retention and right-to-erasure obligations; add a purge process if needed.
- See **[SECURITY.md](SECURITY.md)** for recommended grants, governed tags and ABAC policies.

## 4. Access model

- The ingest job needs **CAN MANAGE** on each Genie Agent (to list every user's conversations) and SELECT on
  `system.query.history`, `system.access.table_lineage` and `system.access.audit`. These are privileged; scope them tightly.
- The reference app reads as its **app service principal**: **anyone granted CAN USE on the app can see all users' prompts
  and answers.** Restrict app permissions, or switch to on-behalf-of-user authorization plus row filters.

## 5. Cost

- The job runs on serverless compute every 30 minutes by default and queries system tables; the app queries a SQL warehouse,
  which may keep a warehouse running. Estimate and monitor cost (e.g. with `system.billing.usage`) and tune the schedule.

## 6. Third-party dependencies

- The app depends on open-source npm packages (via the Databricks AppKit template), each under its own license.
- At the time of publishing (**24 November 2026**, AppKit **0.104.1**), `npm audit` reported **0 known vulnerabilities**.
  One npm `overrides` entry pins `gaxios` to `7.1.6` (a patch release) to remove a transitive `rimraf → glob → minimatch`
  chain with published advisories; see `genie-monitor/package.json`.
- New advisories are published continuously. **Run `npm audit` (and your organization's software-composition scan)
  immediately before deploying, upgrade as needed, and follow your software-supply-chain policy.**

## 7. API and platform stability

- The solution relies on Genie Conversation API endpoints and system-table schemas as documented and observed in
  **November 2026**. Some referenced capabilities (e.g. Genie One tracing) are **Preview/Beta** and may change.
- Several behaviours were **observed rather than documented** (for example, where Agent-mode answers and feedback notes are
  returned, and that questions routed from Genie One have no Genie Agent "create" audit event). These can change without notice.
- System tables are typically delayed by 10–60 minutes; traces are near-real-time, not real-time, and best-effort.
- It is not a compliance system of record. Use the platform audit log (`system.access.audit`) as the authoritative record.

## 8. Sample data and figures

- All examples, screenshots and figures (in `README.md` and `docs/index.html`) come from a **demo environment with synthetic
  data**; user identities are anonymized. Figures are illustrative, **not benchmarks or performance guarantees**.

## 9. Trademarks

- Databricks, Genie, Unity Catalog, Delta Lake and related marks are trademarks of Databricks, Inc. or its affiliates.
  Use of these names does not imply endorsement.

## 10. License

- No open-source license is granted in this repository at this time. Contact the repository owner before reusing or
  redistributing the code.
