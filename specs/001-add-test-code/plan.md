# Test Plan (Unit-first)

## Conventions

- Given/When/Then은 "행위 중심"으로 작성한다.
- 외부 API(Notion/WP/Telegram)는 **모두 mock**하고, 호출 인자까지 검증한다.
- SQLite는 **실제 DB**를 사용하며 테스트마다 초기화한다.
  - 1순위: `:memory:`
  - 대안: `tests/data/` 파일 DB
- Notion block 더미데이터는 사용자가 제공하며 `tests/helpers/` 아래에 둔다.

---

## Unit Tests

### `src/lib/utils.ts`

| ID           | 기능                                | Given                                             | When                   | Then                                    |
| ------------ | ----------------------------------- | ------------------------------------------------- | ---------------------- | --------------------------------------- |
| UT-UTILS-001 | `isRecord` - null 처리              | `null`                                            | `isRecord(null)` 호출  | `false` 반환                            |
| UT-UTILS-002 | `isRecord` - primitive 처리         | `'x'`, `1`, `true`, `undefined`                   | `isRecord(value)` 호출 | `false` 반환                            |
| UT-UTILS-003 | `isRecord` - object/array/date 처리 | `{}`, `[]`, `new Date()`                          | `isRecord(value)` 호출 | `true` 반환                             |
| UT-UTILS-004 | `isRecord` - function 처리          | `() => {}`                                        | `isRecord(fn)` 호출    | `false` 반환                            |
| UT-UTILS-005 | `asError` - Error passthrough       | `new Error('x')`                                  | `asError(err)` 호출    | 동일 인스턴스 반환                      |
| UT-UTILS-006 | `asError` - non-Error 변환          | string/number/boolean/null/undefined/object/array | `asError(value)` 호출  | `Error` 반환, message는 `String(value)` |

### `src/lib/retry.ts` (`retryWithBackoff`)

| ID           | 기능             | Given                        | When                                       | Then                           |
| ------------ | ---------------- | ---------------------------- | ------------------------------------------ | ------------------------------ |
| UT-RETRY-001 | 1회 성공         | 항상 resolve 하는 fn         | `retryWithBackoff(fn)` 호출                | 호출 1회, 결과 반환            |
| UT-RETRY-002 | N회 실패 후 성공 | 2회 reject 후 3회째 resolve  | `retryWithBackoff(fn,{maxAttempts:5,...})` | 호출 횟수=3, 결과 반환         |
| UT-RETRY-003 | 최대 시도 초과   | 항상 reject, `maxAttempts=2` | `retryWithBackoff(fn)`                     | 최종 에러 throw, 호출 횟수=2   |
| UT-RETRY-004 | `onRetry` 호출   | 2회 실패 후 성공             | `retryWithBackoff(fn,{onRetry})`           | `onRetry`가 실패 횟수만큼 호출 |

### `src/lib/imageDownloader.ts` (`imageDownloader.download`)

| ID           | 기능                    | Given                                 | When              | Then                                            |
| ------------ | ----------------------- | ------------------------------------- | ----------------- | ----------------------------------------------- |
| UT-IMGDL-001 | 정상 다운로드/해시 생성 | axios.get 성공 응답(buffer, headers)  | `download({url})` | `buffer/hash/contentType/size/filename` 세팅    |
| UT-IMGDL-002 | content-type 기본값     | headers에 `content-type` 없음         | `download({url})` | `contentType='image/jpeg'`                      |
| UT-IMGDL-003 | 실패 시 wrapping        | axios.get 실패                        | `download({url})` | `Image download failed:`로 시작하는 Error throw |
| UT-IMGDL-004 | filename 추출 규칙      | 다양한 URL(쿼리/fragment/한글/슬래시) | `download({url})` | filename이 규칙대로 추출                        |

### `src/services/notionService.ts`

