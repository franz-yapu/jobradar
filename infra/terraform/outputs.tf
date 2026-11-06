output "queue_url" {
  description = "Value of SQS_QUEUE_URL for the API."
  value       = aws_sqs_queue.jobs.url
}

output "dead_letter_queue_url" {
  value = aws_sqs_queue.dlq.url
}

output "worker_function_name" {
  value = aws_lambda_function.worker.function_name
}

output "api_sender_policy_arn" {
  description = "Attach to the API's IAM role or user so it can send jobs."
  value       = aws_iam_policy.api_sender.arn
}
