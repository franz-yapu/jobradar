data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${local.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Least privilege: consume one queue, read one parameter, write its own logs. Nothing else (no database, no AI keys).
data "aws_iam_policy_document" "worker" {
  statement {
    sid       = "ConsumeJobsQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
    resources = [aws_sqs_queue.jobs.arn]
  }

  statement {
    sid       = "ReadWorkerSecret"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.worker_secret_parameter}"]
  }

  # SecureString with the AWS-managed key (alias/aws/ssm): decryption only through SSM.
  statement {
    sid       = "DecryptWorkerSecret"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:key/*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.worker.arn}:*"]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "worker"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

# What the API needs to enqueue jobs. Attach it to the API's role or user once hosting exists (SDD-012).
data "aws_iam_policy_document" "api_sender" {
  statement {
    sid       = "EnqueueScoringJobs"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.jobs.arn]
  }
}

resource "aws_iam_policy" "api_sender" {
  name   = "${local.name}-api-sender"
  policy = data.aws_iam_policy_document.api_sender.json
}
