# Private experimental forensics on Render

Preparation only. No Render service or paid plan has been created. The experimental models do not establish authenticity, calibrated deepfake probabilities or fraud. Validate model redistribution/commercial rights and empirical accuracy before external testing.

## Service settings

Create a **Private Service**, not a public Web Service or background worker. Select the same workspace and region as the API. Each service has separate compute billing.

| Setting | Value |
| --- | --- |
| Repository | `JamDesigns/AI-Scam-Shield` |
| Service name | `aiss-forensics` |
| Runtime | Docker |
| Root Directory | Leave empty (repository root) |
| Dockerfile Path | `api/local-forensics/Dockerfile` |
| Docker Build Context | Repository root (`.`) |
| Docker Command | Leave empty; use image CMD |
| Listening port | `8081` |
| Auto-deploy | Disable initially |

First validate the image locally, then select a paid compute size based on observed memory, latency and headroom. Do not choose a size from model file size alone. Use the reviewed release commit once available remotely; do not deploy an older main branch that lacks this Dockerfile. Do not change the API service branch or its Dockerfile.

No AI/provider keys, Neon connection or RevenueCat secrets are required by the forensic service. The Dockerfile-specific ignore list includes only forensic sources and the existing image model. AASIST and Silero weights download during build from pinned URLs and must match checksums. All model objects load during build as a compatibility check. Inference runs offline, as a non-root user with bounded CPU threads, using one server worker. The image excludes local translation models and their optional dependencies.

## Local image validation

From the repository root:

```powershell
docker build -f api/local-forensics/Dockerfile -t aiss-forensics:validation .
docker run --rm --network none --memory 4g --cpus 2 aiss-forensics:validation python benchmark.py
```

These commands create an isolated image and ephemeral benchmark container. They do not recreate the API, change ports or access PostgreSQL. Build downloads dependencies/models; the benchmark has no network. The 4 GiB limit is a local test ceiling, not measured usage or a hosting recommendation. Synthetic results report load/analysis times, processed frames/audio windows and peak RSS; they do not measure accuracy, real-client concurrency, Docker's complete memory usage or Render performance. If the 40-second engine deadline is exceeded, investigate before deployment rather than increasing deadlines blindly.

## API connection after service validation

Copy the actual **single-label internal hostname** shown by Render, including its generated suffix if any. Configure only on the API:

```dotenv
FORENSICS_PROVIDER=self-hosted
FORENSICS_BASE_URL=http://<internal-hostname>:8081
```

The client accepts private service hostnames on HTTP port 8081 plus its existing loopback/Docker addresses. Public domains/IPs, credentials, query strings and custom paths remain rejected; redirects are forbidden. This uses network isolation, not per-request authentication. Keep the service private and do not attach unrelated untrusted services to the same private network.

Do not set `ANALYSIS_PROFILE=local` on the production API. Gemini/DeepL remain independently configured. Hive settings are ignored when self-hosted routing is selected; retain secrets securely if desired, with no automatic paid fallback. If the selected forensic service is unavailable, verify the recoverable error path rather than assuming analysis proceeds.

Check `/health` from the API's private network, then run synthetic text/image/video API acceptance, unavailable-service/retry checks and a bounded concurrency test. Do not merge the main deployment PR until Neon backup, cloud credentials, model rights, service readiness and deployment approval are settled.

References: https://render.com/docs/private-services and https://render.com/docs/docker (checked 22 November 2026).

## Operator-run Linux measurements (22 November 2026)

The Docker image built successfully on Docker Desktop Linux, including checksum verification and actual model loading. The operator then ran the included offline synthetic benchmark:

| CPU limit | Container memory ceiling | Load seconds | Analysis seconds | Process peak RSS MiB |
| --- | --- | --- | --- | --- |
| 2 | 4 GiB | 1.558 | 7.425 | 777.7 |
| 1 | 2 GiB | 2.160 | 15.041 | 836.8 |

Both runs processed 14 frames and 12 audio windows representing 180 seconds. ONNX GPU-discovery warnings were nonfatal; CPU execution completed. The 1 CPU / 2 GiB size is a candidate for low-traffic closed testing, not an accepted production capacity. Its 15-second result leaves limited margin under the engine's original 20-second analysis deadline. Render performance, full-container memory, repeated real inputs, concurrent requests and model accuracy remain unvalidated. The single-worker server serializes requests, so queuing delay can exceed the API's deadline under load. Do not claim a concurrent-user capacity from these results.

Local validation for this delivery: 544 API tests passed and TypeScript built; 11 Python server/integrity tests and 7 speech-gate tests passed. No Render service was created or paid plan selected during preparation.


## Render HTTP investigation and bounded deadline adjustment

The operator confirmed health on the 1 CPU / 2 GiB Render service. A benchmark loading a second Engine exceeded the original 20-second limit. Subsequent HTTP tests against the already loaded server returned: one frame/no audio, 0.529 s; 14 frames/no audio, 9.449 s; one frame/one audio window, 2.020 s; one frame/12 audio windows, 14.264 s. The combined 14-frame/12-window request returned HTTP 503. This suggests the combined workload exceeded its budget, but that response did not distinguish the original failure reason.

The forensic analysis budget is now 40 seconds, exposed as `forensicsTimeoutSeconds` on `/health`. Deadline failures retain HTTP 503 and add the fixed diagnostic `reason: deadline_exceeded`. Native ONNX/PyTorch calls cannot be interrupted mid-call; budget checks now run after each native inference too, preventing a late result from being reported as success. The 10-second request-reading and speech-gate deadlines remain unchanged. The API still has an 80-second forensic-call default and a 90-second operation deadline, and the mobile client has a 100-second request timeout. These are nested bounds, not additive allowances; decoding, extraction, transcription, translation and semantic inference also consume the outer budget. Full-pipeline success and concurrent capacity remain unvalidated.

After deploying only the private service, confirm `/health` reports 40, then repeat the combined HTTP test with a client timeout of 55 seconds. Do not treat the adjustment as successful until that test passes; do not silently reduce the sampling coverage or change the paid compute plan. Native-process memory plus diagnostic-client memory and request queues must still be monitored.
