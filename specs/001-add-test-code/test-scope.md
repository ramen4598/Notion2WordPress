# Test Scope

이 문서는 현재 코드베이스 기준으로 "무엇을 테스트할지"를 케이스 중심으로 정리한다.

## Unit Test Targets

### Test Data / Fixtures Policy

- Notion block 더미데이터는 사용자가 제공하며 `tests/helpers/` 아래에 둔다.
- 테스트는 해당 더미데이터를 import하여 재사용한다.

### External API Policy

- 외부 API(Notion/WordPress/Telegram)는 모두 mock 처리한다.
- 네트워크 호출 자체를 막고, "무슨 값으로 호출됐는지"를 검증한다.

### SQLite Policy

- SQLite는 mock 하지 않고 실제로 생성/사용한다.
- 테스트마다 DB를 초기화한다.
- 기본은 `:memory:` DB를 사용하고, 어려우면 `tests/data/`에 파일 DB를 생성한다.

### `src/lib/utils.ts`

- `isRecord`
  - `null` → `false`
  - primitive(string/number/boolean/undefined) → `false`
  - object/array/date → `true`
  - function → `false`
- `asError`
  - `Error` 입력 시 동일 인스턴스 반환
  - string/number/boolean/null/undefined/object/array 입력 시 `Error`로 변환

### `src/lib/retry.ts` (`retryWithBackoff`)

- 첫 시도 성공 시 재시도 없음
- N번 실패 후 성공 시, 호출 횟수/반환값 검증
- 최대 시도 횟수 초과 시 마지막 에러 throw
- `onRetry` 콜백 호출 횟수/인자 검증

### `src/lib/imageDownloader.ts` (`imageDownloader.download`)

- axios 성공 응답 시:
  - filename 추출 규칙
  - hash(SHA256) 생성
  - content-type 기본값 처리
- axios 실패 시: 최종 에러 메시지/로깅
- URL sanitize 로깅 포맷

### `src/services/notionService.ts`

- `queryPages`
  - filter/status/lastSyncTimestamp 조합에 따른 request body 구성
  - pagination 처리(`has_more`/`next_cursor`)
  - 응답 page → `NotionPage` 매핑(title/status 추출 포함)
  - 실패 시 에러 wrapping 메시지
- `getPageHTML`
  - markdown → html 변환됨
  - callout 처리
  - image 추출(placeholder 치환)
  - 빈 페이지(내용 없음) 처리
  - 실패 시 에러 wrapping 메시지
- `updatePageStatus`
  - 업데이트 request 구성
  - 실패 시 에러 wrapping 메시지

### `src/services/wpService.ts`

- `createDraftPost`
  - 상태 기본값 `draft`
  - 성공 시 id/title/link/status 매핑
  - 실패 시 에러 wrapping 메시지 (axios error 포함)
- `uploadMedia`
  - form-data 구성
  - altText 포함/미포함
  - 실패 시 에러 wrapping 메시지
- `deletePost`/`deleteMedia`
  - 성공/실패(에러 wrapping 메시지)
- `replaceImageUrls`
  - placeholder 다건 치환
  - placeholder가 regex에 영향받지 않는지 확인(현재는 `new RegExp(placeholder,'g')`)

### `src/services/telegramService.ts`

- `sendSyncNotification`
  - telegram disabled 시 early return
  - enabled but credentials missing 시 비활성화 처리
  - SyncJob 메시지 포맷
  - string 메시지 포맷
  - 전송 실패해도 throw 하지 않음

### `src/orchestrator/syncOrchestrator.ts`

- `executeSyncJob`
  - pages=0 → `null` 반환
  - pages>0:
    - 성공 시 job status 완료, db 업데이트, telegram 알림
    - 일부 실패 시 job status failed, errors 누적
    - fatal error 시 job error 저장 + throw
- 이미지 동기화:
  - batch 처리(`maxConcurrentImageDownloads`)
  - image upload 실패 시 aggregate error
- rollback:
  - media/post 삭제 시도 및 notion 상태 error 업데이트
  - db job item failed 처리

### `src/db/index.ts`

- initialize/close
- create/update/get 동작 및 스키마 반영
- last sync timestamp 조회

## Integration Test Targets (BDD)

> `tests/integration/`에서 추후 작성

- 단일 페이지 성공 동기화
- 다중 페이지 부분 성공
- 이미지 포함 페이지 동기화
- WP post 생성 실패 롤백
- 이미지 업로드 실패 롤백
- Telegram 알림 전송
- 증분 동기화(last sync timestamp)
- 수동 CLI 실행(종료 코드)
