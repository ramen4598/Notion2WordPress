# Sync Orchestration Sequences

## Successful sync

```mermaid
sequenceDiagram
    autonumber
    participant ENTRY as CLI Client or Cron Job
    participant Orchestrator as Orchestrator
    participant DB as Database
    participant Notion as NotionService
    participant Downloader as ImageDownloader
    participant WP as WordPressService
    participant Telegram as TelegramService

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
        alt Images detected
            loop For each image
		            Orchestrator->>DB: createImageAsset(page_id, notion_page_id, notion_block_id, notion_url, status: pending)
                Orchestrator->>Downloader: download(image.url)
                Downloader-->>Orchestrator: buffer, metadata
                Orchestrator->>WP: uploadMedia(buffer, filename)
                WP-->>Orchestrator: mediaId, url
                Orchestrator->>DB: updateImageAsset(status: uploaded, wp_media_id, wp_media_url)
                Orchestrator->>Orchestrator: map placeholder -> media.url
            end
        else No images
            Orchestrator->>Orchestrator: continue without uploads
        end
        Orchestrator->>WP: replaceImageUrls(html, map)
        WP-->>Orchestrator: renderedHtml
        Orchestrator->>WP: createDraftPost(title, renderedHtml, draft)
        WP-->>Orchestrator: postId
        Orchestrator->>DB: updatePage(wp_post_id=postId)
        Orchestrator->>DB: createNPagePostMap(notion_page_id, wp_post_id)
        Orchestrator->>Notion: updatePageStatus(page.id, done)
        Orchestrator->>DB: updatePage(status=success)
    end

    Orchestrator->>DB: updateJob(status: completed, metrics)
    Orchestrator->>Telegram: send(job)
    Orchestrator-->>ENTRY: IJobResult
```

[Failed Sync Sequence](./sequence-sync-failure.md)
