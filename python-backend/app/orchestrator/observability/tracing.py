"""
SmartSpec Pro - Distributed Tracing
Phase 2: Quality & Intelligence

Provides distributed tracing for request flows:
- Span creation and management
- Context propagation
- Trace export
"""

import asyncio
from contextlib import contextmanager, asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Generator
from uuid import uuid4
import time
import threading

import structlog

logger = structlog.get_logger()


class SpanStatus(str, Enum):
    """Status of a span."""
    UNSET = "unset"
    OK = "ok"
    ERROR = "error"


@dataclass
class SpanContext:
    """Context for a span, used for propagation."""
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, str]:
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id or "",
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, str]) -> "SpanContext":
        return cls(
            trace_id=data["trace_id"],
            span_id=data["span_id"],
            parent_span_id=data.get("parent_span_id") or None,
        )
    
    def to_header(self) -> str:
        """Convert to traceparent header format."""
        parent = self.parent_span_id or "0000000000000000"
        return f"00-{self.trace_id}-{self.span_id}-01"
    
    @classmethod
    def from_header(cls, header: str) -> Optional["SpanContext"]:
        """Parse from traceparent header."""
        try:
            parts = header.split("-")
            if len(parts) >= 3:
                return cls(
                    trace_id=parts[1],
                    span_id=parts[2],
                )
        except Exception:
            pass
        return None


@dataclass
class SpanEvent:
    """Event within a span."""
    name: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    attributes: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Span:
    """Represents a single span in a trace."""
    name: str
    context: SpanContext
    
    # Timing
    start_time: datetime = field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    
    # Status
    status: SpanStatus = SpanStatus.UNSET
    status_message: str = ""
    
    # Attributes and events
    attributes: Dict[str, Any] = field(default_factory=dict)
    events: List[SpanEvent] = field(default_factory=list)
    
    # Links to other spans
    links: List[SpanContext] = field(default_factory=list)
    
    @property
    def duration_ms(self) -> float:
        if self.end_time:
            return (self.end_time - self.start_time).total_seconds() * 1000
        return 0.0
    
    @property
    def is_ended(self) -> bool:
        return self.end_time is not None
    
    def set_attribute(self, key: str, value: Any):
        """Set a span attribute."""
        self.attributes[key] = value
    
    def set_attributes(self, attributes: Dict[str, Any]):
        """Set multiple attributes."""
        self.attributes.update(attributes)
    
    def add_event(
        self,
        name: str,
        attributes: Optional[Dict[str, Any]] = None,
    ):
        """Add an event to the span."""
        self.events.append(SpanEvent(
            name=name,
            attributes=attributes or {},
        ))
    
    def set_status(self, status: SpanStatus, message: str = ""):
        """Set span status."""
        self.status = status
        self.status_message = message
    
    def end(self, end_time: Optional[datetime] = None):
        """End the span."""
        self.end_time = end_time or datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "trace_id": self.context.trace_id,
            "span_id": self.context.span_id,
            "parent_span_id": self.context.parent_span_id,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_ms": self.duration_ms,
            "status": self.status.value,
            "status_message": self.status_message,
            "attributes": self.attributes,
            "events": [
                {
                    "name": e.name,
                    "timestamp": e.timestamp.isoformat(),
                    "attributes": e.attributes,
                }
                for e in self.events
            ],
        }


