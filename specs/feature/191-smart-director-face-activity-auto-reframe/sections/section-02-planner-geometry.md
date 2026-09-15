# Section 02 — planner geometry

Implement the planner in the shared package. Inputs are source-time tracks,
activity intervals, Marks, output aspect profile, and policy. Produce a
bounded plan that keeps the subject inside a feasible crop window, smooths
motion, holds through short occlusions, reacquires conservatively, and gives
explicit Mark points precedence. Mark and source coordinates use normalized
top-left source-frame semantics; trim mapping is applied only at evaluation.

Proof: property-style tests assert finite values, monotonic keyframe times,
feasible crop bounds, deterministic output, and no Mark regression.

Status: IMPLEMENTED locally with bounded crop geometry, activity weighting,
smoothing, and Mark precedence.
