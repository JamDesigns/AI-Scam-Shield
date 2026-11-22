# Local experimental forensics

This CPU service provides offline detector signals behind the development Node API. It reads no provider keys, stores no submitted media and makes no network calls during inference. The public Android and iOS API contract still goes through the Node API. Production provider routing is independent.

## Models and scope

- Images and sampled video frames use the app's existing Community Forensics Frontier ONNX file. Reference preprocessing is RGB, EXIF orientation, bicubic resize to a 440-pixel short edge, 384-pixel centre crop and ImageNet normalisation. The native image decision threshold is logit 1.359375. An image threshold is not a calibrated video decision rule.
- Audio uses the official NAVER AASIST checkpoint and implementation at commit `a04c9863f63d44471dde8a6abcb3b082b07cd1d1`. Audio is mono 16 kHz signed PCM. At most twelve 64,600-sample windows cover the beginning and end, with deterministic repetition for short clips, matching upstream evaluation padding. Silence and clips shorter than half a second are skipped. This is an ASVspoof 2019 baseline; accuracy on modern cloned voices, music, compression and the app's languages remains unvalidated.
- This service does not implement temporal video manipulation or face-swap detection. It does not inspect every frame or guarantee detection of hidden content.

Responses contain raw logits and sampled timestamps. They contain no authenticity probability. The Node API keeps video generation and audio verdicts `inconclusive` while exposing experimental signals, and keeps deepfake detection `unavailable`. A silent or absent audio signal remains unavailable. Semantic analysis receives an explicit notice that these outputs are uncalibrated and cannot establish fraud or authenticity.

## Setup

Use Python 3.10 or newer in a virtual environment, install `requirements.txt`, and run:

```powershell
python prepare_model.py --model-dir ./models
python server.py --image-model ../../app/assets/models/community_forensics_frontier_fp16.onnx --audio-model ./models/AASIST.pth
```

The source, config and model hashes are checked at startup. AASIST loading uses `torch.load(weights_only=True)`. The ONNX asset stays in the existing app asset directory. The checkpoint download is approximately 1.3 MB; framework dependencies are larger. No account or hosted inference quota is required.

Default binding is loopback port 8081. For Docker access, use `--host 0.0.0.0` on a trusted development network and set `LOCAL_FORENSICS_BASE_URL=http://host.docker.internal:8081` together with `ANALYSIS_PROFILE=local`. The optional setting enables forensic processing; if the configured service is unavailable, the scan fails without consuming an analysis. If omitted, local semantic analysis retains unavailable forensic evidence. Remote production ignores this local service setting.

The review workspace also provides `outputs/iniciar-forense-local.ps1 -DockerAccess`, which prepares the virtual environment, verifies the checkpoint and starts the service. This operator helper is outside the repository.

## Limits and validation

### Speech activity gate

`POST /speech` accepts exactly `{ "audioPcm16Base64": "..." }`: mono signed
little-endian PCM at 16 kHz, at most 180 seconds. It returns `provider:
"silero-vad"`, `sampleRate:16000`, `analyzedSeconds` and at most 1,024 ordered,
non-overlapping `speechIntervals` with `startSeconds` and `endSeconds`. The
detector uses CPU ONNX inference, resets recurrent state and 64-sample context for
every request, and checks a ten-second processing deadline between 512-sample
windows. A native inference call cannot be interrupted. Silence and the tested
synthetic tones return no speech intervals.

The local Node adapter requires this gate for every nonempty audio stream. If
the gate is stopped, omitted, returns incomplete coverage, or contradicts its
sample count, transcription fails recoverably instead of sending ungated audio
to Gemma. Video without an audio stream still works. Only chunks overlapping
voiced intervals reach Gemma, with leading/trailing non-speech trimmed. Detector
metadata distinguishes `no_speech`, `transcribed`, `partial` and `unintelligible`;
speech that could not be transcribed is not relabelled as no speech. No blacklist
of apology phrases is used: real spoken apologies remain valid speech.

