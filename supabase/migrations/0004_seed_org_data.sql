-- TalentBridge 0004 — organisation seed
--
-- A small but realistic company: eight people, five open internal roles, and
-- work history written so that the interesting skills are *not* visible from
-- the job titles. Kavya is titled "QA Engineer" but has built Python tooling
-- and mentored four juniors; Sneha is in Customer Success but runs SQL
-- analyses and a churn model. Those are the rows the discovery pass is meant
-- to surface.
--
-- Every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Skill taxonomy
-- ---------------------------------------------------------------------------
insert into public.tb_skills (name, category) values
  ('SQL',                      'Data & Analytics'),
  ('Python',                   'Data & Analytics'),
  ('Data Modeling',            'Data & Analytics'),
  ('Dashboarding & BI',        'Data & Analytics'),
  ('Statistics',               'Data & Analytics'),
  ('ETL & Data Pipelines',     'Data & Analytics'),
  ('Apache Airflow',           'Data & Analytics'),
  ('dbt',                      'Data & Analytics'),
  ('Machine Learning',         'Data & Analytics'),
  ('MLOps',                    'Data & Analytics'),
  ('Data Governance',          'Data & Analytics'),
  ('TypeScript',               'Engineering'),
  ('React',                    'Engineering'),
  ('Node.js',                  'Engineering'),
  ('REST API Design',          'Engineering'),
  ('PostgreSQL',               'Engineering'),
  ('Docker',                   'Engineering'),
  ('Kubernetes',               'Engineering'),
  ('CI/CD',                    'Engineering'),
  ('Test Automation',          'Engineering'),
  ('System Design',            'Engineering'),
  ('AWS',                      'Engineering'),
  ('Terraform',                'Engineering'),
  ('Observability',            'Engineering'),
  ('Incident Management',      'Engineering'),
  ('Product Discovery',        'Product & Business'),
  ('Roadmapping',              'Product & Business'),
  ('A/B Experimentation',      'Product & Business'),
  ('Stakeholder Management',   'Product & Business'),
  ('Technical Writing',        'Product & Business'),
  ('Customer Discovery',       'Product & Business'),
  ('Financial Modeling',       'Product & Business'),
  ('Revenue Operations',       'Product & Business'),
  ('Salesforce Administration','Product & Business'),
  ('Project Coordination',     'Product & Business'),
  ('Mentoring & Coaching',     'Product & Business'),
  ('Process Automation',       'Product & Business'),
  ('Public Speaking',          'Product & Business')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
insert into public.tb_profiles (user_id, full_name, email, app_role, department, job_title, years_experience) values
  ('11111111-1111-4111-8111-111111111111', 'Priya Raman',  'priya@talentbridge.dev',  'employee', 'Analytics',        'Data Analyst',              4.5),
  ('22222222-2222-4222-8222-222222222222', 'Arun Mehta',   'arun@talentbridge.dev',   'hr',       'People',           'HR Business Partner',       8.0),
  ('33333333-3333-4333-8333-333333333333', 'Kavya Nair',   'kavya@talentbridge.dev',  'employee', 'Engineering',      'QA Engineer',               5.0),
  ('44444444-4444-4444-8444-444444444444', 'Rohit Sharma', 'rohit@talentbridge.dev',  'employee', 'Engineering',      'Backend Engineer',          6.0),
  ('55555555-5555-4555-8555-555555555555', 'Sneha Iyer',   'sneha@talentbridge.dev',  'employee', 'Customer Success', 'Customer Success Manager',  3.5),
  ('66666666-6666-4666-8666-666666666666', 'Vikram Desai', 'vikram@talentbridge.dev', 'employee', 'Marketing',        'Marketing Specialist',      3.0),
  ('77777777-7777-4777-8777-777777777777', 'Fatima Khan',  'fatima@talentbridge.dev', 'employee', 'Customer Success', 'Support Lead',              7.0),
  ('88888888-8888-4888-8888-888888888888', 'Daniel Thomas','daniel@talentbridge.dev', 'employee', 'Finance',          'Finance Analyst',           4.0)
on conflict (user_id) do nothing;

insert into public.tb_hr_admins (user_id) values
  ('22222222-2222-4222-8222-222222222222')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Work history, projects and learning — the raw material for discovery
