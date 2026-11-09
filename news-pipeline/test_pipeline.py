"""Tests for the pure parts of the news pipeline. No network, no Ollama.

Run from news-pipeline/:  python3 -m unittest test_pipeline
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import common
import geopolitical
import ingest
from cluster import build_clusters, tokenize


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
