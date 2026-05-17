# Sync Orchestration Sequences

## Successful sync

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
        LinkPreview-->>Notion: bookmark cards or YouTube iframe HTML
        Notion->>Notion: Convert Markdown to HTML
        Notion-->>Orchestrator: html
        Orchestrator->>Notion: updatePageStatus(page.id, done)
        Orchestrator->>ImageProcessor: processHtmlImages(page, html, exclude bookmark-card images)
        alt Eligible HTML images detected
            loop For each image
                ImageProcessor->>DB: createImageAsset(page_id, notion_page_id, html_image_id, image_url, status: pending)
                ImageProcessor->>Downloader: download(image.url)
                Downloader-->>ImageProcessor: buffer, metadata
                ImageProcessor->>WP: uploadMedia(buffer, filename)
                WP-->>ImageProcessor: mediaId, url
                ImageProcessor->>DB: updateImageAsset(status: uploaded, wp_media_id, wp_media_url)
                ImageProcessor->>ImageProcessor: rewrite img src to WordPress media URL
            end
        else No images
            ImageProcessor-->>Orchestrator: original html
        end
        ImageProcessor-->>Orchestrator: renderedHtml
        Orchestrator->>WP: createDraftPost(title, renderedHtml, draft)
        WP-->>Orchestrator: postId
        Orchestrator->>DB: updatePage(wp_post_id=postId)
        Orchestrator->>DB: createNPagePostMap(notion_page_id, wp_post_id)
        Orchestrator->>DB: updatePage(status=success)
    end

    Orchestrator->>DB: updateJob(status: completed, metrics)
    Orchestrator->>Telegram: send(job)
    Orchestrator-->>ENTRY: IJobResult
```

[Failed Sync Sequence](./sequence-sync-failure.md)
