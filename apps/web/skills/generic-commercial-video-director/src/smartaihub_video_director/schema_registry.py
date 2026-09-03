from __future__ import annotations
from pathlib import Path
import json
from jsonschema import Draft202012Validator
from .errors import StageContractError

STAGE_SCHEMA_FILES={
"promotion_target":"promotion-target.schema.json","cast_resolution":"cast-resolution.schema.json","research_summary":"research-summary.schema.json",
"product_mechanism":"product-mechanism.schema.json","place_experience":"place-experience.schema.json","target_experience":"experience-model.schema.json",
"expanded_intent":"expanded-intent.schema.json","concept":"concept.schema.json","script":"script.schema.json","breakdown":"breakdown.schema.json",
"sequence_plan":"sequence-plan.schema.json","observed_start_state":"observed-start-state.schema.json","visualization_plan":"visualization-plan.schema.json",
"shot_plan":"shot-plan.schema.json","dialogue_map":"dialogue-map.schema.json","continuity_plan":"continuity-plan.schema.json","storyboard":"storyboard.schema.json",
"generation_strategy":"generation-strategy.schema.json","prompt_intent":"prompt-intent.schema.json","qc_report":"qc-report.schema.json","repair_plan":"repair-plan.schema.json"}

class StageContractRegistry:
    def __init__(self, package_root:str|Path):
        self.root=Path(package_root); self._schemas={}
        input_schema=json.loads((self.root/'schemas/input.schema.json').read_text(encoding='utf-8'))
        Draft202012Validator.check_schema(input_schema); self._input_schema=input_schema
        for stage,fn in STAGE_SCHEMA_FILES.items():
            path=self.root/'schemas/stages'/fn
            schema=json.loads(path.read_text(encoding='utf-8')); Draft202012Validator.check_schema(schema); self._schemas[stage]=schema
    def stages(self): return tuple(self._schemas)
    def schema_id(self, stage:str)->str:
        if stage not in self._schemas: raise StageContractError(f"Unknown stage {stage!r}")
        return self._schemas[stage]['$id']
    def required_fields(self, stage:str)->tuple[str,...]:
        if stage not in self._schemas: raise StageContractError(f"Unknown stage {stage!r}")
        required=self._schemas[stage].get('required') or []
        return tuple(str(field) for field in required)
    def validate(self, stage:str, payload:dict)->None:
        if stage not in self._schemas: raise StageContractError(f"Unknown stage {stage!r}")
        errors=sorted(Draft202012Validator(self._schemas[stage]).iter_errors(payload), key=lambda e:list(e.path))
        if errors:
            e=errors[0]; path='.'.join(str(x) for x in e.path) or '<root>'; raise StageContractError(f"{stage} payload invalid at {path}: {e.message}")
    def validate_input(self, payload:dict)->None:
        errors=sorted(Draft202012Validator(self._input_schema).iter_errors(payload), key=lambda e:list(e.path))
        if errors:
            e=errors[0]; path='.'.join(str(x) for x in e.path) or '<root>'; raise StageContractError(f"input payload invalid at {path}: {e.message}")
