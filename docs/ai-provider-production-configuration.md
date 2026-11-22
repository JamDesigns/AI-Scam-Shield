# Semantic AI provider configuration and production validation

Status: implementation prepared in an isolated working copy on 22 November 2026. No production account, environment, running API, database or store settings were changed. No real provider requests were made. Do not interpret mocked adapter tests as measured analysis quality or provider cost.

## Provider boundary

`api/src/ai/ai-provider-factory.ts` selects `ollama`, `openai` or `gemini` from configuration. Existing analysis and quota code continues to call `AiProvider.requestJson` and receives the same parsed assessment object. No vendor fallback is performed. Unknown provider names fail explicitly. Missing required model/key makes the configured provider unavailable; routes must keep their existing unavailable-service response.

Gemini uses its native `generateContent` REST endpoint with `systemInstruction`, inline media and JSON-schema generation. It is not an OpenAI-compatible proxy. Images, sampled JPEG video frames and PCM WAV supplied by the transcription pipeline are accepted. Raw video is deliberately not accepted: the adapter cannot route around the forensic pipeline or replace evidence with a model's guesses. Existing application assessment validators remain authoritative after JSON parsing.

Switching between already implemented adapters requires provider/model/base/key configuration, not mobile UI or quota changes. Adding a new vendor requires one adapter and registration. Model support, parameters, rate limits and privacy terms still require verification; configuration cannot make an incompatible model capable of vision or JSON schema.

## Coordinator integration

Keep `ANALYSIS_PROFILE` and its production guard intact. The existing local analyzer overrides semantic provider configuration in local mode. RevenueCat remains external and independent of the API profile. Do not enable a paid cloud fallback for a failed local request.

Add these optional environment fields to `index.ts`'s validated schema and parsing object:

```ts
AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(65536).default(4096),
AI_SEND_TEMPERATURE: z.enum(["true", "false"]).default("true"),
```

```ts
AI_MAX_OUTPUT_TOKENS: process.env.AI_MAX_OUTPUT_TOKENS,
AI_SEND_TEMPERATURE: process.env.AI_SEND_TEMPERATURE,
```

Pass these two properties into the existing `createAiProvider` configuration:

```ts
maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
sendTemperature: env.AI_SEND_TEMPERATURE === "true",
```

The default cap also applies if the coordinator does not yet wire the environment field. Requests may override it with `AiProviderRequest.maxOutputTokens`. The application must not expose an unbounded user-controlled cap. Some reasoning models include hidden thinking in their output limit; calibrate the cap against actual assessments rather than lowering it blindly. Disable temperature explicitly for models that reject it; the adapter does not guess model capabilities from model names.

Illustrative Gemini deployment configuration (not an instruction to edit a real `.env`):

```dotenv
ANALYSIS_PROFILE=production
AI_PROVIDER=gemini
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
AI_MODEL=gemini-3.5-flash-lite
AI_MAX_OUTPUT_TOKENS=4096
AI_SEND_TEMPERATURE=true
AI_API_KEY=<configured securely on the API server>
```

Reset the base URL when switching provider: an inherited Ollama URL must not be sent with a Gemini key. Gemini requires HTTPS and rejects credentials/query/fragment in its base URL. Its key is sent in `x-goog-api-key`, never in the URL, and redirects are rejected. The model ID is validated to prevent path injection. Cloud configuration belongs only on the backend, never in Flutter assets, build defines or public documentation.

Equivalent registered providers:

| Provider | Base URL | Additional configuration |
| --- | --- | --- |
| Ollama local | `http://host.docker.internal:11434` (network-dependent) | `AI_MODE=local`, installed model |
| Ollama Cloud | `https://ollama.com` | `AI_MODE=cloud`, API key and supported cloud model |
| OpenAI | `https://api.openai.com/v1` | API key and a vision/structured-output capable model where needed |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | API key and an available compatible model |

Other remote services have independent `FORENSICS_*`, `TRANSCRIPTION_*` and `DEEPL_*` configuration. Adding Gemini here does **not** remove Hive or DeepL from existing production video routes, nor make experimental local forensic processing production-ready. Deepgram remains available; the additional Gemini transcription adapter can be explicitly selected instead.

## Optional Gemini audio transcription

`GeminiMediaTranscriptionProvider` is registered independently by `createMediaTranscriptionProvider`. It uses the native Gemini adapter, but extracts only the server tempfile's audio with the existing `extractPcm`. The resulting 16 kHz mono PCM16 WAV is bounded at 180 seconds, 5,760,044 bytes including its WAV header. It never buffers or sends the original 100 MiB video stream. Server extraction, encoding and HTTP all share a cancellable outer deadline. No audio or exact all-zero PCM skips the paid request; this is not a general voice-activity detector, and quiet nonzero audio is not discarded arbitrarily.

Add `filePath` and `durationSeconds` from the validated server tempfile/probe to the existing video provider input in `index.ts`:

```ts
const input = {
  filename: file.filename, mimeType, sizeBytes,
  filePath: file.filepath, durationSeconds,
  createReadStream: () => createReadStream(file.filepath),
};
```

These properties are internal trust-boundary metadata. Do not accept arbitrary paths or durations directly from the mobile body. Legacy Deepgram ignores the new optional fields. Gemini requires them, validates positive duration <=180 seconds and absolute paths, and fails safely if they are absent. It returns original-language `transcript`, detected `languages`, `words: []` and optional `transcriptionStatus`. It does not fabricate confidence or word timing. A nonempty audio clip with no recognized words is `unintelligible`, not proof of no speech. The coordinator can forward `transcriptionStatus` in the existing response without changing quota counting.

Explicit configuration example:

```dotenv
TRANSCRIPTION_PROVIDER=gemini
TRANSCRIPTION_BASE_URL=https://generativelanguage.googleapis.com/v1beta
TRANSCRIPTION_MODEL=gemini-3.5-flash-lite
TRANSCRIPTION_API_KEY=<configured securely; may be the same account/key as AI_API_KEY>
```

No implicit reuse of `AI_API_KEY` occurs: selecting Gemini transcription without its configured key yields unavailable service. Optional `maxOutputTokens`/`sendTemperature` properties are supported by the transcription factory; expose separately validated environment fields if desired. `MediaTranscriptionProviderMedia.onUsage` receives the Gemini usage metadata if the coordinator supplies an observer. Declared support for the app's 25 languages is a test requirement, not proof that every accent/language transcribes accurately. Audio transcription remains a separate billable Gemini call from video interpretation.

## Usage hooks and failures

Each adapter can report a typed `AiProviderUsage` to an optional per-request `onUsage` observer. It contains only provider/model and provider-reported counters. Missing counts stay missing; zero stays zero. Cached input is a subset of input; OpenAI reasoning tokens are a subset of output, while Gemini reports thought tokens separately from candidate output. Do not sum these fields indiscriminately. Use the provider's billing rules and returned total.

The observer is also called before rejecting a truncated/blocked/invalid assessment when the provider returned usage. It must not change user quota accounting. A failing observer cannot change the analysis result. There is no global mutable `lastUsage`, which would mix simultaneous device requests. Index/database persistence and cost dashboards are separate integration work; this patch does not claim they already exist.

For per-operation metering, the coordinator can wrap the provider at the operation boundary and inject `onUsage` into every `requestJson` invocation. Use the server operation ID and attempt ID outside the public assessment object. Do not log prompts, media, transcripts, API keys or raw errors. Do not count HTTP failures without usage as zero-cost: reconcile them against provider usage exports. Provider errors are sanitized; no automatic retries are added because retries can create extra charges.

## Current public price references

Rates checked 22 November 2026, USD before taxes and separate tooling/translation/forensic/hosting charges. They are not the user's contracted rate or a measured cost per analysis.

* [Gemini pricing](https://aistudio.google.com/docs/pricing): Gemini 3.5 Flash-Lite standard input USD 0.30 per million tokens and output USD 2.50 per million, including thinking. Its free access has model/project quotas. [Current terms](https://aistudio.google.com/docs/terms) require paid services for an API client offered to EEA/UK/Swiss users; validate applicability before distributing a tester build. This is not a recommendation to use unpaid access for the production test.
* [Ollama pricing](https://ollama.com/pricing): local inference has no per-call vendor charge but uses hardware; cloud pay-as-you-go has per-model token charges. A USD 0 base subscription does not mean unlimited free inference. Listed subscriptions and credits do not by themselves prove sufficient concurrency or resale terms for this app.
* [OpenAI pricing](https://developers.openai.com/api/docs/pricing): the selected deployed model determines rates and capabilities. A personal ChatGPT subscription is not an API usage allowance. No production model or contract was read from secret configuration.

For illustration only: 2,000 Gemini input tokens plus 500 output tokens at those rates cost USD 0.00185. Actual prompts include rules, schemas, OCR, frames and explanations. Image assessment currently makes two semantic calls; one user's unit is not one billable request. Video has separate forensic/transcription charges. Do not extrapolate this text illustration to multimedia.

## Reproducible comparison before the 14-day test

1. Pin each provider/model and public tariff date. Define a small explicit monetary ceiling and reconcile with the provider console; a token cap is not a monthly budget.
2. Reuse synthetic fixtures already approved for this project: benign versus direct fraud versus scam-awareness reporting, visible and hidden text, QR/URLs, synthetic and genuine-looking images, video audio/silence and transient frames. Do not send real private messages.
3. For each supported output locale, preserve original evidence and verify the narrative language, JSON enums, safety/refusal handling and inconclusive outcomes. Include Irish, Maltese and Catalan rather than assuming a supported UI proves speech/translation coverage.
4. Compare text, both image subcalls and the complete video chain independently. Record operation/attempt ID, media duration/size, stage latency, provider counts, translated characters, transcription minutes, forensic billing units, retry/failure counts and actual invoice tariff.
5. Measure cost per **attempt**, per completed analysis and per active tester. Charge-free quota rollback does not reverse a vendor bill. Separate warm local/server processing, cloud inference and total workflow cost.
6. Human-review false negatives/positives and report uncertainty. No vendor/model should be accepted because it returns valid JSON alone. Validate risk explanations and recovery of actual hidden payloads; semantic descriptions do not prove forensic authenticity.
7. Only after a small controlled live sample passes should the coordinator choose the tester-production configuration. The local phone run, live translations, paid entitlements and full provider comparison remain pending.

## Protocol references and verification

* [Google generateContent](https://aistudio.google.com/api-reference/generate-content), [structured output](https://aistudio.google.com/docs/structured-output), and [machine-readable v1beta discovery schema](https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta).
* [OpenAI Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create).
* [Ollama generate](https://docs.ollama.com/api/generate).

Offline verification uses synthetic mocked HTTP responses only. Targeted tests cover Gemini text/image requests, required schema, blocking/truncation, ignored thought text, malformed JSON, cancellation/deadlines, safe upstream errors, factory selection, token caps and usage metadata, plus existing analysis validators and local behavior. Gemini transcription tests mock PCM extraction and cloud HTTP, verify WAV metadata/bounds, original-language preservation, missing metadata, invalid transcripts, no full-video reads, cancellation and no-audio/digital-silence request avoidance. They do not claim real FFmpeg/cloud/device/language-quality validation. TypeScript typechecking is required before integration.
