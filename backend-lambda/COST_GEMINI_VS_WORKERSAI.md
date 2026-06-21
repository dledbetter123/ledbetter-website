# LedbetterLM inference cost: Gemini vs Cloudflare Workers AI

Comparison of the current Gemini Pro endpoint against Cloudflare Workers AI for the
LedbetterLM chat backend. Methodology and numbers below are reproducible from
`/tmp/costcalc.py` (token model) and the S3 conversation logs (ground truth).

## Ground truth (actual Gemini spend)

Pulled from `s3://davidamosledbetter-conversations/`: **26 logged turns → $0.3375 total**
(~$0.013/turn). The 3 agentic tool-calling turns cost ~$0.032 each (they pull repo files
into the prompt); simple turns ~$0.009 each. Cost is dominated by the fixed system prefix
(`baseInstruction` ~1,045 tok + knowledge base ~2,205 tok ≈ **3,250 tokens re-sent on every
model call**) plus Gemini's billed "thinking" tokens at $10/M output.

A token model calibrated to this traffic predicts **$0.32** for the same 26 turns — within
5% of the $0.3375 actually billed (the gap is hidden thinking tokens), so the model is sound
and can be applied to Workers AI for an apples-to-apples comparison.

Pricing used — Gemini Pro: **$1.25/M input, $10.00/M output** (output includes thinking).

## Same 26 turns, priced under each provider

Workers AI pricing per https://developers.cloudflare.com/workers-ai/platform/pricing/
($0.011 per 1,000 Neurons; **10,000 Neurons/day free**).

| Provider / model | $ for 26 turns | vs Gemini |
|---|---|---|
| **Gemini Pro** (current) | **$0.3375** (actual) | — |
| kimi-k2.6 (1T, max quality) | $0.163 | 2.0× cheaper |
| nemotron-3-120b-a12b | $0.083 | 3.9× |
| **gpt-oss-120b** (recommended) | $0.057 | 5.6× |
| mistral-small-3.1-24b | $0.056 | 5.7× |
| llama-4-scout-17b-16e | $0.045 | 7.1× |
| gpt-oss-20b | $0.032 | 10× |
| gemma-4-26b-a4b-it | $0.017 | 19× |
| glm-4.7-flash | $0.011 | 29× |

## The real headline: the free tier

This site burns only ~1–4k Neurons/day; Workers AI includes 10,000 Neurons/day free. So at
current traffic **every model above is effectively $0/mo**, while Gemini bills from token one.
Token price only starts to matter past a per-day turn threshold (model-dependent):

| Model | free simple-turns/day |
|---|---|
| glm-4.7-flash | ~426 |
| gpt-oss-20b | ~157 |
| llama-4-scout-17b-16e | ~109 |
| gpt-oss-120b | ~87 |
| kimi-k2.6 | ~30 |

## Projected monthly cost at sustained traffic

| Turns/day (~/mo) | Gemini | gpt-oss-120b | llama-4-scout | glm-4.7-flash | kimi-k2.6 |
|---|---|---|---|---|---|
| 50 (~1,500) | $18.44 | **$0.00** | **$0.00** | **$0.00** | $2.27 |
| 200 (~6,000) | $73.75 | $4.26 | $2.78 | **$0.00** | $19.00 |
| 1000 (~30,000) | $368.77 | $34.51 | $27.09 | $4.46 | $108.18 |

## Recommendation

Because cost is essentially free at real traffic, optimize for **quality + tool-calling
reliability** (the agentic GitHub loop is retained).

**Avoid reasoning models here.** Live testing showed `@cf/openai/gpt-oss-120b` (and the
gpt-oss family) are reasoning models: with the short `max_tokens` this bot uses, the output
budget is spent on hidden `reasoning_content` and `content` comes back **null**
(`finish_reason: length`). Reasoning is also billed as output tokens, so the real cost is
higher than the table's $0.057. Wrong fit for a terse persona bot.

**Bake-off (real system prompt + repo tools, live).** Models were tested on a simple
question, an actual repo-lookup (must emit a `tool_call`), and the privacy/naming rule
(must not say the forbidden term):

| Model | Verdict |
|---|---|
| **llama-4-scout-17b-16e** ✅ default | clean tool_calls, grounded, **best persona voice** (followed the privacy rule + gatekeeping offer verbatim) |
| mistral-small-3.1-24b ✅ backup | correct (`list_my_repos` first), grounded, but terser voice; 128k ctx |
| nemotron-3-120b | good answer **without** tools, but null content **with** tools present — unsafe for the agentic loop |
| llama-3.3-70b-fp8-fast ❌ | refuses basic questions ("input lacking necessary details"), leaks tool-calls as text |
| gpt-oss-120b / 20b ❌ | reasoning models — null content under short `max_tokens` |
| kimi-k2.6 | model id returned no output on this endpoint |

Default: **`@cf/meta/llama-4-scout-17b-16e-instruct`** — best persona/privacy adherence, clean
structured tool calls, grounded, cheapest+fastest of the viable set ($0.27/M in, $0.85/M out),
~7× cheaper than Gemini and free at current traffic. Backup: `@cf/mistralai/mistral-small-3.1-24b-instruct`.
Model is env-selected (`WORKERS_AI_MODEL` + the `WORKERS_AI_USD_*_PER_MTOK` rate envs).

## Cold-start: Gemini as the session starter

Workers AI models go cold on a low-traffic site; a cold load can exceed the request timeout.
So in `workersai` mode each turn **prefers Cloudflare but falls back to Gemini when CF is cold
or errors** — Gemini is the "session starter." The cold CF attempt itself triggers Cloudflare's
model load, so a later turn finds CF warm and traffic **rotates back to Cloudflare**. Warm state
is a DynamoDB marker (epoch of last CF success, 180s window); cold turns use a 6s probe, warm
turns a 20s timeout. Each turn's cost and logs are attributed to the provider that actually
served it. Net effect: visitors never wait on a cold load, and steady traffic runs on Cloudflare.

## Going forward: exact accounting

Conversation logs now record `provider`, `model`, `inputTokens`, and `outputTokens` per turn,
so future Gemini-vs-Workers-AI comparisons are exact rather than modeled.