`GET /health` advertises `contractVersion:2`, `speechAvailable:true` and
`speechProvider:"silero-vad"`. Operators must restart a version-one service before
activating the new Node adapter. `prepare_model.py --model-dir ...` verifies both
AASIST and Silero weights. `server.py --vad-model ...` is optional; by default the
VAD model is `silero_vad.onnx` beside the AASIST checkpoint.

The pinned Silero model comes from commit
`066409f3d9db45a30d21dfcbf9147826ffdd7052`, has SHA-256
`1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3`,
and is 2,327,524 bytes. It is MIT licensed, Copyright (c) 2020-present Silero
Team; the complete notice is in `vendor/SILERO-LICENSE`.
[Official implementation and model](https://github.com/snakers4/silero-vad/tree/066409f3d9db45a30d21dfcbf9147826ffdd7052).
The ONNX state and context contract follows its official `OnnxWrapper`; no
downloaded Python implementation is executed. Thresholds of 0.5/0.35, a
160-millisecond minimum voiced/silent span and 80-millisecond padding retain short
utterances and provide hysteresis. This is a speech activity signal, not a
language detector or a proof of intelligibility. The synthetic Spanish/English
fixtures do not establish coverage accuracy for every required app language,
human accent or recording condition.

Requests are limited to 20 MiB, fourteen images of at most 2 MiB each, 180 seconds of mono PCM and twelve audio windows. Image decompression and resized allocations are bounded. One HTTP worker and two CPU threads per runtime bound concurrency. Header and body reads share an absolute ten-second budget, including slow clients. A twenty-second inference budget is checked between frames and windows; a single native inference call cannot be interrupted. The Node API also enforces its shared video deadline and propagates cancellation to HTTP and FFmpeg. No upload is written by this Python service.

Run `python -m unittest -v test_server.py`. Functional synthetic fixtures establish that inference and integration work; they do not measure real-world precision. Before definitive labels, evaluate paired real/synthetic speech, authentic/generated images, social-network recompression, all required languages and negative controls. Calibrate thresholds on held-out data. Purchase and quota policy remains in the Node API.

## Third-party notices

The vendored `vendor/AASIST.py` is Copyright (c) 2021-present NAVER Corp., MIT. Its complete licence is preserved in `vendor/LICENSE`. The checkpoint is distributed by the same upstream repository under its declared MIT licence. [Upstream source and checkpoint](https://github.com/clovaai/aasist/tree/a04c9863f63d44471dde8a6abcb3b082b07cd1d1).

The existing ONNX model is independently published by Thermostatic under MIT, based on OwensLab Community Forensics. It is an image classifier. [Model card, preprocessing, licence and limitations](https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08). The server verifies SHA-256 `d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d`.


## Detailed narrative translation

The same local service optionally hosts /translate using a pinned Nextcloud-AI CTranslate2 int8 conversion of Google MADLAD-400. The Apache-2.0 model and four verified artifacts stay outside Git; the license is included in vendor/MADLAD-LICENSE. This is a translation stage for generated assessment reasons and explanations, not a second fraud classifier. Classification, scores, original evidence and single-operation accounting are unchanged. Missing translation is an error, not a generic-summary fallback.

After installing requirements.txt, prepare the public model and start with --translation-model:

    python prepare_translation_model.py --model-dir ../../local-validation/work/local-translation/models/madlad400-3b-int8
    python server.py --image-model ../../app/assets/models/community_forensics_frontier_fp16.onnx --audio-model ./models/AASIST.pth --translation-model ../../local-validation/work/local-translation/models/madlad400-3b-int8

The health response advertises translationAvailable. Model retrieval occurs only during explicit setup; inference stays offline. Bounds, sentence context, exact literal restoration, deadlines and immutable machine-readable assessment fields are covered by test_translation_engine.py and the Node narrative tests. Local operation remains experimental rather than calibrated proof of authenticity or fraud.
