import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const jobsQueued = new Counter('jobs_queued');

export const options = {
  scenarios: {
    job_burst: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: 500, // 500 total job submissions
      maxDuration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Burst tolerance: 2s
    http_req_failed: ['rate<0.01'],
  },
};

const users = JSON.parse(open('./test-users.json'));

// Pre-authenticate all users during setup
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

    if (i % 5 === 4) sleep(1);
  }

  console.log(`Setup: authenticated ${sessions.length}/${users.length} users`);
  return { sessions };
}

export default function (data) {
  const session = data.sessions[__VU % data.sessions.length];
  if (!session) {
    errorRate.add(true);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `app_session_id=${session.cookie}`,
    'Origin': __ENV.BASE_URL,
  };

  // Submit image generation job
  const jobRes = http.post(
    `${__ENV.BASE_URL}/trpc/mediaJobs.submitJob`,
    JSON.stringify({
      json: {
        specVersion: '0.1',
        jobType: 'image_gen',
        inputs: {
          assets: [],
          parameters: {
            prompt: `Burst test image ${__ITER}`,
          },
        },
        outputs: {
          format: 'png',
        },
      },
    }),
    { headers }
  );

  const success = check(jobRes, {
    'job queued': (r) => r.status === 200,
    'job has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return (body.result?.data?.json?.jobId || body.result?.data?.jobId) !== undefined;
      } catch (_) {
        return false;
      }
    },
  });

  if (success) {
    jobsQueued.add(1);
  }

  errorRate.add(!success);
}