-- ---------------------------------------------------------------------------
insert into public.tb_experiences (employee_id, kind, title, description, started_on, ended_on)
select p.user_id, v.kind::tb_experience_kind, v.title, v.description, v.started_on::date, v.ended_on::date
from (values
  -- Priya Raman — Data Analyst
  ('priya@talentbridge.dev', 'job', 'Data Analyst, Analytics',
   'Owns the revenue and retention reporting layer. Writes roughly 40 production SQL models a quarter against a 2 TB Postgres warehouse, and rebuilt the subscription cohort model that finance now closes the month on. Runs a weekly review where marketing and finance argue about attribution, and is the person who decides which number is right.',
   '2023-02-01', null),
  ('priya@talentbridge.dev', 'project', 'Self-serve metrics migration to dbt',
   'Led the move of 120 hand-maintained SQL views into dbt with tests and documentation. Designed the staging/marts layering, set up CI so a failing model blocks the merge, and wrote the contributor guide that three other teams now follow. Cut the monthly reporting close from four days to one.',
   '2024-03-01', '2024-09-30'),
  ('priya@talentbridge.dev', 'project', 'Churn early-warning scoring',
   'Built a logistic regression in Python over product usage and support-ticket features to flag accounts likely to churn in 60 days. Validated with a holdout, shipped the scores into the CRM on a nightly schedule, and negotiated the threshold with the Customer Success leads so the alert volume stayed actionable.',
   '2025-01-15', '2025-05-30'),
  ('priya@talentbridge.dev', 'learning', 'Airflow fundamentals, internal academy',
   'Completed the 20-hour internal Airflow course and converted her own nightly scoring job from a cron script to a DAG with retries and alerting.',
   '2025-06-01', '2025-07-10'),

  -- Arun Mehta — HR
  ('arun@talentbridge.dev', 'job', 'HR Business Partner, People',
   'Partners with Engineering and Analytics on headcount planning, internal mobility and performance cycles. Runs the quarterly talent review and owns the internal job board.',
   '2019-06-01', null),
  ('arun@talentbridge.dev', 'project', 'Internal mobility pilot',
   'Ran a six-month pilot that filled four openings internally instead of through agencies, and documented why each hire worked. Saved roughly 38 lakh in agency fees and became the business case for this system.',
   '2025-01-01', '2025-06-30'),

  -- Kavya Nair — QA Engineer whose real skills are hidden by the title
  ('kavya@talentbridge.dev', 'job', 'QA Engineer, Platform',
   'Owns release quality for the platform team. Runs the regression suite and signs off every release.',
   '2021-08-01', null),
  ('kavya@talentbridge.dev', 'project', 'Test data factory in Python',
   'Wrote a Python service that generates realistic test fixtures against the production schema, replacing a hand-maintained 4,000-line SQL file. Packaged it as a Docker image, wired it into the GitHub Actions pipeline, and exposed a small REST endpoint so other teams could request datasets. Adoption spread to five teams without any mandate.',
   '2023-04-01', '2024-02-28'),
  ('kavya@talentbridge.dev', 'project', 'Flaky test triage and observability',
   'Instrumented the CI suite to record per-test timing and failure history into Postgres, then built the dashboard the team uses to decide what to quarantine. Reduced pipeline flakiness from 11% to under 2% over two quarters.',
   '2024-05-01', '2024-12-15'),
  ('kavya@talentbridge.dev', 'achievement', 'Mentored four junior engineers',
   'Ran the platform team onboarding for two years. Four juniors completed it; three were promoted within eighteen months. Also writes the release notes that go to the whole company and presents them at the monthly engineering forum.',
   '2022-01-01', null),

  -- Rohit Sharma — Backend Engineer
  ('rohit@talentbridge.dev', 'job', 'Backend Engineer, Payments',
   'Builds and operates the payments service: Node.js and TypeScript on Postgres, deployed to Kubernetes on AWS. On the primary on-call rotation.',
   '2020-09-01', null),
  ('rohit@talentbridge.dev', 'project', 'Ledger rewrite and idempotency keys',
   'Redesigned the double-entry ledger to be idempotent under retries after a duplicate-charge incident. Wrote the design doc, ran the review with finance and compliance, and migrated 14 million rows with zero downtime using a dual-write and backfill.',
   '2024-01-10', '2024-08-20'),
  ('rohit@talentbridge.dev', 'project', 'Terraform for the payments estate',
   'Moved click-configured AWS infrastructure into Terraform modules with a review-gated apply, and set the SLO dashboards and alert routes that the on-call rotation now runs on.',
   '2025-02-01', '2025-06-30'),

  -- Sneha Iyer — CSM who is quietly an analyst
  ('sneha@talentbridge.dev', 'job', 'Customer Success Manager, Mid-market',
   'Owns 42 mid-market accounts through renewal. Runs quarterly business reviews and is the escalation path for product complaints.',
   '2022-11-01', null),
  ('sneha@talentbridge.dev', 'project', 'Renewal risk board built on SQL',
   'Taught herself SQL and built the renewal risk board the whole CS org now runs its Monday meeting on, joining product usage against support history. Presented the methodology to the exec team and defended it under scrutiny from finance.',
   '2024-06-01', '2025-01-31'),
  ('sneha@talentbridge.dev', 'learning', 'Applied statistics for business, Coursera',
   'Finished a 40-hour applied statistics course and applied it to sizing the renewal risk segments, including a holdout test of the outreach playbook.',
   '2025-03-01', '2025-05-15'),

  -- Vikram Desai — Marketing
  ('vikram@talentbridge.dev', 'job', 'Marketing Specialist, Demand Generation',
   'Runs paid and lifecycle campaigns. Owns the landing page stack and the weekly funnel report.',
   '2023-05-01', null),
  ('vikram@talentbridge.dev', 'project', 'Landing page experimentation programme',
   'Set up a structured A/B testing programme across 30 landing pages, defining the sample sizes and stop rules with the analytics team instead of calling winners early. Lifted trial signups 22% over two quarters and documented every losing test as well as the wins.',
   '2024-02-01', '2024-11-30'),

  -- Fatima Khan — Support Lead
  ('fatima@talentbridge.dev', 'job', 'Support Lead, Global',
   'Leads a nine-person support team across two time zones. Owns the incident communication process and the escalation SLAs.',
   '2018-04-01', null),
  ('fatima@talentbridge.dev', 'project', 'Support automation with workflow scripting',
   'Automated ticket triage and routing, cutting first-response time from 6 hours to 48 minutes. Wrote the runbooks and ran the training that made the change stick across both regions.',
   '2024-03-01', '2024-10-31'),
  ('fatima@talentbridge.dev', 'achievement', 'Incident commander for the March outage',
   'Acted as incident commander during a 9-hour platform outage: ran the bridge, sequenced the customer comms and wrote the postmortem that produced eleven follow-up actions.',
   '2025-03-14', '2025-03-28'),

  -- Daniel Thomas — Finance
  ('daniel@talentbridge.dev', 'job', 'Finance Analyst, FP&A',
   'Owns the operating model and the monthly variance pack. Business partner to Marketing and Customer Success.',
   '2022-01-10', null),
  ('daniel@talentbridge.dev', 'project', 'Unit economics model rebuild',
   'Rebuilt the CAC/LTV model with cohort-level retention curves pulled from the warehouse over SQL rather than pasted exports, and automated the refresh so the pack builds itself on the second working day.',
   '2024-09-01', '2025-02-28'),
  ('daniel@talentbridge.dev', 'learning', 'Salesforce administrator essentials',
   'Completed the administrator certification path and now manages the opportunity stages and reporting objects for the revenue team.',
   '2025-04-01', '2025-08-20')
) as v(email, kind, title, description, started_on, ended_on)
join public.tb_profiles p on p.email = v.email
where not exists (
  select 1 from public.tb_experiences e
  where e.employee_id = p.user_id and e.title = v.title
);

