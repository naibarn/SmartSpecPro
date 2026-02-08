"""File Upload Trigger Executor - Start workflow when file is uploaded."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class FileUploadTriggerExecutor:
    """Executor for file upload trigger nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute file upload trigger - returns file information.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with file URL, name, size, and MIME type

        Raises:
            ValueError: If file data not provided or validation fails
        """
        # File data should be provided in extra_data when workflow is triggered
        file_data = context.extra_data.get("uploaded_file", {})

        if not file_data:
            raise ValueError("No file data provided in trigger context")

        # Validate file size against configured max
        max_size_mb = data.inputs.get("maxSize", 10)
        file_size_bytes = file_data.get("fileSize", 0)
        max_size_bytes = max_size_mb * 1024 * 1024

        if file_size_bytes > max_size_bytes:
            raise ValueError(
                f"File size ({file_size_bytes / 1024 / 1024:.2f} MB) "
                f"exceeds maximum allowed size ({max_size_mb} MB)"
            )

        # Validate file type against accepted types
        accepted_types = data.inputs.get("acceptedTypes", ["*/*"])
        file_mime = file_data.get("mimeType", "")

        if "*/*" not in accepted_types:
            # Check if mime type matches any accepted pattern
            type_matched = False
            for accepted in accepted_types:
                if accepted.endswith("/*"):
                    # Wildcard match (e.g., "image/*")
                    category = accepted.split("/")[0]
                    if file_mime.startswith(category + "/"):
                        type_matched = True
                        break
                elif accepted == file_mime:
                    # Exact match
                    type_matched = True
                    break

            if not type_matched:
                raise ValueError(
                    f"File type '{file_mime}' is not in accepted types: {accepted_types}"
                )

        return {
            "fileUrl": file_data.get("fileUrl", ""),
            "fileName": file_data.get("fileName", ""),
            "fileSize": file_size_bytes,
            "mimeType": file_mime,
        }
