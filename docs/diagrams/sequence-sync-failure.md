# Sync Orchestration Sequences

## Failed sync with rollback

```mermaid
sequenceDiagram
    autonumber
    participant ENTRY as CLI Client or Cron Job
    participant Orchestrator as Orchestrator
    participant DB as Database
    participant Notion as Notion
    participant Downloader as ImageDownloader
    participant WP as WordPress
    participant Telegram as Telegram

    ENTRY->>Orchestrator: execute(jobType)
    Orchestrator->>DB: createJob(jobType)
    Orchestrator->>DB: getLastSyncTimestamp()
    Orchestrator->>Notion: queryPages(lastSync, status=adding)
    Notion-->>Orchestrator: pages to sync

    loop Each Notion page
        Orchestrator->>DB: createPage(job_id, notion_page_id, status=pending)
        Orchestrator->>Notion: getPageHTML(page.id)
        Notion->>Notion: Extract images and replace urls with placeholders
        Notion-->>Orchestrator: html, images
        loop For each image
		        Orchestrator->>DB: createImageAsset(page_id, notion_page_id, notion_block_id, notion_url, status: pending)
            Orchestrator->>Downloader: download(image.url)
            Downloader-->>Orchestrator: buffer, metadata
            Orchestrator->>WP: uploadMedia(buffer, filename)
            WP--x Orchestrator: upload fails
            Orchestrator->>DB: updateImageAsset(status=failed, error)
            Orchestrator-->>Orchestrator: throw Error(image failure)
        end
        Orchestrator->>Orchestrator: catch error and trigger rollback
        opt Uploaded media exists
            Orchestrator->>WP: deleteMedia(uploadedMediaIds)
        end
        opt Draft post created earlier
            Orchestrator->>WP: deletePost(wpPostId)
        end
        Orchestrator->>Notion: updatePageStatus(page.id, error)
        Orchestrator->>DB: updatePage(status=failed, error)
    end

    Orchestrator->>DB: updateJob(status=failed, metrics, errorMessage)
    Orchestrator->>Telegram: sendSyncNotification(summary with errors)
    Orchestrator-->>ENTRY: propagate error
```

[Successful Sync Sequence](./sequence-sync-success.md)