| ID            | 기능                                    | Given                                            | When                             | Then                                                       |
| ------------- | --------------------------------------- | ------------------------------------------------ | -------------------------------- | ---------------------------------------------------------- |
| UT-NOTION-001 | `queryPages` - filter/status only       | lastSyncTimestamp 없음, statusFilter=adding      | `queryPages(options)`            | Notion client request body에 status filter 포함            |
| UT-NOTION-002 | `queryPages` - timestamp filter         | lastSyncTimestamp 있음                           | `queryPages(options)`            | `last_edited_time.after`가 (lastSync-15m)로 설정           |
| UT-NOTION-003 | `queryPages` - pagination               | has_more=true 응답 연속                          | `queryPages()`                   | 모든 page가 누적되어 반환                                  |
| UT-NOTION-004 | `queryPages` - title/status 매핑        | 다양한 properties 형태(title/Title/Name, status) | `queryPages()`                   | `NotionPage.title/status`가 기대값                         |
| UT-NOTION-005 | `queryPages` - 실패 wrapping            | client.request 실패                              | `queryPages()`                   | `Notion query failed:`로 시작 Error throw                  |
| UT-NOTION-006 | `getPageHTML` - 이미지 placeholder 치환 | notion-to-md mdBlocks에 image 포함               | `getPageHTML(pageId)`            | images 배열 생성, html에는 placeholder가 남음              |
| UT-NOTION-007 | `getPageHTML` - callout 처리            | callout block + children                         | `getPageHTML(pageId)`            | callout이 paragraph로 변환되고 children이 같은 레벨로 이동 |
| UT-NOTION-008 | `getPageHTML` - 빈 페이지 처리          | mdString.parent=null                             | `getPageHTML(pageId)`            | html은 빈 문자열(또는 최소 html), throw 없음               |
| UT-NOTION-009 | `updatePageStatus` 호출 인자            | pageId/status                                    | `updatePageStatus(pageId, Done)` | client.pages.update가 올바른 properties로 호출             |
| UT-NOTION-010 | `updatePageStatus` 실패 wrapping        | update 실패                                      | `updatePageStatus()`             | `Failed to update page status:` Error throw                |

### `src/services/wpService.ts`

| ID        | 기능                             | Given                       | When                               | Then                                                        |
| --------- | -------------------------------- | --------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| UT-WP-001 | `createDraftPost` 상태 기본값    | status 미지정               | `createDraftPost({title,content})` | 요청 body status=`draft`                                    |
| UT-WP-002 | `createDraftPost` 응답 매핑      | WP 응답 (title.rendered 등) | `createDraftPost(...)`             | `{id,title,link,status}`로 변환                             |
| UT-WP-003 | `createDraftPost` 실패 wrapping  | axios post 실패             | `createDraftPost(...)`             | `WordPress post creation failed:` Error throw               |
| UT-WP-004 | `uploadMedia` form-data/alt_text | altText 있음/없음           | `uploadMedia(...)`                 | post 호출 및 응답 매핑 검증                                 |
| UT-WP-005 | `uploadMedia` 실패 wrapping      | axios post 실패             | `uploadMedia(...)`                 | `WordPress media upload failed:` Error throw                |
| UT-WP-006 | `deletePost` 성공/실패 wrapping  | delete 성공/실패            | `deletePost(id)`                   | 성공 시 resolve, 실패 시 `WordPress post deletion failed:`  |
| UT-WP-007 | `deleteMedia` 성공/실패 wrapping | delete 성공/실패            | `deleteMedia(id)`                  | 성공 시 resolve, 실패 시 `WordPress media deletion failed:` |
| UT-WP-008 | `replaceImageUrls` 다건 치환     | html + imageMap 다수        | `replaceImageUrls(html,map)`       | 모든 placeholder가 치환                                     |

### `src/services/telegramService.ts`

| ID        | 기능                        | Given                           | When                            | Then                                        |
| --------- | --------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------- |
| UT-TG-001 | disabled면 전송 스킵        | `telegramEnabled=false`         | `sendSyncNotification(...)`     | sendMessage 호출 없음                       |
| UT-TG-002 | enabled지만 credential 없음 | enabled=true, token/chatId 없음 | 생성자 실행                     | enabled가 false로 내려가고 sendMessage 없음 |
| UT-TG-003 | SyncJob 메시지 formatting   | SyncJob(Completed/Failed)       | `sendSyncNotification(syncJob)` | sendMessage 호출 msg에 Job ID/Counts 포함   |
| UT-TG-004 | string 메시지 formatting    | 문자열                          | `sendSyncNotification('x')`     | ⚠️ Notification 헤더 포함                   |
| UT-TG-005 | 전송 실패해도 throw 안 함   | sendMessage reject              | `sendSyncNotification(...)`     | 예외 throw 하지 않음                        |

