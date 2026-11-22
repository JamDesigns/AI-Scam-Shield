# Local and production analysis

The API selects an analysis profile at startup. The mobile client continues to use its configured API URL in both profiles.

| Profile | Analysis | Video forensics |
| --- | --- | --- |
| `production` (default) | Existing configured external AI, transcription and translation providers | Existing configured external detector |
| `local` | One self-hosted Gemma 4 E4B endpoint. FFmpeg prepares sampled video frames and audio clips for analysis. | Optional local image-frame and audio detectors; experimental signals with inconclusive verdicts |

Configure the local profile only on the development API. Set `ANALYSIS_PROFILE=local`, `LOCAL_AI_BASE_URL=http://host.docker.internal:18080/v1` and `LOCAL_AI_MODEL=gemma4-e4b`. To enable the experimental forensic service, also set `LOCAL_FORENSICS_BASE_URL=http://host.docker.internal:8081`. The URL is the OpenAI-compatible API base, including `/v1`. For production, use `ANALYSIS_PROFILE=production` and configure the existing external provider settings on the remote API host. RevenueCat is configured separately from the analysis profile.

## Local setup

1. Install a recent `llama-server` build with Gemma 4 multimodal support. Start the E4B model and its matching multimodal projector. The model download and inference run on the development computer. The self-hosted model has no hosted request quota. Capacity depends on local memory and processing speed. [Gemma llama.cpp guide](https://github.com/google-gemma/docs/blob/main/docs/deployment/llamacpp.md)
2. Use the model alias `gemma4-e4b` or set `LOCAL_AI_MODEL` to the exact model ID reported by `/v1/models`. Make port 18080 reachable from the Docker API container through `host.docker.internal`. If Docker requires the server to bind beyond loopback, restrict inbound access to the development network. [llama-server options](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
3. In the local review workspace, start the downloaded model with `outputs/iniciar-ia-local.ps1 -DockerAccess` and the forensic service with `outputs/iniciar-forense-local.ps1 -DockerAccess`, then select the local API profile with the operator activation script. These operator scripts belong to the review workspace and are not repository files.

   ```powershell
   & '.\outputs\activar-api-local-validada.ps1' -AnalysisProfile local -LocalAiBaseUrl 'http://host.docker.internal:18080/v1' -LocalAiModel 'gemma4-e4b'
   ```

4. Keep the local API and PostgreSQL containers available. For the USB debug APK, forward port 3000 with `adb reverse tcp:3000 tcp:3000`.

## Verification

- Check model reachability from Docker, then submit a short synthetic text and a still image. Confirm that the API returns valid analysis results in the selected app language.
- Submit the seven-second synthetic phishing clip. Confirm that the result uses both visible and spoken evidence. Use an additional fixture with distinct clues in the audio and the frames to verify that both modalities actually contributed.
- Check that the enabled local service returns sampled frame and audio signals with inconclusive video/audio verdicts; deepfake detection stays unavailable. A scam-risk result can still be useful when authenticity evidence is unavailable.
- Stop the local model and submit another test input. Expect a recoverable provider error and verify that an incomplete analysis leaves quota unchanged. Restart the model before repeating the same test.
- Exercise the production profile separately with configured external credentials and synthetic media. Compare its existing response contract and forensic evidence with the prior deployment.

## Forensic model scope

The Android app already includes the Thermostatic Community Forensics Frontier image detector. The bundled ONNX file matches the model card SHA-256 `d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d`. The publisher releases these weights under MIT. The detector processes a single RGB image and produces one AI-generation logit. Its reference preprocessing uses a 440-pixel short edge and a 384 × 384 centre crop. [Model card and licence](https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08)

The [local forensic service](../api/local-forensics/README.md) now runs this image detector on sampled frames and the official AASIST baseline on bounded audio windows. Its raw outputs are experimental and are not calibrated authenticity probabilities. Validate that signal on paired authentic and manipulated clips, including recompressed versions, before giving it a user-facing confidence label. Temporal manipulation and synthetic speech require separate validation. [DeepfakeBench](https://github.com/SCLBD/DeepfakeBench)

## Regression corrections

Local audio transcription now requires the CPU service speech-activity gate before sending voiced audio to Gemma. The local API uses LOCAL_FORENSICS_BASE_URL for that service, with host.docker.internal:8081 as its default. The health response must advertise speechAvailable:true and contractVersion:2. Voiced but unintelligible speech is reported separately from no speech. The production provider selection is unchanged.

Video processing screens at eight low-resolution frames per second to identify changes and transient visual intervals. It sends at most fourteen selected images to the model, including timeline coverage and novel intervals. This remains partial coverage: very brief, subtle or numerous changes may still be missed. The caller deadline and subprocess cancellation remain enforced.

Android preserves raw OCR and adds conservative, unverified URL candidates separately. Selected textual PNG and EXIF fields are untrusted evidence; location and device identifiers remain excluded. Arbitrary steganography and encrypted or unknown pixel payloads are outside this coverage. The local QR decoder patch preserves unsigned byte values for character decoding, including UTF-8 ECI segments.

In the review workspace, actualizar-correcciones-locales.ps1 restarts the identified local CPU service, rebuilds the local API and restores the authorised local Premium test grant without an expiration date. APK installation and physical-device regression tests are a separate pending step.


### Bounded pixel-text recovery (PNG/BMP)

The mobile client inspects original decoded 8-bit RGB PNG/BMP pixels before JPEG preparation. A background isolate attempts UTF-8/ASCII plaintext recovery from the first 131,072 row-major pixels, using 1 or 2 low bits per R/G/B channel and RGB/BGR channel order, with eight byte alignments. Images above 4 million pixels and other pixel formats are not scanned. Work has a 1.5-second cooperative scan budget; at most three candidates of 600 characters are retained. A partial/unsupported status is sent with the evidence. Pixel text is heuristic, unverified and untrusted; its mere presence is not proof of steganography or fraud. Do not execute candidates or fetch recovered URLs.

This is not statistical steganalysis or password cracking. It does not recover encrypted/compressed payloads, arbitrary pixel layouts, JPEG/DCT steganography, audio/video steganography, or data outside the inspected prefix. A negative scan must never establish absence of hidden content. The fixed bit orders and UTF-8 text heuristics can miss short or non-textual payloads. A generic printable-run scanner can recover part of the original AISSLSB1 test image without any special handling of its header; that test alone is not evidence of broad detection accuracy.

Independent Python-generated fixtures cover RGB/BGR and single-channel payloads, two-bit BMP, non-byte-aligned text, accented/Greek/Bulgarian UTF-8, benign hidden text, clean/noise controls and a payload outside the inspected prefix. They are synthetic regression fixtures, not a real-world accuracy benchmark. Existing user quota accounting remains one operation per input; local and production use the same on-device recovery and pass the untrusted evidence to their configured analysis provider.

Local structured image/video requests allow up to 2,048 completion tokens; text-only requests retain 1,024. The caller deadline, response size bounds and strict stop/JSON/schema checks remain mandatory. A token-limited completion is never accepted as a safe result. Physical multilingual LSB tests exposed two incomplete local responses at the former 1,024-token cap; neither created a usage event.



### Additional hidden-content inspection (bounded, not universal steganalysis)

Images retain their original bytes for offline inspection before the AI JPEG thumbnail is prepared:

- A narrow adapter to the pinned `image` 4.8.0 coefficient decoder inspects eligible quantized JPEG AC coefficients (absolute value above one), using luminance-only and interleaved MCU/zigzag streams, both byte bit orders and eight alignments. Header dimensions/sampling are checked before this decoder allocates blocks. Limits: 8 MiB encoded, 1 million pixels, 8,192 blocks, 131,072 bits per stream, a cooperative two-second scan budget and three candidate strings of 600 characters. Internal decoder compatibility is intentionally pinned and tested with independent C libjpeg fixtures. No claim covers F5, OutGuess, randomized/password-dependent layouts or arbitrary encrypted coefficients.
- Structurally consistent appended ZIP containers are recognized after supported media end markers. At most eight entries and a 64 KiB central directory are inspected in a file up to 16 MiB. Local and central headers must agree. Stored/deflated text is read only within fixed 8 KiB streaming input/output bounds and checked against declared size and CRC. There are no path extractions, nested-archive recursion, password guesses or payload execution. Encryption flags are declarations, not authentication of ciphertext. Random/high-entropy data and isolated magic bytes are not evidence of encryption.
- The client reports unreadable encrypted-entry counts explicitly as an unverified `client_report`. If the model otherwise reports no clear fraud signals, the overall image assessment stays inconclusive with low confidence; separate positive fraud evidence is preserved. A localized notice explains that some hidden content could not be read. All 25 catalogs contain this notice.

The API applies the same offline inspection to original video uploads before either the local or production AI provider:

- Selected container text tags and a four-second prefix of one supported text-subtitle track.
- Low bits of at most 65,536 original PCM16 sample frames from up to four seconds of lossless mono/stereo PCM16/16-bit ALAC/FLAC, without mixing/resampling. Lossy AAC/Opus streams are not treated as original sample-bit carriers.
- Up to three RGB8 lossless PNG/FFV1/raw/HuffYUV/UtVideo frame targets, limited to one million pixels and a bounded prefix per frame. Lossy H264/VP9 pixel low bits are not treated as preserved hidden data.
- Appended ZIP inspection for small supported containers, with the same structural/inflation limits. Larger files and unsupported layouts are reported as uninspected, not clean.

The scanner has a seven-second total cooperative/cancellable budget, restricted local file/pipe protocols and demuxer formats, explicit FFmpeg thread/output bounds, at most six candidates and a partial status on resource/processing limits. Candidate selection retains representation from each evidence channel; AI context uses bounded excerpts and declares omissions/truncation. It never fetches recovered URLs. Raw recovered text remains in its original language; user-facing analysis follows the effective app language. MOV and Matroska MIME types are additionally accepted for lossless carriers under the existing 180-second/100-MiB limits.

A sparse final video frame may have no output after a late seek. JPEG thumbnails use an explicit full-range pixel format; after a successful FFmpeg command, only a missing positive-time output is skipped. All other process/file errors propagate and owned temporary directories are cleaned up. At least one decodable frame remains mandatory.

Evidence of hidden content is separate from evidence of fraud. Do not infer educational/reporting intent just because recovered evidence is JSON-quoted or comes from an auxiliary track; that context requires affirmative evidence. Encryption alone cannot establish either fraudulent or safe contents. Unknown formats, compressed/ciphered low-bit streams, short text below the recognizer threshold, unsampled regions and unknown algorithms remain outside coverage. Fixtures are synthetic regression controls, not a real-world accuracy benchmark. The standalone application still has no general audio-file input; audio inspection here applies to supported video soundtracks.

For newly supported MOV/Matroska carriers, an Android-native metadata failure may defer an unknown duration to the server, which independently probes and rejects invalid or over-180-second videos before reserving a usage unit. The client still rejects empty/oversized inputs and any known excessive duration. Other formats retain the existing native preflight behavior.


### Detailed offline narratives

Local analysis generates evidence-specific reasons and practical explanations in British English, then translates only those narrative fields into the effective app language with a pinned MADLAD-400 CTranslate2 int8 model. All 25 supported locales are accepted. English bypasses translation. Original OCR, transcripts, media and pasted input stay in their original language; numerical scores, categories, confidence, forensic fields and reason ordering are not translated or regenerated. Production providers retain their existing target-language routing.

The previous standard-summary fallback has been removed. If detailed translation is unavailable, malformed, truncated, omits a protected literal or changes the response shape, the analysis fails before completion rather than returning a generic or partially translated result. Existing atomic operation accounting still records one event for one successful input, regardless of the internal analysis and translation steps.

The translation endpoint is /translate on the existing local service (port 8081); the mobile app continues to call only the Node API on its configured address. No hosted translation account, provider key or hosted quota is used. Models remain on the development computer, outside the APK and outside Git.

The model is the Nextcloud-AI/madlad400-3b-mt-ct2-int8 conversion at revision aa32bbdeba7880eff2096ec044cb155a340a9400, based on Google MADLAD-400 and distributed under Apache-2.0. Four fixed model files (approximately 3 GB total) are size/hash checked before use. The model binary SHA-256 is 77b9fd9ab97c1259d07089b5f854393dad81bc5fb5647d3f9a5d101c94f40daa. No remote Python code is loaded. See api/local-forensics/vendor/MADLAD-LICENSE and the setup notes in api/local-forensics/README.md.

Translation accepts at most 16 strings, 6000 source characters and 48 sentence segments per request, with explicit encoder/decoder bounds and a 45-second service deadline. Whole sentences retain context; placeholders preserve URLs, numbers, addresses and control-like tokens exactly. Missing or duplicated placeholders and invented numerical literals are rejected. This avoids both silent literal mutation and the unrelated output that can result from translating isolated prepositions. Incomplete model generations remain errors. CPU execution uses int8 weights and disables optional packed-GEMM duplication to fit the existing 16 GB development computer; inference speed depends on resources. Machine translation testing is not a claim of native linguistic certification.

Activity responses include the stored inputType. The app localizes media labels from that type, while literal user text such as [image] remains unchanged. No history rewrite or database migration is required.

Sources: https://huggingface.co/google/madlad400-3b-mt ; https://huggingface.co/Nextcloud-AI/madlad400-3b-mt-ct2-int8 ; https://opennmt.net/CTranslate2/performance.html .

