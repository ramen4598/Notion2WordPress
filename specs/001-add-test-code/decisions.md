# Decisions

## D1. `tests/integration/` 디렉터리 분리

- 통합 테스트/시나리오(BDD) 중심 테스트는 `tests/integration/`에 둔다.
- `tests/unit/`는 메서드/모듈 단위 테스트로 유지한다.

## D2. Mocking 최소화 (Vitest only)

- 가능한 한 Vitest의 mocking만 사용한다.
  - `vi.mock()`
  - `vi.spyOn()`
  - `vi.mocked()`
- 네트워크 mocking을 위한 추가 라이브러리(`nock`, `msw`)는 현재 단계에서는 도입하지 않는다.
  - 필요성이 명확해지면 재검토한다.

## D3. 작성 순서

- 순서는 중요하지 않으나, 착수는 유닛 테스트부터 한다.

## D4. Notion block 더미데이터는 `tests/helpers/` 아래

- 사용자가 Notion block 더미데이터를 구해 제공한다.
- 더미데이터는 `tests/helpers/` 아래에 두고 테스트에서 재사용한다.
  - 예: `tests/helpers/notion-blocks.ts` (또는 `tests/helpers/fixtures/notion-blocks.ts`)

## D5. 외부 API는 mock + 호출 인자 검증

- Notion / WordPress / Telegram API는 실제 네트워크 호출을 하지 않는다.
- `vi.mock()` 또는 `vi.spyOn()`으로 모킹하고, **어떤 값으로 호출됐는지**를 검증한다.

## D6. SQLite는 실제로 생성 (테스트 전용)

- 테스트에서는 SQLite를 **실제로 생성/사용**한다.
- 기본은 `:memory:`를 시도한다.
- `:memory:`로 어려움이 있으면 `tests/data/`에 테스트 DB 파일을 만든다.
- 테스트마다 DB를 초기화한다.
