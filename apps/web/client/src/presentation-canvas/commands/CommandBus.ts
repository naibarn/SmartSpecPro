export interface CanvasCommand<State> {
  id: string;
  apply: (state: State) => State;
}

export class CommandBus<State> {
  private state: State;
  private undoStack: State[];
  private redoStack: State[];

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

  execute(command: CanvasCommand<State>): State {
    const next = command.apply(this.state);
    this.undoStack.push(this.state);
    this.state = next;
    this.redoStack = [];
    return this.state;
  }

  undo(): State {
    if (!this.canUndo()) {
      return this.state;
    }

    const previous = this.undoStack.pop() as State;
    this.redoStack.push(this.state);
    this.state = previous;
    return this.state;
  }

  redo(): State {
    if (!this.canRedo()) {
      return this.state;
    }

    const next = this.redoStack.pop() as State;
    this.undoStack.push(this.state);
    this.state = next;
    return this.state;
  }

  reset(nextState: State): State {
    this.state = nextState;
    this.undoStack = [];
    this.redoStack = [];
    return this.state;
  }
}
