from copy import deepcopy
import unittest

from app.services.cloudflare_http_image_provision_contract import validate_plan, normalize_grant, plan_digest, namespace


class HttpImageContractTests(unittest.TestCase):
    def setUp(self):
        self.plan = {"namespace": namespace("tenant", "project"), "runtime": "python-http", "sourceSha": "a" * 40,
                     "buildId": "a" * 40 + "-11111111-1111-4111-8111-111111111111", "configurationExpiresAt": "2026-10-21T12:00:00Z",
                     "buildBudgetSeconds": 180, "maxImageBytes": 1073741824, "maxPublishedImages": 1}

    def test_fixed_recipe_rejects_extra_fields_unbounded_work_and_bool_budgets(self):
        self.assertEqual(validate_plan(self.plan), self.plan)
        for change in ({"command": "run"}, {"runtime": "arbitrary"}, {"maxImageBytes": 2147483648}, {"maxPublishedImages": True},
                       {"buildBudgetSeconds": 181}, {"buildId": "b" * 40 + self.plan["buildId"][40:]}):
            with self.subTest(change=tuple(change)):
                with self.assertRaises(ValueError):
                    validate_plan({**self.plan, **change})

    def test_grant_reuses_exact_staging_identity_and_tenant_namespace_boundary(self):
        grant = {"schemaVersion": "cloudflare.staging-http-image-provision-grant.v1", "grantRef": "22222222-2222-4222-8222-222222222222",
                 "tenantId": "tenant", "projectId": "project", "requesterUserId": 1, "executorId": "cf-staging-executor:test",
                 "jobId": "33333333-3333-4333-8333-333333333333", "accountRef": "b" * 32, "targetId": "smartspec-cloudflare-staging",
                 "environment": "staging", "actions": ["provision"], "plan": self.plan, "planDigest": plan_digest(self.plan),
                 "expiresAt": self.plan["configurationExpiresAt"], "revokedAt": None}
        self.assertEqual(normalize_grant(grant), grant)
        for change in ({"tenantId": "foreign"}, {"environment": "production"}, {"actions": ["deploy"]}, {"planDigest": "c" * 64}):
            with self.assertRaises(ValueError):
                normalize_grant({**deepcopy(grant), **change})


if __name__ == "__main__":
    unittest.main()
