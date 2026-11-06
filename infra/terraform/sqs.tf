locals {
  name = "${var.project}-scoring"
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${local.name}-dlq"
  message_retention_seconds = 14 * 24 * 3600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "jobs" {
  name = "${local.name}-jobs"
  # AWS recommends at least 6x the function timeout so a slow invocation does not get its message redelivered.
  visibility_timeout_seconds = var.lambda_timeout_seconds * 6
  message_retention_seconds  = 24 * 3600
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}

# Only the jobs queue may use this dead-letter queue.
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.jobs.arn]
  })
}