class Tracer:
    """
    Distributed tracer for request flows.
    
    Features:
    - Automatic span creation
    - Context propagation
    - Span export
    """
    
    def __init__(
        self,
        service_name: str = "smartspec-orchestrator",
        export_enabled: bool = True,
    ):
        """
        Initialize Tracer.
        
        Args:
            service_name: Name of the service
            export_enabled: Whether to export spans
        """
        self.service_name = service_name
        self.export_enabled = export_enabled
        
        # Span storage
        self._spans: Dict[str, Span] = {}
        self._traces: Dict[str, List[Span]] = {}
        
        # Context storage (thread-local)
        self._context = threading.local()
        
        logger.info("tracer_initialized", service_name=service_name)
    
    def _generate_id(self, length: int = 16) -> str:
        """Generate a random ID."""
        return uuid4().hex[:length]
    
    def _get_current_span(self) -> Optional[Span]:
        """Get the current span from context."""
        return getattr(self._context, "current_span", None)
    
    def _set_current_span(self, span: Optional[Span]):
        """Set the current span in context."""
        self._context.current_span = span
    
    def start_span(
        self,
        name: str,
        parent_context: Optional[SpanContext] = None,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """
        Start a new span.
        
        Args:
            name: Span name
            parent_context: Optional parent context
            attributes: Initial attributes
            
        Returns:
            The created span
        """
        # Determine parent
        if parent_context is None:
            current_span = self._get_current_span()
            if current_span:
                parent_context = current_span.context
        
        # Create context
        if parent_context:
            context = SpanContext(
                trace_id=parent_context.trace_id,
                span_id=self._generate_id(),
                parent_span_id=parent_context.span_id,
            )
        else:
            context = SpanContext(
                trace_id=self._generate_id(32),
                span_id=self._generate_id(),
            )
        
        # Create span
        span = Span(
            name=name,
            context=context,
            attributes=attributes or {},
        )
        
        # Add service name
        span.set_attribute("service.name", self.service_name)
        
        # Store span
        self._spans[context.span_id] = span
        
        if context.trace_id not in self._traces:
            self._traces[context.trace_id] = []
        self._traces[context.trace_id].append(span)
        
        return span
    
    def end_span(self, span: Span):
        """End a span."""
        span.end()
        
        if self.export_enabled:
            self._export_span(span)
    
    def _export_span(self, span: Span):
        """Export a span (log it for now)."""
        logger.info(
            "span_ended",
            span_name=span.name,
            trace_id=span.context.trace_id,
            span_id=span.context.span_id,
            duration_ms=span.duration_ms,
            status=span.status.value,
        )
    
    @contextmanager
    def span(
        self,
        name: str,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Generator[Span, None, None]:
        """
        Context manager for creating spans.
        
        Usage:
            with tracer.span("operation") as span:
                span.set_attribute("key", "value")
                # do work
        """
        span = self.start_span(name, attributes=attributes)
        previous_span = self._get_current_span()
        self._set_current_span(span)
        
        try:
            yield span
            if span.status == SpanStatus.UNSET:
                span.set_status(SpanStatus.OK)
        except Exception as e:
            span.set_status(SpanStatus.ERROR, str(e))
            span.add_event("exception", {"message": str(e)})
            raise
        finally:
            self._set_current_span(previous_span)
            self.end_span(span)
    
    @asynccontextmanager
    async def async_span(
        self,
        name: str,
        attributes: Optional[Dict[str, Any]] = None,
    ):
        """
        Async context manager for creating spans.
        
        Usage:
            async with tracer.async_span("operation") as span:
                span.set_attribute("key", "value")
                # do work
        """
        span = self.start_span(name, attributes=attributes)
        previous_span = self._get_current_span()
        self._set_current_span(span)
        
        try:
            yield span
            if span.status == SpanStatus.UNSET:
                span.set_status(SpanStatus.OK)
        except Exception as e:
            span.set_status(SpanStatus.ERROR, str(e))
            span.add_event("exception", {"message": str(e)})
            raise
        finally:
            self._set_current_span(previous_span)
            self.end_span(span)
    
    def get_trace(self, trace_id: str) -> List[Span]:
        """Get all spans for a trace."""
        return self._traces.get(trace_id, [])
    
    def get_span(self, span_id: str) -> Optional[Span]:
        """Get a span by ID."""
        return self._spans.get(span_id)
    
    def get_current_context(self) -> Optional[SpanContext]:
        """Get the current span context."""
        span = self._get_current_span()
        return span.context if span else None
    
    def inject_context(self, headers: Dict[str, str]) -> Dict[str, str]:
        """Inject current context into headers."""
        context = self.get_current_context()
        if context:
            headers["traceparent"] = context.to_header()
        return headers
    
    def extract_context(self, headers: Dict[str, str]) -> Optional[SpanContext]:
        """Extract context from headers."""
        traceparent = headers.get("traceparent")
        if traceparent:
            return SpanContext.from_header(traceparent)
        return None
    
    def get_all_traces(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get all traces."""
        return {
            trace_id: [span.to_dict() for span in spans]
            for trace_id, spans in self._traces.items()
        }
    
    def cleanup(self, max_traces: int = 1000):
        """Cleanup old traces."""
        if len(self._traces) > max_traces:
            # Remove oldest traces
            sorted_traces = sorted(
                self._traces.items(),
                key=lambda x: x[1][0].start_time if x[1] else datetime.min,
            )
            
            to_remove = len(self._traces) - max_traces
            for trace_id, spans in sorted_traces[:to_remove]:
                for span in spans:
                    self._spans.pop(span.context.span_id, None)
                del self._traces[trace_id]


# Global tracer instance
_tracer: Optional[Tracer] = None


def get_tracer() -> Tracer:
    """Get the global tracer."""
    global _tracer
    if _tracer is None:
        _tracer = Tracer()
    return _tracer
