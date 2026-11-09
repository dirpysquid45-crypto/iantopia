"""Tests for the pure parts of the news pipeline. No network, no Ollama.

Run from news-pipeline/:  python3 -m unittest test_pipeline
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import common
import digest
import guards
import geopolitical
import ingest
from cluster import build_clusters, tokenize


class DigestNumbers(unittest.TestCase):
    def test_figure_from_the_headlines_is_allowed(self):
        self.assertEqual(digest.unsupported_numbers("16 people died", "Turkey blast kills at least 16 people"), [])

    def test_invented_figure_is_flagged(self):
        self.assertEqual(digest.unsupported_numbers("Pew counts 2.5 million", "Pew Research on midterm polls"), ["2.5"])


class ClassifyRegion(unittest.TestCase):
    def test_keyword_matches_a_whole_word(self):
        self.assertEqual(geopolitical.classify_region("Xi Jinping meets envoys"), "East Asia & China")

    def test_short_keyword_inside_another_word_does_not_match(self):
        # 'xi' is a substring of 'exit'; 'eu' of 'feud'. Neither should classify.
        self.assertIsNone(geopolitical.classify_region("Exit talks feud over the budget"))

    def test_summary_is_searched_too(self):
        self.assertEqual(geopolitical.classify_region("Talks resume", "NATO allies meet"), "Europe")

    def test_unrelated_story_is_unclassified(self):
        self.assertIsNone(geopolitical.classify_region("Local bakery wins award"))


class Clustering(unittest.TestCase):
    def test_same_story_from_two_outlets_clusters(self):
        items = [
            {"title": "Ceasefire talks resume in Cairo", "source": "BBC News", "category": "news"},
            {"title": "Cairo ceasefire talks resume after delay", "source": "NPR", "category": "news"},
        ]
        clusters, unclustered = build_clusters(items)
        self.assertEqual(len(clusters), 1)
        self.assertEqual(unclustered, [])

    def test_same_outlet_twice_does_not_cluster(self):
        items = [
            {"title": "Ceasefire talks resume in Cairo", "source": "BBC News", "category": "news"},
            {"title": "Cairo ceasefire talks resume after delay", "source": "BBC News", "category": "news"},
        ]
        clusters, unclustered = build_clusters(items)
        self.assertEqual(clusters, [])
        self.assertEqual(len(unclustered), 2)

    def test_tokenize_drops_stopwords_and_short_words(self):
        self.assertEqual(tokenize("The war is on in Ukraine"), {"war", "ukraine"})


class IngestText(unittest.TestCase):
    def test_clean_text_strips_tags_and_unescapes(self):
        self.assertEqual(ingest.clean_text("<p>Tom &amp; Jerry</p>"), "Tom & Jerry")

    def test_clean_text_handles_missing(self):
        self.assertEqual(ingest.clean_text(None), "")


class WriteJson(unittest.TestCase):
    def test_empty_run_keeps_last_good_file(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(common, "OUTPUT_DIR", Path(tmp)):
            common.write_json("x.json", {"items": [1, 2]}, keep_if_empty=("items",))
            common.write_json("x.json", {"items": []}, keep_if_empty=("items",))
            self.assertEqual(json.loads((Path(tmp) / "x.json").read_text()), {"items": [1, 2]})

    def test_good_run_replaces_file(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(common, "OUTPUT_DIR", Path(tmp)):
            common.write_json("x.json", {"items": [1]}, keep_if_empty=("items",))
            common.write_json("x.json", {"items": [2, 3]}, keep_if_empty=("items",))
            self.assertEqual(json.loads((Path(tmp) / "x.json").read_text()), {"items": [2, 3]})


if __name__ == "__main__":
    unittest.main()


CONTEXT = """STORIES COVERED BY MULTIPLE OUTLETS TODAY:
- Iran nuclear talks resume
  [BBC News] Iran and envoys resume nuclear talks in Geneva: "we are close to a deal" says minister Araghchi: 40 delegates.
  [NPR] Envoys meet in Geneva as talks resume.
OTHER HEADLINES TODAY:
- [Al Jazeera] Gaza aid convoy halted at border.
"""
KNOWN = ["BBC News", "NPR", "Al Jazeera", "Wall Street Journal", "Reuters"]


class Guards(unittest.TestCase):
    def test_a_correct_digest_passes(self):
        text = "BBC News reports Iran and envoys resume nuclear talks in Geneva. NPR notes envoys met there."
        self.assertEqual(guards.check_digest(text, CONTEXT, KNOWN, digest.unsupported_numbers), [])

    def test_an_outlet_that_did_not_report_the_story_is_flagged(self):
        text = "Reuters reports Iran and envoys resume nuclear talks in Geneva."
        problems = guards.check_digest(text, CONTEXT, KNOWN, digest.unsupported_numbers)
        self.assertTrue(any("Reuters" in p for p in problems))

    def test_an_invented_quote_is_flagged(self):
        text = "BBC News reports Iran says \"the deal is done\" in Geneva."
        self.assertEqual(guards.unsupported_quotes(text, CONTEXT), ["the deal is done"])

    def test_a_real_quote_is_allowed(self):
        text = "BBC News reports \"we are close to a deal\" in Geneva."
        self.assertEqual(guards.unsupported_quotes(text, CONTEXT), [])

    def test_a_name_not_in_the_headlines_is_flagged(self):
        text = "BBC News reports Iran and envoys resume talks. Minister Zarif joined them."
        self.assertIn("Zarif", guards.unsupported_names(text, CONTEXT))

    def test_a_name_from_the_headlines_is_allowed(self):
        text = "BBC News reports the minister Araghchi spoke in Geneva."
        self.assertEqual(guards.unsupported_names(text, CONTEXT), [])

    def test_a_sentence_opening_word_is_not_a_name(self):
        text = "Envoys met in Geneva. Talks continue."
        self.assertEqual(guards.unsupported_names(text, CONTEXT), [])

    def test_markdown_is_flagged(self):
        problems = guards.check_digest("## Today\n- item", CONTEXT, KNOWN, digest.unsupported_numbers)
        self.assertTrue(any("formatting" in p for p in problems))

    def test_a_bad_digest_falls_back_to_the_headlines(self):
        clusters = {"clusters": [{"title": "Iran", "items": [
            {"source": "BBC News", "title": "Iran and envoys resume talks"}]}],
            "unclustered": [{"source": "Al Jazeera", "title": "Gaza aid halted"}]}
        out = guards.headline_fallback(clusters, {})
        self.assertIn("BBC News: Iran and envoys resume talks.", out)
        self.assertIn("Al Jazeera: Gaza aid halted.", out)
        self.assertNotIn("Reuters", out)


class Pairings(unittest.TestCase):
    def test_outlet_credited_with_its_own_story_passes(self):
        text = "BBC News reports Iran and envoys resume nuclear talks in Geneva."
        self.assertEqual(guards.unsupported_pairings(text, CONTEXT, KNOWN), [])

    def test_outlet_credited_with_someone_elses_story_is_flagged(self):
        text = "BBC News reports Russia threatens new sanctions on Japan."
        self.assertEqual(len(guards.unsupported_pairings(text, CONTEXT, KNOWN)), 1)
