# Tasks

> 이 체크리스트를 기준으로, 위에서부터 순서대로 테스트를 구현한다.

## 0) Test Infra / Helpers

- [x] T-INFRA-001 `tests/helpers/`에 Notion block 더미데이터 파일 추가(사용자 제공 후 반영)
- [x] T-INFRA-002 `tests/helpers/db-helper.ts` 구현: `createTestDb()`로 `:memory:` 초기화 + 스키마 로드 + teardown
- [x] T-INFRA-003 `tests/helpers/mock-helper.ts` 구현: Notion/WP/Telegram mock 생성 및 호출 인자 조회 헬퍼

## 1) Unit - utils

- [x] UT-UTILS-001 `isRecord(null)`은 false
- [x] UT-UTILS-002 `isRecord(primitive)`는 false
- [x] UT-UTILS-003 `isRecord(object/array/date)`는 true
- [x] UT-UTILS-004 `isRecord(function)`은 false
- [x] UT-UTILS-005 `asError(Error)`는 동일 인스턴스
- [x] UT-UTILS-006 `asError(non-Error)`는 Error로 변환

## 2) Unit - retry

- [x] UT-RETRY-001 첫 시도 성공
- [x] UT-RETRY-002 N회 실패 후 성공
- [x] UT-RETRY-003 최대 시도 초과 시 throw
- [x] UT-RETRY-004 `onRetry` 호출 검증

## 3) Unit - imageDownloader

- [x] UT-IMGDL-001 정상 다운로드/해시 생성
- [x] UT-IMGDL-002 content-type 기본값 적용
- [x] UT-IMGDL-003 실패 시 wrapping 에러
- [x] UT-IMGDL-004 filename 추출 규칙

## 4) Unit - notionService

- [x] UT-NOTION-001 queryPages: status filter only
- [x] UT-NOTION-002 queryPages: lastSyncTimestamp → after filter(-15m)
- [x] UT-NOTION-003 queryPages: pagination 누적
- [x] UT-NOTION-004 queryPages: title/status 매핑
- [x] UT-NOTION-005 queryPages: 실패 wrapping
- [x] UT-NOTION-006 getPageHTML: 이미지 placeholder 치환
- [x] UT-NOTION-007 getPageHTML: callout 처리
- [x] UT-NOTION-008 getPageHTML: 빈 페이지 처리
- [x] UT-NOTION-009 updatePageStatus: 호출 인자 검증
- [x] UT-NOTION-010 updatePageStatus: 실패 wrapping

## 5) Unit - wpService

- [x] UT-WP-001 createDraftPost: status 기본값 draft
- [x] UT-WP-002 createDraftPost: 응답 매핑
- [x] UT-WP-003 createDraftPost: 실패 wrapping
- [x] UT-WP-004 uploadMedia: form-data/alt_text 처리
- [x] UT-WP-005 uploadMedia: 실패 wrapping
- [x] UT-WP-006 deletePost: 성공/실패 wrapping
- [x] UT-WP-007 deleteMedia: 성공/실패 wrapping
- [x] UT-WP-008 replaceImageUrls: 다건 치환

## 6) Unit - telegramService

- [x] UT-TG-001 disabled면 전송 스킵
- [x] UT-TG-002 enabled but credential missing → 비활성화
- [x] UT-TG-003 SyncJob 메시지 formatting
- [x] UT-TG-004 string 메시지 formatting
- [x] UT-TG-005 전송 실패해도 throw 안 함

## 7) Unit - db (SQLite)

- [x] UT-DB-001 initialize/close
- [x] UT-DB-002 create/get sync job
- [x] UT-DB-003 update sync job
- [x] UT-DB-004 getLastSyncTimestamp
- [x] UT-DB-005 create/update job item
- [x] UT-DB-006 image assets CRUD
- [x] UT-DB-007 page_post_map CRUD

## 8) Unit - syncOrchestrator

- [x] UT-ORCH-001 pages=0이면 null
- [x] UT-ORCH-002 단일 페이지 성공
- [x] UT-ORCH-003 다중 페이지 일부 실패
- [x] UT-ORCH-004 fatal error 처리
- [x] UT-ORCH-005 이미지 배치 처리(동시성 제한)
- [x] UT-ORCH-006 이미지 업로드 실패 aggregate
- [x] UT-ORCH-007 WP post 생성 실패 rollback

## 9) Integration (later)

- [ ] IT-001 단일 페이지 성공 동기화
- [ ] IT-002 다중 페이지 부분 성공
- [ ] IT-003 이미지 포함 페이지
- [ ] IT-004 WP post 생성 실패 롤백
- [ ] IT-005 이미지 업로드 실패 롤백
- [ ] IT-006 증분 동기화
- [ ] IT-007 수동 CLI 종료 코드
