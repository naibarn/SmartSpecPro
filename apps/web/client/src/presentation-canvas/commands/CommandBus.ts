export interface CanvasCommand<State> {
  id: string;
  apply: (state: State) => State;
}

export class CommandBus<State> {
  private state: State;
  private undoStack: State[];
  private redoStack: State[];
  /** ID of the currently-open merge group. null = no active merge. */
  private activeMergeId: string | null = null;

  constructor(initialState: State) {
    this.state = initialState;
    this.undoStack = [];
    this.redoStack = [];
  }

  getState(): State {
    return this.state;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Normal discrete execute — always creates a new undo entry and breaks any open merge group. */
  execute(command: CanvasCommand<State>): State {
    this.activeMergeId = null;
    const next = command.apply(this.state);
    this.undoStack.push(this.state);
    this.state = next;
    this.redoStack = [];
    return this.state;
  }

  /**
   * Continuous (drag) execute — the first call in a group pushes one undo entry;
   * subsequent calls with the same command.id reuse that entry so the entire
   * gesture undoes in a single step.  Call breakMerge() on pointer-up.
   */
  executeAndMerge(command: CanvasCommand<State>): State {
    if (command.id !== this.activeMergeId) {
      // First call in this merge group — push the pre-gesture state
      this.undoStack.push(this.state);
      this.activeMergeId = command.id;
    }
    // Subsequent calls: just update state without pushing
    const next = command.apply(this.state);
    this.state = next;
    this.redoStack = [];
    return this.state;
  }

  /** Call on pointer-up / gesture end to close the merge group. */
  breakMerge(): void {
    this.activeMergeId = null;
  }

  undo(): State {
    this.activeMergeId = null;
    if (!this.canUndo()) {
      return this.state;
    }

    const previous = this.undoStack.pop() as State;
    this.redoStack.push(this.state);
    this.state = previous;
    return this.state;
  }

  redo(): State {
    this.activeMergeId = null;
    if (!this.canRedo()) {
      return this.state;
    }

    const next = this.redoStack.pop() as State;
    this.undoStack.push(this.state);
    this.state = next;
    return this.state;
  }

  reset(nextState: State): State {
    this.activeMergeId = null;
    this.state = nextState;
    this.undoStack = [];
    this.redoStack = [];
    return this.state;
  }
}
