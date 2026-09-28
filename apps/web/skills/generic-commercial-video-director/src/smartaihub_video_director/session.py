from __future__ import annotations
import hashlib
from typing import Any
from .ports import SessionStore
class CoreBackedSession:
    def __init__(self, session_id:str, store:SessionStore):
        if not session_id.strip(): raise ValueError("session_id is required")
        self.session_id=session_id; self.store=store
    def _key(self, wrapper=None)->str:
        scope=self.session_id if wrapper is None else f"{wrapper.context.tenant_id}|{wrapper.context.project_id}|{wrapper.context.run_id}|{self.session_id}"
        return "saihub-agent-session:"+hashlib.sha256(scope.encode()).hexdigest()
    async def get_items(self, limit:int|None=None, *, wrapper=None): return await self.store.get_items(self._key(wrapper),limit=limit)
    async def add_items(self, items:list[dict[str,Any]], *, wrapper=None): await self.store.add_items(self._key(wrapper),items)
    async def pop_item(self, *, wrapper=None): return await self.store.pop_item(self._key(wrapper))
    async def clear_session(self, *, wrapper=None): await self.store.clear(self._key(wrapper))
