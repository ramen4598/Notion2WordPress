# Notion to WordPress

<p align="center">
  <img src="./docs/img/notion2wp_logo.png" alt="Notion to WordPress Logo" width="400">
</p>

An automated synchronization system that syncs Notion pages to WordPress blog as draft posts. Simply write your content in Notion and automatically publish it as a WordPress draft.

## 📋 Key Features

- **Automatic Synchronization**: Automatically converts Notion pages to WordPress draft posts
- **Image Handling**: Rewrites synced HTML image URLs after uploading Notion images to the WordPress media library
- **Link Previews**: Converts Notion bookmark, link preview, and embed blocks into WordPress-ready cards, with YouTube URLs rendered as embeds
- **Scheduling**: Cron-based periodic synchronization (default: every 5 minutes)
- **Manual Execution**: Support for manual synchronization via CLI
- **Error Handling**: Automatic retry on failure (default 3 times) and rollback
- **Notifications**: Telegram notifications for sync success/failure
- **Tracking**: SQLite-based synchronization history management

## 🔄 How It Works

1. Set the `status` property of your Notion page to `adding`
2. System automatically detects the page and syncs it to WordPress as a draft
3. On success, updates Notion `status` to `done`
4. Receive sync result notification via Telegram
5. Review the draft in WordPress admin panel and manually publish

## 📊 Status Property Values

![status property values image](./docs/img/notion_database_example.png)

- `writing`: Work in progress (ignored by sync)
- `adding`: Waiting for sync (will be sent to WordPress)
- `done`: Sync completed
- `error`: Sync failed

## 🚀 Quick Start

👇 Please refer to the quickstart guide: 
- [Quick Start Guide For Everyone](./docs/quickstart.md)
- [Additional Quick Start Guide For Developers](./docs/quickstart-dev.md)


## 🏗️ Tech Stack

- **Runtime**: Node.js 20.x, TypeScript 5.9.3
- **Notion API**: @notionhq/client 5.9.0
- **WordPress API**: axios 1.16.1
- **Content Conversion**: notion-to-md 3.1.9, marked 17.0.1, cheerio 1.1.2
- **Scheduler**: node-cron 4.2.1
- **Database**: better-sqlite3 12.6.2
- **Notifications**: Telegraf 4.16.3
- **Testing**: Vitest 4.0.18
- **Deployment**: Docker

## 📁 Project Structure

```
src/
├── index.ts                      # Scheduled sync entry (cron)
├── cli/                          # CLI entrypoints
│   └── syncManual.ts             # Manual sync command
├── config/                       # Environment configuration
│   └── config.ts                 # Loads .env and exports typed config
├── domain/                       # Application domain modules
│   ├── orchestrator/             # Top-level orchestration
│   ├── job/                      # Job processing + results
│   ├── page/                     # Page query + sync workflow
│   ├── image/                    # Image download/upload pipeline
│   ├── linkPreview/              # Bookmark cards + YouTube embed conversion
│   ├── notion/                   # Notion integration
│   ├── wordPress/                # WordPress integration
│   ├── notification/             # Notifications (Telegram)
│   └── db/                       # SQLite persistence (jobs/pages/assets/map)
└── lib/                          # Shared utilities (logger, retry, helpers)
```

## 📖 Documentation

- [Specification](./docs/spec.md) - Complete feature and technical specifications
- [Quick Start Guide](./docs/quickstart.md) - Detailed setup instructions and examples
- [Sequence Diagrams](./docs/diagrams/) - Sync orchestration flow diagrams

## ⚠️ Limitations (MVP)

- No update sync: Only new pages are processed
- No auto-publish: All posts require manual admin approval in WordPress admin panel
- No deletion sync: WordPress posts are retained even when deleted in Notion
- No category/tag sync: WordPress defaults are used
- No duplicate image check: There is no function to detect duplicate images or prevent uploads
- Link preview metadata is best-effort: unsupported, private/internal-network, slow, or oversized URLs fall back to a simple card unless `LINK_PREVIEW_BLOCK_PRIVATE_NETWORKS=false`

## 🔒 Security

- Notion and Telegram APIs require HTTPS/TLS
- WordPress API recommends HTTPS (HTTP allowed for localhost/development environments)
- All credentials are managed via environment variables
- Enhanced WordPress account security using Application Passwords
- Link preview metadata fetches block localhost/private/internal networks by default. Disable this only for trusted internal blog networks because it expands SSRF exposure.

## 📄 License

MIT License - See [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

Issues and pull requests are always welcome!

## 📞 Contact

If you encounter any problems or have questions, please contact us through GitHub Issues.
