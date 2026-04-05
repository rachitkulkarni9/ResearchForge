from concurrent.futures import Future, ThreadPoolExecutor
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, max_workers: int = 4):
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="paper-job")

    def submit(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Future:
        future = self._executor.submit(fn, *args, **kwargs)
        future.add_done_callback(self._log_failure)
        return future

    def _log_failure(self, future: Future) -> None:
        exc = future.exception()
        if exc is not None:
            logger.exception("Background job failed", exc_info=exc)