-- ---------------------------------------------------------------------------
-- Declared skills — what the HR system already believed before any AI ran.
-- Deliberately thin: the discovery pass is what fills in the rest.
-- ---------------------------------------------------------------------------
insert into public.tb_employee_skills (employee_id, skill_id, level, confidence, source, is_hidden, evidence)
select p.user_id, s.id, v.level, 1.0, 'declared', false, 'Declared on the employee profile.'
from (values
  ('priya@talentbridge.dev',  'SQL', 5),
  ('priya@talentbridge.dev',  'Dashboarding & BI', 4),
  ('priya@talentbridge.dev',  'Data Modeling', 4),
  ('priya@talentbridge.dev',  'Python', 3),
  ('kavya@talentbridge.dev',  'Test Automation', 5),
  ('kavya@talentbridge.dev',  'CI/CD', 4),
  ('rohit@talentbridge.dev',  'Node.js', 5),
  ('rohit@talentbridge.dev',  'TypeScript', 4),
  ('rohit@talentbridge.dev',  'PostgreSQL', 4),
  ('rohit@talentbridge.dev',  'REST API Design', 4),
  ('sneha@talentbridge.dev',  'Stakeholder Management', 4),
  ('sneha@talentbridge.dev',  'Customer Discovery', 4),
  ('vikram@talentbridge.dev', 'A/B Experimentation', 3),
  ('vikram@talentbridge.dev', 'Customer Discovery', 3),
  ('fatima@talentbridge.dev', 'Incident Management', 5),
  ('fatima@talentbridge.dev', 'Stakeholder Management', 4),
  ('daniel@talentbridge.dev', 'Financial Modeling', 5),
  ('daniel@talentbridge.dev', 'SQL', 3),
  ('arun@talentbridge.dev',   'Stakeholder Management', 5)
) as v(email, skill, level)
join public.tb_profiles p on p.email = v.email
join public.tb_skills   s on s.name  = v.skill
on conflict (employee_id, skill_id) do nothing;

