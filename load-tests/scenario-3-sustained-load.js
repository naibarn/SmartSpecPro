import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const jobsSubmitted = new Counter('jobs_submitted');
const jobSubmitDuration = new Trend('job_submit_duration');

export const options = {
  scenarios: {
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 17, // ~1000 jobs/hour (17/minute)
      timeUnit: '1m',
      duration: '60m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'], // Allow up to 5% transient failures
    job_submit_duration: ['p(95)<2000'],
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
  const session = data.sessions[Math.floor(Math.random() * data.sessions.length)];
  if (!session) {
    errorRate.add(true);
    sleep(Math.random() * 5);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `app_session_id=${session.cookie}`,
    'Origin': __ENV.BASE_URL,
  };

  // Mix of job types: 70% image, 30% video
  const jobType = Math.random() > 0.7 ? 'video_gen' : 'image_gen';

  const startTime = Date.now();

  const jobRes = http.post(
    `${__ENV.BASE_URL}/trpc/mediaJobs.submitJob`,
    JSON.stringify({
      json: {
        specVersion: '0.1',
        jobType: jobType,
        inputs: {
          assets: [],
          parameters: {
            prompt: `Sustained test ${jobType} ${Date.now()}`,
          },
        },
        outputs: {
          format: jobType === 'video_gen' ? 'mp4' : 'png',
        },
      },
    }),
    { headers }
  );

  jobSubmitDuration.add(Date.now() - startTime);

  const success = check(jobRes, {
    'job submitted': (r) => r.status === 200,
  });

  if (success) {
    jobsSubmitted.add(1);
  }

  errorRate.add(!success);

  sleep(Math.random() * 5); // Realistic user delay
}
