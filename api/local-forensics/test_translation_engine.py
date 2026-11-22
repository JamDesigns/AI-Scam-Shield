import hashlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from prepare_translation_model import valid_file
from translation_engine import LANGUAGES, TranslationEngine, prepare_parts, mask_literals, restore_literals


class Tokenizer:
    def encode(self, text, out_type=str):
        return [text]

    def decode(self, pieces):
        return "".join(pieces)


class Translator:
    def __init__(self):
        self.sources = []

    def translate_batch(self, tokens, **options):
        self.sources.extend(tokens)
        return [SimpleNamespace(hypotheses=[["TR(" + row[0].split("> ", 1)[1] + ")", "</s>"]]) for row in tokens]


def engine():
    value = TranslationEngine.__new__(TranslationEngine)
    value.tokenizer, value.translator = Tokenizer(), Translator()
    return value


class TranslationTests(unittest.TestCase):
    def test_all_twenty_five_application_languages_are_allowlisted(self):
        self.assertEqual(len(LANGUAGES), 25)
        self.assertTrue({"ga", "mt", "ca", "en", "bg", "el"} <= LANGUAGES)

    def test_sentence_order_and_literals_are_preserved(self):
        value = engine()
        text = "Do not send code 123456 to https://evil.example. Contact the bank."
        result = value.translate({"sourceLanguage": "en", "targetLanguage": "mt", "texts": [text]})
        self.assertIn("123456", result["texts"][0])
        self.assertIn("https://evil.example.", result["texts"][0])
        self.assertIn("TR(Contact the bank.)", result["texts"][0])
        self.assertTrue(all("123456" not in row[0] and "https://" not in row[0] for row in value.translator.sources))
        self.assertTrue(all(row[0].startswith("<2mt> ") for row in value.translator.sources))

    def test_model_control_tokens_cannot_change_the_requested_language(self):
        value = engine()
        result = value.translate({"sourceLanguage": "en", "targetLanguage": "ga", "texts": ["A quoted <2fr> token is evidence."]})
        self.assertIn("<2fr>", result["texts"][0])
        self.assertTrue(all("<2fr>" not in row[0] for row in value.translator.sources))

    def test_sentence_segmentation_does_not_lose_whitespace(self):
        text = "First sentence. Second sentence! Third sentence?"
        self.assertEqual("".join(value for _, value in prepare_parts(text)), text)
        self.assertEqual(sum(1 for flag, _ in prepare_parts(text) if flag), 3)

    def test_literals_are_masked_without_losing_the_sentence_context(self):
        source = "Never send code 123456 to https://evil.example."
        masked, values = mask_literals(source)
        self.assertEqual(masked, "Never send code ZXQPH0QXZ to ZXQPH1QXZ.")
        self.assertEqual(restore_literals(masked, values, source), source)
        self.assertEqual(restore_literals(masked.replace("ZXQPH", "zxqph"), values, source), source)

    def test_missing_or_invented_numbers_are_never_silently_accepted(self):
        source = "Do not send code 123456."
        masked, values = mask_literals(source)
        with self.assertRaises(ValueError):
            restore_literals("Do not send the code.", values, source)
        with self.assertRaises(ValueError):
            restore_literals(masked + " 100 mg", values, source)

    def test_english_bypasses_inference_and_returns_every_original_string(self):
        value = engine()
        text = "Original English details."
        self.assertEqual(value.translate({"sourceLanguage": "en", "targetLanguage": "en", "texts": [text]})["texts"], [text])
        self.assertFalse(value.translator.sources)

    def test_rejects_unsupported_languages_and_unbounded_inputs(self):
        for request in [
            {"sourceLanguage": "es", "targetLanguage": "ga", "texts": ["Text"]},
            {"sourceLanguage": "en", "targetLanguage": "xx", "texts": ["Text"]},
            {"sourceLanguage": "en", "targetLanguage": [], "texts": ["Text"]},
            {"sourceLanguage": "en", "targetLanguage": "ga", "texts": []},
            {"sourceLanguage": "en", "targetLanguage": "ga", "texts": [" "]},
            {"sourceLanguage": "en", "targetLanguage": "ga", "texts": ["x" * 6001]},
            {"sourceLanguage": "en", "targetLanguage": "ga", "texts": ["x"] * 17},
        ]:
            with self.subTest(request=request), self.assertRaises(ValueError):
                engine().translate(request)

    def test_truncated_output_and_expired_deadlines_are_errors(self):
        value = engine()
        value.translator = Mock()
        value.translator.translate_batch.return_value = [SimpleNamespace(hypotheses=[["Incomplete"]])]
        with self.assertRaises(ValueError):
            value.translate({"sourceLanguage": "en", "targetLanguage": "ga", "texts": ["Details"]})
        with patch("translation_engine.time.monotonic", side_effect=[0, 0, 46]), self.assertRaises(TimeoutError):
            engine().translate({"sourceLanguage": "en", "targetLanguage": "ga", "texts": ["Details"]}, deadline=50)

    def test_model_checksum_and_length_must_both_match(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "weights"
            file.write_bytes(b"fixture")
            digest = hashlib.sha256(b"fixture").hexdigest()
            self.assertTrue(valid_file(file, 7, digest))
            self.assertFalse(valid_file(file, 8, digest))
            self.assertFalse(valid_file(file, 7, "0" * 64))


if __name__ == "__main__":
    unittest.main()
