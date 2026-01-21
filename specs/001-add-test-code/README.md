# 001 - Add Test Code

## Goal

대대적인 리팩터링 이후에도 기존 동작을 보장하기 위해 테스트 코드를 보강한다.

- 우선 **현재 제공 기능을 파악**한다.
- 가능한 한 **모든 경우의 수(성공/실패/부분 실패/예외/빈 입력)** 를 테스트로 고정한다.
- 기본 방향은 **BDD(행위 중심)** 이며, 필요 시 **메서드 단위 유닛 테스트**를 추가한다.

## Decisions

- **D1. 통합 테스트 디렉터리 분리**: `tests/integration/`를 새로 만든다.
- **D2. Mocking 최소화**: 추가 라이브러리를 최대한 쓰지 않는다.
  - 가능한 범위에서 Vitest의 `vi.mock()`/`vi.spyOn()`만 사용한다.
- **D3. 작성 순서**: 순서 중요하지 않으나, 착수는 **유닛 테스트부터** 진행한다.
- **D4. Notion block 더미데이터 위치**: 더미데이터는 `tests/helpers/` 아래에 둔다(사용자가 제공).
- **D5. 외부 API 정책**: Notion/WP/Telegram은 모두 mock 하고, 호출 인자(어떤 값으로 호출됐는지)를 검증한다.
- **D6. SQLite 정책**: 실제 SQLite를 사용하되 테스트마다 초기화한다.
  - 1순위: `:memory:`
  - 대안: `tests/data/`에 테스트 DB 파일 생성

## Current Project Summary

### System Overview

Notion의 페이지(상태가 `adding`)를 감지하여 WordPress에 **초안(draft) 글**로 생성하고,
이미지가 있으면 다운로드 후 WordPress Media로 업로드한 뒤 HTML 내 URL을 치환한다.
작업 결과는 SQLite로 추적하고, 필요 시 Telegram 알림을 전송한다.

### Core Modules

- `src/orchestrator/syncOrchestrator.ts`: 전체 동기화 흐름(페이지별 처리/이미지 업로드/롤백/알림)
- `src/services/notionService.ts`: Notion 쿼리, 페이지 → HTML 변환, 상태 업데이트
- `src/services/wpService.ts`: WP REST API(게시물/미디어 생성 및 삭제, HTML 이미지 URL 치환)
- `src/services/telegramService.ts`: 동기화 결과 알림
- `src/db/index.ts`: SQLite 스키마 초기화, 작업/아이템/이미지/매핑 저장
- `src/lib/imageDownloader.ts`: 이미지 다운로드 + 해시/파일명 처리
- `src/lib/retry.ts`: retry/backoff
- `src/lib/utils.ts`: `isRecord`, `asError`

### Key Behaviors (as-is)

- 동기화 대상: Notion 페이지 status가 `adding`
- 성공 시: WP draft 생성 → Notion status를 `done`으로 변경 → DB 상태 반영 → Telegram 알림
- 실패 시: 부분 생성물 롤백(미디어/게시물 삭제 시도) → Notion status를 `error`로 변경 → DB 상태 반영 → Telegram 알림
- 스케줄 실행: `src/index.ts`에서 cron으로 주기 실행
- 수동 실행: `src/cli/syncManual.ts`

## Testing Strategy

### What We Test

1. **Unit Tests (first)**
   - 각 서비스/핵심 유틸의 성공/실패/엣지케이스를 `vi.mock()`으로 외부 의존성을 끊고 검증한다.
2. **Integration Tests (later)**
   - `tests/integration/`에서 오케스트레이터 관점의 시나리오를 BDD 스타일로 검증한다.
   - 단, 실제 네트워크 호출은 하지 않으며, Notion/WP/Telegram/DB는 mock 또는 테스트 전용 구성으로 고정한다.

### Non-Goals

- 실제 Notion/WordPress/Telegram 네트워크 연동(E2E)은 이번 범위에서 제외한다.
- 별도 mocking 라이브러리 추가는 지양한다(필요성이 명확해질 때만 재논의).

## Next Steps

- 유닛테스트부터 시작: 기존 skeleton(`tests/unit/**`)을 실제 테스트로 채운다.
- 이후 BDD 시나리오를 `tests/integration/**`로 확장한다.
