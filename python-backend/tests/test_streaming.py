"""Tests for Section 02: Streaming Integration.

Tests the LangGraph event to SSE translator, ring buffer, and event filtering.
"""

import json
import pytest
from datetime import timedelta

from app.orchestrator.ring_buffer import (
    ExecutionRingBuffer,
    RingBufferStore,
    SSEEvent,
    get_ring_buffer_store,
)
from app.orchestrator.stream_translator import (
    StreamTranslator,
    _should_emit_event,
)


# ============================================================================
# Test 1: on_chain_start maps to node_start SSE event
# ============================================================================


def test_astream_events_to_sse_node_start():
    """Test that on_chain_start maps to node_start SSE event."""
    translator = StreamTranslator(execution_id="exec-abc123def456")

    langgraph_event = {
        "event": "on_chain_start",
        "metadata": {
            "langgraph_node": "http_request_1",
            "node_display_name": "HTTP Request",
        },
        "data": {},
    }

    sse_event = translator.translate_event(langgraph_event)

    assert sse_event is not None
    assert sse_event.event_type == "node_start"
    assert sse_event.event_id == "exec-abc123def456_http_request_1_start"

    payload = json.loads(sse_event.data)
    assert payload["nodeId"] == "http_request_1"
    assert payload["nodeName"] == "HTTP Request"
    assert "timestamp" in payload


# ============================================================================
# Test 2: on_chain_end maps to node_complete with output data and duration
# ============================================================================


def test_astream_events_to_sse_node_complete():
    """Test that on_chain_end maps to node_complete with output and duration."""
    translator = StreamTranslator(execution_id="exec-abc123def456")

    # First send a start event to record start time
    translator.translate_event(
        {
            "event": "on_chain_start",
            "metadata": {"langgraph_node": "node1", "node_display_name": "Node 1"},
            "data": {},
        }
    )

    sse_event = translator.translate_event(
        {
            "event": "on_chain_end",
            "metadata": {"langgraph_node": "node1", "node_display_name": "Node 1"},
            "data": {"output": {"result": "success", "value": 42}},
        }
    )

    assert sse_event is not None
    assert sse_event.event_type == "node_complete"

    payload = json.loads(sse_event.data)
    assert payload["nodeId"] == "node1"
    assert payload["output"]["result"] == "success"
    assert payload["durationMs"] >= 0


# ============================================================================
# Test 3: on_chain_error maps to node_error with error message
# ============================================================================


def test_astream_events_to_sse_node_error():
    """Test that on_chain_error maps to node_error with error message."""
    translator = StreamTranslator(execution_id="exec-abc123def456")

    sse_event = translator.translate_event(
        {
            "event": "on_chain_error",
            "metadata": {
                "langgraph_node": "fail_node",
                "node_display_name": "Failing Node",
            },
            "data": {"error": "Connection timeout after 30s"},
        }
    )

    assert sse_event is not None
    assert sse_event.event_type == "node_error"

    payload = json.loads(sse_event.data)
    assert payload["nodeId"] == "fail_node"
    assert "timeout" in payload["error"].lower()


# ============================================================================
# Test 4: on_custom_event with name=workflow_complete maps to workflow_complete
# ============================================================================


def test_astream_events_to_sse_workflow_complete():
    """Test that on_custom_event workflow_complete maps correctly."""
    translator = StreamTranslator(execution_id="exec-abc123def456")

    sse_event = translator.translate_event(
        {
            "event": "on_custom_event",
            "name": "workflow_complete",
            "metadata": {},
            "data": {
                "total_duration_ms": 5200,
                "node_results": {
                    "node1": {"status": "success"},
                    "node2": {"status": "success"},
                },
            },
        }
    )

    assert sse_event is not None
    assert sse_event.event_type == "workflow_complete"

    payload = json.loads(sse_event.data)
    assert payload["executionId"] == "exec-abc123def456"
    assert payload["totalDurationMs"] == 5200
    assert len(payload["nodeResults"]) == 2


# ============================================================================
# Test 5: on_chat_model_stream events map to token SSE events
# ============================================================================


