export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionCandidate extends SelectionBounds {
  id: string;
}

export interface SelectionState {
  selectedIds: string[];
  activeId: string | null;
}

export interface SelectionOptions {
  additive?: boolean;
}

function overlaps(a: SelectionBounds, b: SelectionBounds): boolean {
  return (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
}

export class SelectionEngine {
  static empty(): SelectionState {
    return {
      selectedIds: [],
      activeId: null,
    };
  }

  static single(id: string): SelectionState {
    return {
      selectedIds: [id],
      activeId: id,
    };
  }

  static toggle(state: SelectionState, id: string): SelectionState {
    const next = new Set(state.selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    const selectedIds = Array.from(next);
    return {
      selectedIds,
      activeId: selectedIds.includes(id)
        ? id
        : selectedIds[selectedIds.length - 1] ?? null,
    };
  }

  static marquee(
    state: SelectionState,
    bounds: SelectionBounds,
    candidates: SelectionCandidate[],
    options?: SelectionOptions,
  ): SelectionState {
    const selectedByMarquee = candidates
      .filter((candidate) => overlaps(bounds, candidate))
      .map((candidate) => candidate.id);

    if (!options?.additive) {
      return {
        selectedIds: selectedByMarquee,
        activeId: selectedByMarquee[selectedByMarquee.length - 1] ?? null,
      };
    }

    const set = new Set(state.selectedIds);
    for (const id of selectedByMarquee) {
      set.add(id);
    }

    const selectedIds = Array.from(set);
    return {
      selectedIds,
      activeId: selectedByMarquee[selectedByMarquee.length - 1]
        ?? state.activeId
        ?? selectedIds[selectedIds.length - 1]
        ?? null,
    };
  }
}
