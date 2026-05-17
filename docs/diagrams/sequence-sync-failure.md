# Sync Orchestration Sequences

## Failed sync with rollback

```mermaid
sequenceDiagram
    autonumber
    participant ENTRY as CLI Client or Cron Job
    participant Orchestrator as Orchestrator
    participant DB as Database
    participant Notion as Notion
    participant LinkPreview as LinkPreview
    participant ImageProcessor as ImageProcessor
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
        Notion->>LinkPreview: transform bookmark/link_preview/embed blocks and YouTube URLs
        LinkPreview-->>Notion: bookmark cards, YouTube iframe HTML, or fallback cards
        Notion->>Notion: Convert Markdown to HTML
        Notion-->>Orchestrator: html
        Orchestrator->>Notion: updatePageStatus(page.id, done)
        Orchestrator->>ImageProcessor: processHtmlImages(page, html)
        loop For each eligible HTML image
            ImageProcessor->>DB: createImageAsset(page_id, notion_page_id, html_image_id, image_url, status: pending)
            ImageProcessor->>Downloader: download(image.url)
            Downloader-->>ImageProcessor: buffer, metadata
            ImageProcessor->>WP: uploadMedia(buffer, filename)
            WP--x ImageProcessor: upload fails
            ImageProcessor->>DB: updateImageAsset(status=failed, error)
            ImageProcessor--x Orchestrator: throw Error(image failure)
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
