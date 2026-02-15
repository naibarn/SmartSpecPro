import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    api_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
};

// Test data: create test users beforehand via setup-test-users.sh
const users = JSON.parse(open('./test-users.json'));

// Pre-authenticate all users during setup (avoids rate limiting during test)
export function setup() {
  const sessions = [];

  for (let i = 0; i < users.length; i++) {
    const res = http.post(
      `${__ENV.BASE_URL}/trpc/login`,
      JSON.stringify({ json: { email: users[i].email, password: users[i].password } }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Origin': __ENV.BASE_URL,
        },
      }
    );

    if (res.status === 200) {
      const cookie = res.cookies['app_session_id'];
      if (cookie && cookie[0]) {
        sessions.push({ index: i, cookie: cookie[0].value });
      }
    }

    // Small delay to respect rate limits during setup
    if (i % 5 === 4) sleep(1);
  }

  console.log(`Setup: authenticated ${sessions.length}/${users.length} users`);
  return { sessions };
}

export default function (data) {
  const session = data.sessions[__VU % data.sessions.length];
  if (!session) {
    sleep(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `app_session_id=${session.cookie}`,
    'Origin': __ENV.BASE_URL,
  };

  // Check current user profile (read-only query)
  const meRes = http.get(`${__ENV.BASE_URL}/trpc/me`, {
    headers: headers,
  });

  check(meRes, {
    'profile loaded': (r) => r.status === 200,
  });

  errorRate.add(meRes.status !== 200);

  // Submit a media job (simplified spec for load testing)
  const jobRes = http.post(
    `${__ENV.BASE_URL}/trpc/mediaJobs.submitJob`,
    JSON.stringify({
      json: {
        specVersion: '0.1',
        jobType: 'image_gen',
        inputs: {
          assets: [],
          parameters: {
            prompt: 'A test image for load testing',
          },
        },
        outputs: {
          format: 'png',
        },
      },
    }),
    { headers }
  );

  check(jobRes, {
    'job submitted': (r) => r.status === 200,
  });

  errorRate.add(jobRes.status !== 200);

  if (jobRes.status === 200) {
    let body;
    try {
      body = JSON.parse(jobRes.body);
    } catch (_) {
      sleep(1);
      return;
    }

    const jobId = body.result?.data?.json?.jobId || body.result?.data?.jobId;

    if (jobId) {
      // Poll for status (3 times)
      for (let i = 0; i < 3; i++) {
        sleep(2);
        const input = encodeURIComponent(JSON.stringify({ json: { jobId } }));
        const statusRes = http.get(
          `${__ENV.BASE_URL}/trpc/mediaJobs.getJobStatus?input=${input}`,
          { headers }
        );

        check(statusRes, {
          'status check succeeded': (r) => r.status === 200,
        });
      }
    }
  }

  sleep(1); // Think time between iterations
}
