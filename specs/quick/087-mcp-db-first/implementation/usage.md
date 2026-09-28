# MCP DB-First Resolution Usage

No caller changes are required.

All media surfaces continue to pass their existing transport/model fields. The
server now treats `mcpConnectionId` and `sharedGroupId` as preferences only:
fresh tenant/user/group-authorized database state is authoritative.

When one eligible physical connection exists, it is selected automatically.
When several exist, a fresh valid selection or personal default is used;
otherwise the request asks for account selection.
