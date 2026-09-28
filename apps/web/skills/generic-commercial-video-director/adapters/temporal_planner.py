from __future__ import annotations
from dataclasses import dataclass
from math import ceil
from typing import Iterable

@dataclass(frozen=True)
class DurationPlan:
    exact: bool
    base_seconds: float
    extension_seconds: tuple[float, ...]
    total_seconds: float
    reason: str


def _quantize(value: float, step: float | None) -> float:
    if not step: return value
    return round(value / step) * step


def plan_extension_chain(*, base_seconds: float, target_total_seconds: float,
                         min_additional_seconds: float, max_additional_seconds: float,
                         max_cumulative_seconds: float,
                         allowed_additional_seconds: Iterable[float] | None = None,
                         step_seconds: float | None = 1.0,
                         prefer_minimum_turns: bool = True) -> DurationPlan:
    if base_seconds <= 0: raise ValueError('base_seconds must be positive')
    target = min(target_total_seconds, max_cumulative_seconds)
    if target < base_seconds:
        return DurationPlan(False, base_seconds, (), base_seconds, 'Target is shorter than the generated base clip; trim/edit instead of extend.')
    remainder = target - base_seconds
    if abs(remainder) < 1e-9:
        return DurationPlan(True, base_seconds, (), base_seconds, 'Base duration already matches target.')

    if allowed_additional_seconds:
        allowed = sorted(set(float(x) for x in allowed_additional_seconds))
        # Dynamic programming in quantized integer units.
        step = step_seconds or 1.0
        tgt = int(round(remainder / step))
        vals = [int(round(x / step)) for x in allowed]
        dp = {0: []}
        for total in range(tgt + 1):
            if total not in dp: continue
            for v, raw in zip(vals, allowed):
                nt = total + v
                if nt <= tgt and (nt not in dp or len(dp[nt]) > len(dp[total]) + 1):
                    dp[nt] = dp[total] + [raw]
        if tgt in dp:
            exts = tuple(dp[tgt])
            return DurationPlan(True, base_seconds, exts, base_seconds + sum(exts), 'Exact target reachable with provider-allowed extension durations.')
        nearest = max(dp)
        exts = tuple(dp[nearest])
        return DurationPlan(False, base_seconds, exts, base_seconds + sum(exts), 'Exact target is not reachable with the provider allowed extension durations.')

    min_s, max_s = float(min_additional_seconds), float(max_additional_seconds)
    min_turns = max(1, ceil(remainder / max_s))
    max_turns = int(remainder // min_s) if min_s > 0 else min_turns
    turn_range = range(min_turns, max_turns + 1) if prefer_minimum_turns else range(max_turns, min_turns - 1, -1)
    for n in turn_range:
        if n * min_s - 1e-9 <= remainder <= n * max_s + 1e-9:
            # Balanced distribution reduces one tiny tail segment and usually gives cleaner narrative chunks.
            per = remainder / n
            vals = [_quantize(per, step_seconds) for _ in range(n)]
            diff = remainder - sum(vals)
            step = step_seconds or 0.001
            i = 0
            while abs(diff) >= step/2 and i < 1000:
                idx = i % n
                cand = vals[idx] + (step if diff > 0 else -step)
                if min_s <= cand <= max_s:
                    vals[idx] = cand
                    diff = remainder - sum(vals)
                i += 1
            if all(min_s - 1e-9 <= x <= max_s + 1e-9 for x in vals) and abs(sum(vals)-remainder) < max(step/2,1e-6):
                exts = tuple(vals)
                return DurationPlan(True, base_seconds, exts, base_seconds + sum(exts), 'Exact target reachable with bounded extension durations.')

    # fallback: maximize duration <= target with max-sized chunks
    n = min_turns
    exts=[]; rem=remainder
    while rem >= min_s - 1e-9:
        x=min(max_s,rem)
        if x < min_s: break
        x=_quantize(x,step_seconds)
        if x < min_s: break
        exts.append(x); rem-=x
    total=base_seconds+sum(exts)
    return DurationPlan(False,base_seconds,tuple(exts),total,'Exact target not reachable under extension min/max/step constraints; nearest non-exceeding duration returned.')


@dataclass(frozen=True)
class ReferenceContinuationSegment:
    index: int
    duration_seconds: float
    global_start: float
    global_end: float
    tail_seconds: float | None

@dataclass(frozen=True)
class ReferenceContinuationPlan:
    exact: bool
    target_total_seconds: float
    segments: tuple[ReferenceContinuationSegment, ...]
    total_seconds: float
    reason: str

def plan_reference_continuation_chain(*, target_total_seconds: float,
                                      min_segment_seconds: float = 4,
                                      max_segment_seconds: float = 15,
                                      preferred_segment_seconds: float = 15,
                                      step_seconds: float = 1,
                                      tail_seconds: float = 4) -> ReferenceContinuationPlan:
    """Plan H3-style long-form continuation as separate 4-15s clips.
    Segment N>0 receives a tail reference-video from segment N-1.
    """
    if target_total_seconds < min_segment_seconds:
        return ReferenceContinuationPlan(False,target_total_seconds,(),0,
            'Target is below provider minimum segment; generate minimum and trim or route.')
    if not 2 <= tail_seconds <= 15:
        raise ValueError('H3 reference-video tail must be 2-15 seconds.')
    if not min_segment_seconds <= preferred_segment_seconds <= max_segment_seconds:
        preferred_segment_seconds=max_segment_seconds

    rem=float(target_total_seconds)
    ds=[]
    while rem>1e-9:
        if min_segment_seconds <= rem <= max_segment_seconds:
            d=rem
        else:
            d=min(preferred_segment_seconds,max_segment_seconds,rem)
            # Avoid leaving an illegal tiny final segment.
            if 0 < rem-d < min_segment_seconds:
                d=rem-min_segment_seconds
            d=max(min_segment_seconds,min(max_segment_seconds,d))
        d=_quantize(d,step_seconds)
        if not min_segment_seconds <= d <= max_segment_seconds:
            break
        ds.append(d); rem-=d
        if len(ds)>100:
            break

    exact=abs(rem)<max(step_seconds/2,1e-9)
    t=0.0; segments=[]
    for i,d in enumerate(ds):
        segments.append(ReferenceContinuationSegment(
            index=i,duration_seconds=d,global_start=t,global_end=t+d,
            tail_seconds=None if i==0 else min(tail_seconds,ds[i-1])
        ))
        t+=d
    return ReferenceContinuationPlan(
        exact,target_total_seconds,tuple(segments),t,
        'Exact target partitioned into legal H3 4-15s segments.' if exact
        else 'Could not exactly partition target into legal H3 segments.'
    )


def plan_single_extension(*, base_seconds: float, target_total_seconds: float,
                          min_additional_seconds: float, max_additional_seconds: float,
                          source_input_min_seconds: float | None = None,
                          source_input_max_seconds: float | None = None,
                          step_seconds: float | None = 1.0) -> DurationPlan:
    """Plan a provider that allows only one append turn.

    This is required for workflows such as the current xAI `grok-imagine-video`
    extension endpoint: the source clip itself is bounded, so a generic multi-turn
    extension chain would be incorrect.
    """
    if base_seconds <= 0:
        raise ValueError('base_seconds must be positive')
    if source_input_min_seconds is not None and base_seconds < source_input_min_seconds:
        return DurationPlan(False, base_seconds, (), base_seconds, 'Source clip is shorter than the provider extension minimum input.')
    if source_input_max_seconds is not None and base_seconds > source_input_max_seconds:
        return DurationPlan(False, base_seconds, (), base_seconds, 'Source clip exceeds the provider extension maximum input.')

    remainder = target_total_seconds - base_seconds
    if remainder < 0:
        return DurationPlan(False, base_seconds, (), base_seconds, 'Target is shorter than source; trim/edit instead.')
    if abs(remainder) < 1e-9:
        return DurationPlan(True, base_seconds, (), base_seconds, 'Source duration already matches target.')

    if remainder < min_additional_seconds:
        return DurationPlan(False, base_seconds, (), base_seconds, 'Requested extension is shorter than provider minimum.')

    add = min(remainder, max_additional_seconds)
    add = _quantize(add, step_seconds)
    if add < min_additional_seconds:
        return DurationPlan(False, base_seconds, (), base_seconds, 'Quantized extension falls below provider minimum.')

    total = base_seconds + add
    exact = abs(total - target_total_seconds) < max((step_seconds or 0.001) / 2, 1e-9)
    return DurationPlan(
        exact,
        base_seconds,
        (add,),
        total,
        'Exact target reachable in one provider extension turn.' if exact
        else 'Provider permits only one extension turn; returned the maximum legal one-turn continuation.'
    )


def plan_bounded_reference_continuation_chain(*, target_total_seconds: float,
                                               min_segment_seconds: float,
                                               max_segment_seconds: float,
                                               preferred_segment_seconds: float,
                                               tail_seconds: float,
                                               tail_min_seconds: float,
                                               tail_max_seconds: float,
                                               max_total_segments: int | None = None,
                                               step_seconds: float = 1.0) -> ReferenceContinuationPlan:
    """Provider-neutral continuation planner for standalone generated segments.

    `max_total_segments` includes the base segment. For example Seedance 2.5 with
    two allowed extension rounds uses max_total_segments=3.
    """
    if not tail_min_seconds <= tail_seconds <= tail_max_seconds:
        raise ValueError('Continuation tail is outside provider bounds.')
    if max_total_segments is not None and max_total_segments < 1:
        raise ValueError('max_total_segments must be >= 1.')

    rem=float(target_total_seconds)
    if rem < min_segment_seconds:
        return ReferenceContinuationPlan(False,target_total_seconds,(),0,
            'Target is below provider minimum segment duration.')

    durations=[]
    while rem > 1e-9:
        if max_total_segments is not None and len(durations) >= max_total_segments:
            break
        slots_left = None if max_total_segments is None else max_total_segments-len(durations)
        if min_segment_seconds <= rem <= max_segment_seconds:
            d=rem
        else:
            d=min(preferred_segment_seconds,max_segment_seconds,rem)
            if 0 < rem-d < min_segment_seconds:
                # If another segment is allowed, leave exactly one legal minimum tail;
                # otherwise maximize the current segment without exceeding provider max.
                if slots_left is None or slots_left > 1:
                    d=rem-min_segment_seconds
        d=_quantize(d,step_seconds)
        if not min_segment_seconds <= d <= max_segment_seconds:
            break
        durations.append(d)
        rem-=d

    exact=abs(rem)<max(step_seconds/2,1e-9)
    t=0.0
    segments=[]
    for i,d in enumerate(durations):
        segments.append(ReferenceContinuationSegment(
            index=i,
            duration_seconds=d,
            global_start=t,
            global_end=t+d,
            tail_seconds=None if i==0 else min(tail_seconds,durations[i-1])
        ))
        t+=d
    if exact:
        reason='Exact target partitioned into legal provider continuation segments.'
    elif max_total_segments is not None and len(durations)>=max_total_segments:
        reason='Target exceeds the configured provider continuation-turn limit; returned the longest legal bounded plan.'
    else:
        reason='Target could not be exactly partitioned under provider continuation constraints.'
    return ReferenceContinuationPlan(exact,target_total_seconds,tuple(segments),t,reason)
