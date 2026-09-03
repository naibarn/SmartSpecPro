from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from .config import AgentRuntimeConfig
from .ports import CoreGateway
@dataclass(slots=True)
class DirectorRunContext:
    tenant_id:str; project_id:str; run_id:str; actor_id:str; workflow_version:str; core:CoreGateway
    config:AgentRuntimeConfig=field(default_factory=AgentRuntimeConfig)
    trace_id:str|None=None; group_id:str|None=None; current_stage:str|None=None
    project_snapshot:dict[str,Any]=field(default_factory=dict); stage_outputs:dict[str,dict[str,Any]]=field(default_factory=dict)
    agent_total_tokens_used:int=0; repair_count_by_shot:dict[str,int]=field(default_factory=dict); checkpoint_hydrated:bool=False
    def validate_scope(self)->None:
        for label,value in (("tenant_id",self.tenant_id),("project_id",self.project_id),("run_id",self.run_id),("actor_id",self.actor_id)):
            if not value or not value.strip(): raise ValueError(f"{label} is required for tenant-safe Agent execution.")