def test_token_streaming():
    """Test that on_chat_model_stream events map to token events with sequence numbers."""
    translator = StreamTranslator(execution_id="exec-abc123def456")

    tokens = ["Hello", " world", "!"]
    sse_events = []

    for token_text in tokens:
        sse_event = translator.translate_event(
            {
                "event": "on_chat_model_stream",
                "metadata": {"langgraph_node": "llm_node"},
                "data": {"chunk": {"content": token_text}},
            }
        )
        sse_events.append(sse_event)

    assert len(sse_events) == 3
    for i, evt in enumerate(sse_events):
        assert evt.event_type == "token"
        assert evt.event_id == f"exec-abc123def456_llm_node_tok_{i}"

    assert json.loads(sse_events[0].data)["token"] == "Hello"
    assert json.loads(sse_events[1].data)["token"] == " world"
    assert json.loads(sse_events[2].data)["token"] == "!"


# ============================================================================
# Test 6: Internal routing nodes are filtered
# ============================================================================


def test_internal_routing_nodes_filtered():
    """Test that internal LangGraph routing events are filtered."""
    # __start__ node - should be filtered
    assert (
        _should_emit_event(
            {
                "event": "on_chain_start",
                "metadata": {"langgraph_node": "__start__"},
            }
        )
        is False
    )

    # __end__ node - should be filtered
    assert (
        _should_emit_event(
            {
                "event": "on_chain_end",
                "metadata": {"langgraph_node": "__end__"},
            }
        )
        is False
    )

    # _route_ node - should be filtered
    assert (
        _should_emit_event(
            {
                "event": "on_chain_start",
                "metadata": {"langgraph_node": "_route_switch_1"},
            }
        )
        is False
    )

    # _branch_ node - should be filtered
    assert (
        _should_emit_event(
            {
                "event": "on_chain_start",
                "metadata": {"langgraph_node": "_branch_if_1"},
            }
        )
        is False
    )

    # Hidden node via metadata flag
    assert (
        _should_emit_event(
            {
                "event": "on_chain_start",
                "metadata": {
                    "langgraph_node": "internal_check",
                    "langgraph_hidden": True,
                },
            }
        )
        is False
    )

    # No langgraph_node metadata - should be filtered
    assert (
        _should_emit_event(
            {
                "event": "on_chain_start",
                "metadata": {},
            }
        )
        is False
    )

    # Regular user node - should NOT be filtered
    assert (
        _should_emit_event(
            {
                "event": "on_chain_start",
                "metadata": {"langgraph_node": "http_request_1"},
            }
        )
        is True
    )

    # on_tool_start - always filtered
    assert (
        _should_emit_event(
            {
                "event": "on_tool_start",
                "metadata": {"langgraph_node": "some_node"},
            }
        )
        is False
    )

    # on_chat_model_stream - always passed
    assert (
        _should_emit_event(
            {
                "event": "on_chat_model_stream",
                "metadata": {},
            }
        )
        is True
    )


# ============================================================================
# Test 7: Ring buffer stores events and drops older events at capacity
# ============================================================================


def test_ring_buffer_stores_events():
    """Test that ring buffer stores the last N events and drops older ones."""
    buf = ExecutionRingBuffer(max_size=5)

    # Add 5 events
    for i in range(5):
        buf.append(
            SSEEvent(
                event_id=f"evt_{i}", event_type="node_start", data=f'{{"i": {i}}}'
            )
        )

    assert len(buf) == 5
    all_events = buf.get_all()
    assert all_events[0].event_id == "evt_0"
    assert all_events[4].event_id == "evt_4"

    # Add 3 more - should drop the oldest 3
    for i in range(5, 8):
        buf.append(
            SSEEvent(
                event_id=f"evt_{i}", event_type="node_start", data=f'{{"i": {i}}}'
            )
        )

    assert len(buf) == 5
    all_events = buf.get_all()
    assert all_events[0].event_id == "evt_3"  # oldest remaining
    assert all_events[4].event_id == "evt_7"  # newest


# ============================================================================
# Test 8: SSE reconnection replays from Last-Event-ID
# ============================================================================


