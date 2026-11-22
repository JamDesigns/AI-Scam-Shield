"""Offline narrative translation. Classifications, scores and original evidence never enter this module."""
import re
import time
import os
from collections import Counter
from pathlib import Path
from prepare_translation_model import verify_model

LANGUAGES = frozenset("bg hr cs da nl en et fi fr de el hu ga it lv lt mt pl pt ro sk sl es sv ca".split())
PROVIDER = "madlad400-3b-ct2-int8"
MAX_TEXTS, MAX_CHARACTERS, MAX_SEGMENTS = 16, 6000, 48
# Copy sensitive literals exactly. Translating adjacent prose cannot change a URL,
# number or a model-control token quoted by the analyst.
LITERAL = re.compile(r"https?://[^\s<>\"\[\]()]+|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|<[^<>\r\n]{1,80}>|ZXQPH\d+QXZ|(?<!\w)\d+(?:[.,]\d+)*(?:\s*%)?")
SENTENCE = re.compile(r"(?<=[.!?])(?=\s+[A-Z])")


def prepare_parts(text):
    parts = []
    for segment in SENTENCE.split(text):
        stripped = segment.strip()
        if not stripped:
            parts.append((False, segment))
            continue
        leading = segment[:len(segment) - len(segment.lstrip())]
        trailing = segment[len(segment.rstrip()):]
        if leading:
            parts.append((False, leading))
        parts.append((any(char.isalpha() for char in LITERAL.sub("", stripped)), stripped))
        if trailing:
            parts.append((False, trailing))
    return parts


def mask_literals(text):
    values = []
    def replace(match):
        raw = match.group()
        value = raw.rstrip(".,;:!?") if raw.startswith(("https://", "http://")) else raw
        marker = f"ZXQPH{len(values)}QXZ"
        values.append(value)
        return marker + raw[len(value):]
    return LITERAL.sub(replace, text), values


def restore_literals(text, values, source):
    seen = set()
    def replace(match):
        index = int(match.group(1))
        if index >= len(values) or index in seen:
            raise ValueError("Invalid translation literal marker")
        seen.add(index)
        return values[index]
    result = re.sub(r"ZXQPH\s*(\d+)\s*QXZ", replace, text, flags=re.IGNORECASE)
    if len(seen) != len(values):
        raise ValueError("Translation omitted a protected literal")
    def literals(value):
        return Counter(match.group().rstrip(".,;:!?") if match.group().startswith(("https://", "http://")) else match.group() for match in LITERAL.finditer(value))
    if literals(source) != literals(result):
        raise ValueError("Translation changed or invented a literal")
    return result


class TranslationEngine:
    def __init__(self, model_directory):
        # Avoid an additional packed-weight copy on constrained development PCs.
        # This is the documented CTranslate2 CPU switch, not a precision change.
        os.environ.setdefault("CT2_PACKED_GEMM", "0")
        import ctranslate2
        import sentencepiece
        verify_model(model_directory)
        self.tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(Path(model_directory) / "spiece.model"))
        self.translator = ctranslate2.Translator(str(model_directory), device="cpu", compute_type="int8", inter_threads=1, intra_threads=4)

    def translate(self, request, deadline=None):
        if not isinstance(request, dict) or set(request) != {"sourceLanguage", "targetLanguage", "texts"}:
            raise ValueError("Invalid translation request")
        target, texts = request["targetLanguage"], request["texts"]
        if request["sourceLanguage"] != "en" or not isinstance(target, str) or target not in LANGUAGES:
            raise ValueError("Unsupported translation language")
        if not isinstance(texts, list) or not 1 <= len(texts) <= MAX_TEXTS or any(not isinstance(text, str) or not text.strip() for text in texts):
            raise ValueError("Invalid translation texts")
        if sum(len(text) for text in texts) > MAX_CHARACTERS:
            raise ValueError("Translation input exceeds bounds")
        if target == "en":
            return {"provider": PROVIDER, "targetLanguage": target, "texts": texts}
        deadline = min(deadline or float("inf"), time.monotonic() + 45)
        parts = [prepare_parts(text) for text in texts]
        sources = [text for row in parts for translatable, text in row if translatable]
        if len(sources) > MAX_SEGMENTS:
            raise ValueError("Too many translation segments")
        masked = [mask_literals(text) for text in sources]
        tokens = [self.tokenizer.encode(f"<2{target}> {text}", out_type=str) + ["</s>"] for text, _ in masked]
        if any(len(row) > 512 for row in tokens):
            raise ValueError("Translation sentence exceeds token bounds")
        translated = []
        for start in range(0, len(tokens), 6):
            if time.monotonic() >= deadline:
                raise TimeoutError("Translation deadline exceeded")
            output = self.translator.translate_batch(tokens[start:start + 6], beam_size=2, max_input_length=0,
                max_decoding_length=256, return_end_token=True, return_scores=False)
            for item in output:
                hypothesis = item.hypotheses[0]
                if not hypothesis or hypothesis[-1] != "</s>" or "<unk>" in hypothesis:
                    raise ValueError("Incomplete translation")
                text = self.tokenizer.decode([token for token in hypothesis[:-1] if token != "<pad>"]).strip()
                if not text or len(text) > 4000:
                    raise ValueError("Invalid translated sentence")
                index = len(translated)
                translated.append(restore_literals(text, masked[index][1], sources[index]))
        if time.monotonic() >= deadline:
            raise TimeoutError("Translation deadline exceeded")
        iterator = iter(translated)
        result = ["".join(next(iterator) if translate else text for translate, text in row) for row in parts]
        return {"provider": PROVIDER, "targetLanguage": target, "texts": result}
