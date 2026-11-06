# Plan-level checks with a mocked AWS provider: no credentials, no cost. Run: terraform test
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::123456789012:policy/mock" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:mock" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:123456789012:function:mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:mock" }
  }
}

# The provider cannot render policy JSON when mocked; the assertions below read the policy arguments instead.
override_data {
  target = data.aws_iam_policy_document.lambda_assume
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.worker
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.api_sender
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

variables {
  api_url         = "https://api.example.com"
  worker_dist_dir = "tests/fixtures/dist"
}

run "queue_and_worker_wiring" {
  command = apply

  assert {
    condition     = jsondecode(aws_sqs_queue.jobs.redrive_policy).maxReceiveCount == 3
    error_message = "Messages must go to the dead-letter queue after 3 deliveries."
  }
  assert {
    condition     = aws_sqs_queue.jobs.visibility_timeout_seconds >= 6 * aws_lambda_function.worker.timeout
    error_message = "Visibility timeout must be at least 6x the Lambda timeout."
  }
  assert {
    condition     = contains(aws_lambda_event_source_mapping.jobs.function_response_types, "ReportBatchItemFailures")
    error_message = "The worker reports per-message failures; the mapping must honour them."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.jobs.scaling_config[0].maximum_concurrency == 2
    error_message = "Concurrency (and so parallel AI calls) must stay capped."
  }
  assert {
    condition     = aws_sqs_queue.jobs.sqs_managed_sse_enabled && aws_sqs_queue.dlq.sqs_managed_sse_enabled
    error_message = "Queues must be encrypted at rest."
  }
  assert {
    condition     = aws_lambda_function.worker.environment[0].variables["WORKER_SECRET_PARAM"] == "/jobradar/worker-secret" && !contains(keys(aws_lambda_function.worker.environment[0].variables), "WORKER_SECRET")
    error_message = "The secret must be read from SSM, never placed in the function configuration."
  }
}

run "worker_role_is_least_privilege" {
  command = apply

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.worker.statement :
      alltrue([for a in s.actions : a != "*" && !endswith(a, ":*")])
    ])
    error_message = "No wildcard actions in the worker policy."
  }
  assert {
    condition     = !anytrue([for s in data.aws_iam_policy_document.worker.statement : contains(s.resources, "*")])
    error_message = "No wildcard resources in the worker policy."
  }
  assert {
    condition     = length([for s in data.aws_iam_policy_document.worker.statement : s if anytrue([for a in s.actions : startswith(a, "rds") || startswith(a, "secretsmanager") || startswith(a, "s3")])]) == 0
    error_message = "The worker must not reach databases, other secret stores or buckets."
  }
  assert {
    condition     = one(data.aws_iam_policy_document.api_sender.statement).actions == toset(["sqs:SendMessage"])
    error_message = "The API only needs to send messages."
  }
}

run "alarms_need_a_recipient" {
  command = apply

  assert {
    condition     = length(aws_budgets_budget.monthly) == 0 && length(aws_cloudwatch_metric_alarm.dlq_not_empty) == 0
    error_message = "Without alert_email there is nobody to notify: no budget, no alarm."
  }
}

run "alarms_with_a_recipient" {
  command = apply

  variables {
    alert_email = "me@example.com"
  }

  assert {
    condition     = length(aws_budgets_budget.monthly) == 1 && aws_budgets_budget.monthly[0].limit_amount == "5"
    error_message = "A US$5 monthly budget is expected."
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dlq_not_empty) == 1
    error_message = "The dead-letter alarm is expected."
  }
}

run "api_url_must_be_https" {
  command = plan

  variables {
    api_url = "http://api.example.com"
  }

  expect_failures = [var.api_url]
}

run "concurrency_below_two_is_rejected" {
  command = plan

  variables {
    worker_max_concurrency = 1
  }

  expect_failures = [var.worker_max_concurrency]
}
