# davidamosledbetter.com

My personal site and portfolio. It's a **fully serverless AWS application**: a React
single-page app served as static files from S3 behind CloudFront, with a Go AWS Lambda
backend that powers **LedbetterLM** — an agentic chatbot that speaks as my digital
likeness and reads my GitHub repos live to answer questions about my work.

Originally this ran as containers (Go + React images) on ECS/Fargate behind
Application Load Balancers. I rebuilt it serverless in June 2026, which cut the hosting
bill from ~$112/mo to ~$2–3/mo (everything sits in the free tier except Route 53 and
Secrets Manager).

## Architecture

```
                        ┌─────────────────────────────────────────────┐
   Browser ── HTTPS ──▶ │ CloudFront (CDN, TLS, HSTS/CSP, SPA routing) │
                        └───────────────┬──────────────────┬──────────┘
                          default behavior              /api/* behavior
                                │                            │
                       ┌────────▼─────────┐      ┌───────────▼────────────┐
                       │ S3 (static site) │      │ API Gateway (HTTP API) │
                       │  React build, OAC│      └───────────┬────────────┘
                       └──────────────────┘                  │
                                                   ┌──────────▼───────────┐
                                                   │ Lambda (Go, arm64)   │
                                                   │  LedbetterLM + /api  │
                                                   └──────────┬───────────┘
                                          ┌──────────────────┼───────────────────┐
                                          │                  │                   │
                                  ┌───────▼──────┐  ┌─────────▼────────┐  ┌───────▼────────┐
                                  │ Gemini API   │  │ DynamoDB         │  │ Secrets Manager│
                                  │ (function-   │  │ rate + cost caps │  │ API keys       │
                                  │  calling)    │  └──────────────────┘  └────────────────┘
                                          │
                                  ┌───────▼───────────────────┐
                                  │ GitHub (live repo reads)   │
                                  │ + S3 (knowledge base,      │
                                  │   conversation logs)       │
                                  └────────────────────────────┘
```

### Frontend
- **React** (Create React App), built to static assets and synced to a private **S3**
  bucket, served through **CloudFront** with Origin Access Control (the bucket isn't
  public). HTTPS with a long-lived **HSTS** preload, a **Content-Security-Policy**, and
  the usual hardening headers via a CloudFront response-headers policy. Client-side SPA
  routing is handled by a small **CloudFront Function** that rewrites extensionless paths
  to `index.html`.
- Backend URL is injected at runtime via `window.env.REACT_APP_BACKEND_URI` (empty =
  same-origin `/api/*`), so the same build works in any environment.
- Editable content — the intro paragraph, the LedbetterLM knowledge base, and my
  résumé — lives in a separate public-read S3 content bucket and is fetched at page load,
  so I can update copy without rebuilding or redeploying the site.

### Backend — LedbetterLM
A single **Go Lambda** (arm64, `provided.al2023`) fronted by an **API Gateway HTTP API**
at `/api/*`, so it's same-origin with the site. It exposes `/api/status` and `/api/chat`.

LedbetterLM is **agentic**. Rather than answering from a fixed prompt, it runs a
**Gemini function-calling loop** with read-only tools over my GitHub repositories:
- `list_my_repos` — enumerate my repos,
- `list_repo_files` — browse a repo's tree,
- `read_repo_file` — read a specific file.

So when you ask about a project, it actually fetches and reads the real code (from the
GitHub API and `raw.githubusercontent.com`) before answering, then summarizes in my
voice. The loop is bounded so a multi-step turn still completes within the API Gateway
request limit.

It is grounded on a **knowledge base** (markdown in S3, cached briefly in the Lambda) and
reads its API keys from **Secrets Manager** at cold start.

**Privacy model.** Public repos are freely readable. Private repos are *deny-by-default*:
one is invisible to the bot unless it contains a root `.ledbettergpt.md` file, whose
contents are injected as binding disclosure rules that the model must obey. A hardcoded
never-list blocks sensitive repos entirely. Without a configured GitHub token the bot is
effectively public-only.

**Limits.** Abuse and cost are bounded in **DynamoDB**: per-day request counts (global
and per-IP) plus cost caps computed from Gemini token usage (per browser session and a
global daily ceiling). The frontend sends a per-tab session id with each request.

**Conversation logging.** Each turn is written best-effort to a private, encrypted S3
bucket under a content-hash key (a content-addressable scheme, mirroring my "librarian"
conversation catalog).

### Security
- Private static bucket reached only through CloudFront (OAC); no public S3 access.
- HSTS (preload), CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  Referrer-Policy, Permissions-Policy.
- **Origin lock**: CloudFront injects a secret header on the API origin that the Lambda
  verifies, so hitting the API Gateway URL directly returns 403 — only CloudFront works.
- API Gateway request throttling.
- CI/CD authenticates to AWS via **GitHub OIDC** (no long-lived access keys stored), with
  the deploy role's trust scoped to this repo's `main` branch.

## Repository layout
```
frontend/        React app (Create React App)
backend-lambda/  Go Lambda — LedbetterLM chat + status, agentic repo tools
.github/         GitHub Actions CI/CD (deploy.yml)
```

## Deploying
Deployment is automated — pushing to `main` triggers **GitHub Actions** (`.github/workflows/deploy.yml`),
which builds the React app and syncs it to S3 + invalidates CloudFront, and builds the Go
Lambda and updates the function code. The workflow assumes an AWS role via OIDC, so there
are no credentials in the repo.

To run the frontend locally:
```
cd frontend
npm install
npm start          # http://localhost:3000
```

To build the Lambda locally (cross-compile for the Lambda runtime):
```
cd backend-lambda
GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap
```

## Tech stack
React · Go · AWS (CloudFront, S3, Lambda, API Gateway, DynamoDB, Secrets Manager,
Route 53, ACM, IAM/OIDC) · Google Gemini · GitHub Actions