def test_sse_reconnection_replays_from_last_event_id():
    """Test that ring buffer replays events after Last-Event-ID."""
    store = RingBufferStore(buffer_size=100)
    buf = store.get_or_create("exec-test123")

    # Simulate a sequence of events
    events = [
        SSEEvent(
            event_id="exec-test123_node1_start",
            event_type="node_start",
            data='{"nodeId":"node1"}',
        ),
        SSEEvent(
            event_id="exec-test123_node1_complete",
            event_type="node_complete",
            data='{"nodeId":"node1"}',
        ),
        SSEEvent(
            event_id="exec-test123_node2_start",
            event_type="node_start",
            data='{"nodeId":"node2"}',
        ),
        SSEEvent(
            event_id="exec-test123_node2_complete",
            event_type="node_complete",
            data='{"nodeId":"node2"}',
        ),
        SSEEvent(
            event_id="exec-test123_node3_start",
            event_type="node_start",
            data='{"nodeId":"node3"}',
        ),
    ]
    for evt in events:
        buf.append(evt)

    # Client reconnects, last received was node1_complete
    missed = buf.get_events_since("exec-test123_node1_complete")

    assert len(missed) == 3
    assert missed[0].event_id == "exec-test123_node2_start"
    assert missed[1].event_id == "exec-test123_node2_complete"
    assert missed[2].event_id == "exec-test123_node3_start"


def test_sse_reconnection_unknown_event_id_returns_empty():
    """Test that unknown event_id returns empty list."""
    store = RingBufferStore(buffer_size=100)
    buf = store.get_or_create("exec-test456")
    buf.append(SSEEvent(event_id="evt_1", event_type="node_start", data="{}"))

    # Unknown event_id returns empty (event may have been evicted from buffer)
    missed = buf.get_events_since("evt_nonexistent")
    assert missed == []


def test_ring_buffer_store_evicts_oldest_at_capacity():
    """Test that ring buffer store evicts oldest buffers at capacity."""
    store = RingBufferStore(buffer_size=10)
    store.MAX_TRACKED_EXECUTIONS = 3  # Low limit for testing

    store.get_or_create("exec-1")
    store.get_or_create("exec-2")
    store.get_or_create("exec-3")
    store.get_or_create("exec-4")  # Should evict exec-1

    assert store.get("exec-1") is None
    assert store.get("exec-4") is not None


# ============================================================================
# Additional tests
# ============================================================================


def test_sse_event_to_sse_string_format():
    """Verify SSE wire format matches the EventSource specification."""
    evt = SSEEvent(
        event_id="test_id",
        event_type="node_start",
        data='{"nodeId":"n1"}',
    )
    sse_str = evt.to_sse_string()
    assert sse_str == 'event: node_start\ndata: {"nodeId":"n1"}\nid: test_id\n\n'


def test_translator_truncates_large_output():
    """Verify that node outputs > 10KB are truncated in SSE payload."""
    translator = StreamTranslator(execution_id="exec-abc123def456")
    translator.translate_event(
        {
            "event": "on_chain_start",
            "metadata": {"langgraph_node": "big_node"},
            "data": {},
        }
    )

    large_output = {"data": "x" * 20000}
    sse_event = translator.translate_event(
        {
            "event": "on_chain_end",
            "metadata": {"langgraph_node": "big_node"},
            "data": {"output": large_output},
        }
    )

    payload = json.loads(sse_event.data)
    assert payload["output"].get("_truncated") is True
    assert payload["output"].get("_size") > 10000


def test_token_events_not_stored_in_ring_buffer():
    """Token events should not be stored in the ring buffer (too voluminous)."""
    # Use a unique execution_id to avoid shared buffer pollution from other tests
    translator = StreamTranslator(execution_id="exec-token-test-unique-999")

    # Get initial buffer length
    initial_len = len(translator._ring_buffer)

    for i in range(50):
        translator.translate_event(
            {
                "event": "on_chat_model_stream",
                "metadata": {"langgraph_node": "llm_node"},
                "data": {"chunk": {"content": f"token_{i}"}},
            }
        )

    # Ring buffer length should not have increased (tokens are not stored)
    assert len(translator._ring_buffer) == initial_len


def test_ring_buffer_store_cleanup_expired():
    """Verify TTL-based cleanup of expired ring buffers."""
    store = RingBufferStore(buffer_size=10, ttl_seconds=1)
    buf = store.get_or_create("exec-old")

    # Manually backdate the last_activity
    buf.last_activity = buf.last_activity - timedelta(seconds=10)

    removed = store.cleanup_expired()
    assert removed == 1
    assert store.get("exec-old") is None
