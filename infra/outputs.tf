output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}

output "alb_dns_name" {
  description = "Public DNS address of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "Primary RDS PostgreSQL database connection endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary connection endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket created for assessment media and recordings"
  value       = aws_s3_bucket.media.id
}

output "sqs_queue_url" {
  description = "URL of the primary SQS queue for background jobs"
  value       = aws_sqs_queue.main_queue.url
}
