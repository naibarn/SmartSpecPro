import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UISchemaCompletenessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.input_schema = json.loads((ROOT / "schemas" / "input.schema.json").read_text(encoding="utf-8"))
        cls.ui_schema = json.loads((ROOT / "schemas" / "ui.schema.json").read_text(encoding="utf-8"))
        cls.fields = [field for section in cls.ui_schema["sections"] for field in section.get("fields", [])]
        cls.fields_by_id = {field["id"]: field for field in cls.fields}

    def test_all_ui_fields_are_mapped_and_documented(self):
        mapped = set(self.ui_schema["outputMapping"])
        field_ids = set(self.fields_by_id)
        self.assertFalse(field_ids - mapped)
        self.assertFalse(mapped - field_ids)

        for field in self.fields:
            self.assertIn("helpText", field, field["id"])
            self.assertIn("helpTextTh", field, field["id"])
            self.assertTrue(str(field["helpText"]).strip(), field["id"])
            self.assertTrue(str(field["helpTextTh"]).strip(), field["id"])
            if field.get("type") in {"text", "textarea"}:
                self.assertIn("placeholder", field, field["id"])
                self.assertIn("placeholderTh", field, field["id"])

    def test_enum_input_fields_are_exposed_as_complete_options(self):
        for field_id, spec in self.input_schema["properties"].items():
            if "enum" not in spec:
                continue
            self.assertIn(field_id, self.fields_by_id, field_id)
            ui_field = self.fields_by_id[field_id]
            self.assertEqual(ui_field.get("type"), "select", field_id)
            ui_values = [option["value"] for option in ui_field.get("options", [])]
            self.assertEqual(set(ui_values), set(spec["enum"]), field_id)
            for option in ui_field["options"]:
                self.assertTrue(option.get("label"), f"{field_id}.{option['value']}")
                self.assertTrue(option.get("labelTh"), f"{field_id}.{option['value']}")

    def test_multiline_array_fields_are_present_for_adapter_normalization(self):
        for field_id in ["panel_descriptions", "verified_reference_facts", "reference_sources"]:
            self.assertIn(field_id, self.fields_by_id)
            self.assertEqual(self.fields_by_id[field_id]["type"], "textarea")
            self.assertIn(field_id, self.ui_schema["outputMapping"])


if __name__ == "__main__":
    unittest.main()
