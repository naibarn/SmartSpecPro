from __future__ import annotations
from dataclasses import dataclass
from typing import List
from rich.console import Console
from rich.prompt import Prompt

console = Console()

@dataclass(frozen=True)
class ChoiceQuestion:
    question: str
    choices: List[str]  # 2-5 options
    allow_other: bool = True

def ask_choice(q: ChoiceQuestion) -> str:
    opts = list(q.choices)
    if q.allow_other:
        opts.append("other")
    console.print(f"\n[bold]{q.question}[/bold]")
    for i, c in enumerate(opts, 1):
        console.print(f"  {i}) {c}")
    while True:
        ans = Prompt.ask("Select option number", default="1")
        if not ans.isdigit():
            console.print("[red]Please enter a number.[/red]")
            continue
        idx = int(ans)
        if idx < 1 or idx > len(opts):
            console.print("[red]Out of range.[/red]")
            continue
        choice = opts[idx-1]
        if choice == "other":
            detail = Prompt.ask("Please specify details for 'other' (required)").strip()
            if not detail:
                console.print("[red]Details required for 'other'.[/red]")
                continue
            return detail
        return choice
