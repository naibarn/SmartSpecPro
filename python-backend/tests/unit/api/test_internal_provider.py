from types import SimpleNamespace


def test_terminal_completed_media_task_is_recoverable_as_completed_observation():
    from app.api.internal_provider import map_provider_poll_result

    task = SimpleNamespace(id="media-1", result_url="/api/storage/files/media-1.png", error_message=None)
    assert map_provider_poll_result(task, {"status": "terminal", "state": "completed"}) == {
        "status": "completed",
        "resultRef": "media-task:media-1",
    }


def test_ambiguous_terminal_media_task_fails_closed():
    from app.api.internal_provider import map_provider_poll_result

    task = SimpleNamespace(id="media-2", result_url=None, error_message=None)
    assert map_provider_poll_result(task, {"status": "terminal", "state": "unknown"}) == {
        "status": "unknown",
        "reason": "provider_task_terminal_state_ambiguous",
    }
