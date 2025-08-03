# Vector Quota Monitoring Guide

This guide explains how to monitor vector quota usage in the iplc-ai worker.

## Overview

The iplc-ai worker has a vector quota limit of 100 vectors (Cloudflare Vectorize free tier). The monitoring system tracks:
- Current vector count
- Quota usage percentage
- Vector operations (upserts/deletions)
- Quota denial events

## Structured Logging

### Log Format

The system emits structured JSON logs with the `[METRIC]` prefix for easy parsing:

```json
{
  "type": "vector_quota",
  "timestamp": "2025-01-31T12:00:00.000Z",
  "count": 75,
  "delta": 5,
  "reason": "upsert_document_doc-123456",
  "percentUsed": 75.0
}
```

### Log Fields

- `type`: Always "vector_quota" for quota metrics
- `timestamp`: ISO 8601 timestamp
- `count`: Current total vector count after operation
- `delta`: Change in vector count (positive for upserts, negative for deletions, 0 for denials)
- `reason`: Operation type and document ID
- `percentUsed`: Percentage of quota used

### Reason Patterns

- `upsert_document_{documentId}`: Successful vector insertion
- `delete_document_{documentId}`: Successful vector deletion
- `quota_denied_requested_{count}`: Quota limit prevented insertion

## Querying Logs

### Using Wrangler Tail

Monitor logs in real-time:

```bash
# View all logs
wrangler tail

# View only quota metrics (JSON format)
wrangler tail --format=json | grep '\[METRIC\]'

# Pretty print quota metrics
wrangler tail --format=json | grep '\[METRIC\]' | jq '.message | fromjson'
```

### Using Cloudflare Dashboard

1. Navigate to Workers & Pages > your-worker > Logs
2. Use the search filter: `"[METRIC]"`
3. Export logs for analysis

## Metrics Endpoint

### GET /metrics/quota

Returns current quota usage status.

#### Example Request

```bash
curl https://your-worker.workers.dev/metrics/quota
```

#### Example Response

```json
{
  "count": 75,
  "limit": 100,
  "percentUsed": 75.0,
  "timestamp": "2025-01-31T12:00:00.000Z"
}
```

#### Response Fields

- `count`: Current number of vectors
- `limit`: Maximum allowed vectors (100)
- `percentUsed`: Percentage of quota consumed
- `timestamp`: Time of measurement

### Testing the Endpoint

```bash
# Get current quota status
curl -X GET https://your-worker.workers.dev/metrics/quota

# With formatting
curl -X GET https://your-worker.workers.dev/metrics/quota | jq
```

## Creating Cloudflare Analytics

### Setting up Workers Analytics

1. Go to Workers & Pages > Analytics
2. Create a new dashboard
3. Add a chart with these settings:
   - Metric: Log count
   - Filter: Message contains "[METRIC]"
   - Group by: JSON field `reason`

### Sample Analytics Queries

1. **Vector Count Over Time**
   - Extract `count` from JSON logs
   - Plot as time series

2. **Operations by Type**
   - Group by `reason` prefix (upsert/delete/quota_denied)
   - Display as pie chart

3. **Quota Usage Trend**
   - Extract `percentUsed` field
   - Show as line graph with 80% threshold line

## Alerting Setup

### Basic Alert Configuration

1. **High Quota Usage Alert (>80%)**
   - Monitor: `/metrics/quota` endpoint
   - Condition: `percentUsed > 80`
   - Frequency: Every 5 minutes
   - Action: Send email/Slack notification

2. **Quota Denial Alert**
   - Monitor: Logs with `quota_denied` in reason
   - Condition: Any occurrence
   - Action: Immediate notification

### Using External Monitoring

Example using a monitoring service:

```bash
# Cron job to check quota every 5 minutes
*/5 * * * * curl -s https://your-worker.workers.dev/metrics/quota | \
  jq -r 'if .percentUsed > 80 then "ALERT: Vector quota at \(.percentUsed)%" else empty end'
```

## Sample Log Analysis Scripts

### Count Operations by Type

```bash
# Count operations in the last hour
wrangler tail --format=json | grep '\[METRIC\]' | \
  jq -r '.message | fromjson | .reason' | \
  awk -F'_' '{print $1"_"$2}' | sort | uniq -c
```

### Track Quota Growth

```bash
# Show quota usage over time
wrangler tail --format=json | grep '\[METRIC\]' | \
  jq -r '.message | fromjson | "\(.timestamp)\t\(.count)\t\(.percentUsed)%"'
```

## Best Practices

1. **Regular Monitoring**
   - Check quota usage daily
   - Set up alerts at 80% threshold
   - Review denied operations weekly

2. **Capacity Planning**
   - Track growth rate of vector usage
   - Plan document cleanup before hitting limits
   - Consider upgrading to paid tier if needed

3. **Log Retention**
   - Export logs regularly for long-term analysis
   - Use Cloudflare Logpush for automatic export
   - Maintain metrics history for trend analysis

## Troubleshooting

### Common Issues

1. **Metrics endpoint returns 0 count**
   - Check if KV namespace is properly bound
   - Verify VECTOR_COUNT_KEY exists in KV

2. **Logs not showing [METRIC] entries**
   - Ensure worker is deployed with latest code
   - Check worker tail is running correctly
   - Verify operations are actually occurring

3. **Quota frequently exceeded**
   - Review document retention policy
   - Implement document expiration
   - Consider chunking strategy optimization