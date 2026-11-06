data "aws_caller_identity" "current" {}

data "archive_file" "worker" {
  type        = "zip"
  source_dir  = var.worker_dist_dir
  output_path = "${path.module}/.build/worker.zip"

  lifecycle {
    precondition {
      condition     = fileexists("${var.worker_dist_dir}/index.mjs")
      error_message = "The worker is not built. Run `pnpm --filter @jobradar/worker build` first."
    }
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.name}-worker"
  retention_in_days = 14
}

resource "aws_lambda_function" "worker" {
  function_name    = "${local.name}-worker"
  role             = aws_iam_role.worker.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  architectures    = ["arm64"]
  memory_size      = 128
  timeout          = var.lambda_timeout_seconds
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256

  environment {
    variables = {
      API_URL             = var.api_url
      WORKER_SECRET_PARAM = var.worker_secret_parameter
    }
  }

  depends_on = [aws_cloudwatch_log_group.worker, aws_iam_role_policy.worker]
}

resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn = aws_sqs_queue.jobs.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 5
  # The worker answers per message; only the failed ones go back to the queue.
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.worker_max_concurrency
  }
}