-- ---------------------------------------------------------------------------
-- Open internal roles
-- ---------------------------------------------------------------------------
insert into public.tb_roles (title, department, description, is_open, created_by)
select v.title, v.department, v.description, true, hr.user_id
from (values
  ('Data Platform Engineer', 'Engineering',
   'Own the pipelines behind the warehouse: dbt models, Airflow orchestration, and the Python services that move data. You will work with analysts to turn one-off SQL into tested, scheduled, documented production models, and you will be on the rota for pipeline failures. We are explicitly open to analysts and QA engineers who already write production-grade Python and SQL.'),
  ('Product Manager, Growth', 'Product',
   'Own the trial-to-paid funnel. Run discovery with customers, size opportunities against usage data, and run a disciplined experimentation programme rather than a backlog of opinions. Requires comfort arguing with an analytics team about sample sizes and writing decisions down.'),
  ('ML Operations Engineer', 'Engineering',
   'Take models from a notebook to a monitored production service: containerised, scheduled, observable, with a rollback path. Sits between Analytics and Platform. Needs Python, Docker and enough CI/CD to own a deployment pipeline end to end.'),
  ('Revenue Operations Analyst', 'Finance',
   'Own the revenue reporting stack across Salesforce and the warehouse. Build the models finance closes on, administer the CRM objects behind them, and be the person who reconciles the two when they disagree.'),
  ('Technical Program Manager, Platform', 'Engineering',
   'Coordinate multi-team platform programmes: sequence the work, keep the written record, chair the reviews, and run the comms when something breaks. Requires a technical background strong enough to challenge an engineering estimate.')
) as v(title, department, description)
cross join (select user_id from public.tb_profiles where email = 'arun@talentbridge.dev') hr
where not exists (
  select 1 from public.tb_roles r where r.title = v.title
);

-- ---------------------------------------------------------------------------
-- What each role actually requires
-- ---------------------------------------------------------------------------
insert into public.tb_role_skills (role_id, skill_id, required_level, weight)
select r.id, s.id, v.required_level, v.weight
from (values
  ('Data Platform Engineer',            'Python',                   4, 1.5),
  ('Data Platform Engineer',            'SQL',                      4, 1.5),
  ('Data Platform Engineer',            'ETL & Data Pipelines',     4, 1.4),
  ('Data Platform Engineer',            'Apache Airflow',           3, 1.0),
  ('Data Platform Engineer',            'dbt',                      3, 1.0),
  ('Data Platform Engineer',            'Data Modeling',            3, 1.0),
  ('Data Platform Engineer',            'Docker',                   3, 0.8),
  ('Data Platform Engineer',            'CI/CD',                    3, 0.8),

  ('Product Manager, Growth',           'Product Discovery',        4, 1.5),
  ('Product Manager, Growth',           'A/B Experimentation',      4, 1.4),
  ('Product Manager, Growth',           'Customer Discovery',       4, 1.2),
  ('Product Manager, Growth',           'Roadmapping',              3, 1.0),
  ('Product Manager, Growth',           'Stakeholder Management',   4, 1.2),
  ('Product Manager, Growth',           'SQL',                      3, 0.9),
  ('Product Manager, Growth',           'Statistics',               3, 0.8),

  ('ML Operations Engineer',            'Python',                   4, 1.5),
  ('ML Operations Engineer',            'Docker',                   4, 1.3),
  ('ML Operations Engineer',            'CI/CD',                    4, 1.2),
  ('ML Operations Engineer',            'Machine Learning',         3, 1.2),
  ('ML Operations Engineer',            'MLOps',                    3, 1.1),
  ('ML Operations Engineer',            'Observability',            3, 0.9),
  ('ML Operations Engineer',            'AWS',                      3, 0.8),

  ('Revenue Operations Analyst',        'SQL',                      4, 1.4),
  ('Revenue Operations Analyst',        'Financial Modeling',       4, 1.4),
  ('Revenue Operations Analyst',        'Revenue Operations',       3, 1.2),
  ('Revenue Operations Analyst',        'Salesforce Administration',3, 1.1),
  ('Revenue Operations Analyst',        'Data Modeling',            3, 1.0),
  ('Revenue Operations Analyst',        'Dashboarding & BI',        3, 0.9),

  ('Technical Program Manager, Platform','Project Coordination',    4, 1.4),
  ('Technical Program Manager, Platform','Stakeholder Management',  4, 1.4),
  ('Technical Program Manager, Platform','Technical Writing',       4, 1.2),
  ('Technical Program Manager, Platform','Incident Management',     3, 1.1),
  ('Technical Program Manager, Platform','System Design',           3, 0.9),
  ('Technical Program Manager, Platform','Public Speaking',         3, 0.7)
) as v(role_title, skill, required_level, weight)
join public.tb_roles  r on r.title = v.role_title
join public.tb_skills s on s.name  = v.skill
on conflict (role_id, skill_id) do nothing;