### `src/db/index.ts` (SQLite)

| ID        | 기능                   | Given                             | When                            | Then                                |
| --------- | ---------------------- | --------------------------------- | ------------------------------- | ----------------------------------- |
| UT-DB-001 | initialize/close       | 테스트용 DB(`:memory:` 또는 파일) | `db.initialize()`/`db.close()`  | 스키마 생성, close 후 재사용 불가   |
| UT-DB-002 | create/get sync job    | jobType                           | `createSyncJob` 후 `getSyncJob` | 저장된 row 반환                     |
| UT-DB-003 | update sync job        | pages/status/errorMessage         | `updateSyncJob(id,updates)`     | row가 업데이트됨                    |
| UT-DB-004 | getLastSyncTimestamp   | completed job 존재                | `getLastSyncTimestamp()`        | 마지막 completed job timestamp 반환 |
| UT-DB-005 | create/update job item | jobId/pageId                      | create/update 호출              | status/wp_post_id/error 저장        |
| UT-DB-006 | image assets CRUD      | jobItemId, blockId 등             | create/update/get               | rows 반환/업데이트                  |
| UT-DB-007 | page_post_map CRUD     | notionPageId/wpPostId             | create/get                      | 매핑 조회 가능                      |

### `src/orchestrator/syncOrchestrator.ts`

| ID          | 기능                         | Given                           | When               | Then                                                       |
| ----------- | ---------------------------- | ------------------------------- | ------------------ | ---------------------------------------------------------- |
| UT-ORCH-001 | pages=0이면 null             | notionService.queryPages=[]     | `executeSyncJob()` | `null` 반환, job 생성 없음                                 |
| UT-ORCH-002 | 단일 페이지 성공             | page 1개, 이미지 0~N, wp 성공   | `executeSyncJob()` | DB job 완료, Notion status done 호출, telegram 호출        |
| UT-ORCH-003 | 다중 페이지 일부 실패        | page 2개 중 1개 실패            | `executeSyncJob()` | job Failed, errors 누적, 나머지 성공 유지                  |
| UT-ORCH-004 | fatal error 처리             | queryPages에서 throw            | `executeSyncJob()` | syncJob Failed 저장 및 throw                               |
| UT-ORCH-005 | 이미지 배치 처리             | maxConcurrent=2, 이미지 5개     | `executeSyncJob()` | 업로드 호출이 batch로 수행(동시성 제한)                    |
| UT-ORCH-006 | 이미지 업로드 실패 aggregate | 이미지 2개 중 1개 upload 실패   | `executeSyncJob()` | page 실패 처리 + rollback 시도                             |
| UT-ORCH-007 | WP post 생성 실패 rollback   | 이미지 업로드 후 post 생성 실패 | `executeSyncJob()` | deleteMedia/deletePost 호출 시도, Notion status error 호출 |

---

## Integration Tests (BDD, later)

> `tests/integration/`에서 작성 예정

| ID     | 기능                    | Given                          | When                  | Then                                |
| ------ | ----------------------- | ------------------------------ | --------------------- | ----------------------------------- |
| IT-001 | 단일 페이지 성공 동기화 | adding 페이지 1개              | scheduled/manual 실행 | WP draft 생성 + Notion done         |
| IT-002 | 다중 페이지 부분 성공   | adding 페이지 3개(2성공/1실패) | 실행                  | job Failed, errors=1                |
| IT-003 | 이미지 포함 페이지      | 이미지 포함 mdBlocks           | 실행                  | WP media 업로드 + html 치환         |
| IT-004 | WP post 생성 실패 롤백  | post 생성 실패                 | 실행                  | media/post 삭제 시도 + Notion error |
| IT-005 | 이미지 업로드 실패 롤백 | upload 실패                    | 실행                  | 실패한 page만 error 처리            |
| IT-006 | 증분 동기화             | lastSyncTimestamp 존재         | 실행                  | after filter가 적용됨               |
| IT-007 | 수동 CLI 종료 코드      | pages 존재/없음                | `sync:manual`         | status에 따른 exit code             |
