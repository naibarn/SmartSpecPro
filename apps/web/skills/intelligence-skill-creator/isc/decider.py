from __future__ import annotations
from dataclasses import dataclass
from typing import List

try:
    from rich.console import Console
    from rich.prompt import Prompt
    _RICH_AVAILABLE = True
    console = Console()
except Exception:  # pragma: no cover - fallback for minimal runtime images
    _RICH_AVAILABLE = False
    console = None

    class Prompt:  # type: ignore[override]
        @staticmethod
        def ask(prompt_text: str, default: str | None = None) -> str:
            suffix = f" [{default}]" if default is not None else ""
            value = input(f"{prompt_text}{suffix}: ").strip()
            return value or (default or "")

    def _print(message: str) -> None:
        print(message)

else:
    def _print(message: str) -> None:
        console.print(message)

@dataclass(frozen=True)
class ChoiceQuestion:
    question: str
    choices: List[str]  # 2-5 options
    allow_other: bool = True

def ask_choice(q: ChoiceQuestion) -> str:
    opts = list(q.choices)
    if q.allow_other:
        opts.append("other")
    _print(f"\n{q.question}")
    for i, c in enumerate(opts, 1):
        _print(f"  {i}) {c}")
    while True:
        ans = Prompt.ask("Select option number", default="1")
        if not ans.isdigit():
            _print("Please enter a number.")
            continue
        idx = int(ans)
        if idx < 1 or idx > len(opts):
            _print("Out of range.")
            continue
        choice = opts[idx-1]
        if choice == "other":
            detail = Prompt.ask("Please specify details for 'other' (required)").strip()
            if not detail:
                _print("Details required for 'other'.")
                continue
            return detail
        return choice
