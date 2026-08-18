import http from 'k6/http';
import { check } from 'k6';

const baseUrl = String(__ENV.BASE_URL || '').replace(/\/$/, '');
const token = String(__ENV.MCP_TOKEN || '');
if (!baseUrl || !token) throw new Error('BASE_URL and MCP_TOKEN are required');

export const options = {
  scenarios: {
    mcp_protocol: {
      executor: 'constant-vus',
      vus: Number(__ENV.MCP_VUS || 10),
      duration: __ENV.MCP_DURATION || '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
  'Mcp-Protocol-Version': '2026-07-28',
};

function call(id, method, params = {}) {
  return http.post(`${baseUrl}/v1/mcp`, JSON.stringify({ jsonrpc: '2.0', id, method, params }), { headers });
}

export default function () {
  const discover = call(1, 'server/discover');
  check(discover, { 'discover succeeded': (response) => response.status === 200 && !JSON.parse(response.body).error });
  const tools = call(2, 'tools/list');
  check(tools, { 'tools list succeeded': (response) => response.status === 200 && !JSON.parse(response.body).error });
  const resources = call(3, 'resources/list');
  check(resources, { 'resources list succeeded': (response) => response.status === 200 && !JSON.parse(response.body).error });
}
