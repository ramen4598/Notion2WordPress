// 0 page response
export const zeroPageResponse = {
  object: 'list',
  results: [],
  next_cursor: null,
  has_more: false,
  type: 'page_or_data_source',
  page_or_data_source: {},
  request_id: '57255372-fe02-4686-8f94-692e2f2647ff',
} as const;

// 1 page response without pagination
export const onePageResponse = {
  object: 'list',
  results: [
    {
      object: 'page',
      id: '2f8a3a2b-1013-80f6-9b25-eb702a94328c',
      created_time: '2026-01-30T12:40:00.000Z',
      last_edited_time: '2026-01-30T14:06:00.000Z',
      created_by: {
        object: 'user',
        id: '2c2e3281-7359-40a0-81ff-1959f6a3a953',
      },
      last_edited_by: {
        object: 'user',
        id: '2c2e3281-7359-40a0-81ff-1959f6a3a953',
      },
      cover: null,
      icon: null,
      parent: {
        type: 'data_source_id',
        data_source_id: '2bba3a2b-1013-81f7-90bc-000ba4902676',
        database_id: '2bba3a2b-1013-81c6-9fea-fab736f752a2',
      },
      archived: false,
      in_trash: false,
      is_locked: false,
      properties: {
        '최종 편집 일시': {
          id: 'F%5E%3Dj',
          type: 'last_edited_time',
          last_edited_time: '2026-01-30T14:06:00.000Z',
        },
        status: {
          id: 'tWa%3D',
          type: 'status',
          status: {
            id: 'fee952f0-6907-4970-8dd4-58187d77c0bb',
            name: 'adding',
            color: 'blue',
          },
        },
        '생성 일시': {
          id: 'uPjf',
          type: 'created_time',
          created_time: '2026-01-30T12:40:00.000Z',
        },
        title: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: 'query_single_page', link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: 'query_single_page',
              href: null,
            },
          ],
        },
      },
      url: 'https://www.notion.so/query_single_page-2f8a3a2b101380f69b25eb702a94328c',
      public_url: null,
    },
  ],
  next_cursor: null,
  has_more: false,
  type: 'page_or_data_source',
  page_or_data_source: {},
  request_id: '0f6d5901-b3b9-4564-8b78-4f2dadab4a05',
};

// 2 pages response with pagination
export const twoPagesResponseWithPagination_1 = {
  object: 'list',
  results: [
    {
      object: 'page',
      id: '2f8a3a2b-1013-80d2-9534-d4074ed53f23',
      created_time: '2026-01-30T12:40:00.000Z',
      last_edited_time: '2026-01-30T14:17:00.000Z',
      created_by: {
        object: 'user',
        id: '2c2e3281-7359-40a0-81ff-1959f6a3a953',
      },
      last_edited_by: {
        object: 'user',
        id: '2c2e3281-7359-40a0-81ff-1959f6a3a953',
      },
      cover: null,
      icon: null,
      parent: {
        type: 'data_source_id',
        data_source_id: '2bba3a2b-1013-81f7-90bc-000ba4902676',
        database_id: '2bba3a2b-1013-81c6-9fea-fab736f752a2',
      },
      archived: false,
      in_trash: false,
      is_locked: false,
      properties: {
        '최종 편집 일시': {
          id: 'F%5E%3Dj',
          type: 'last_edited_time',
          last_edited_time: '2026-01-30T14:17:00.000Z',
        },
        status: {
          id: 'tWa%3D',
          type: 'status',
          status: {
            id: 'fee952f0-6907-4970-8dd4-58187d77c0bb',
            name: 'adding',
            color: 'blue',
          },
        },
        '생성 일시': {
          id: 'uPjf',
          type: 'created_time',
          created_time: '2026-01-30T12:40:00.000Z',
        },
        title: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: 'query_two_pages_1', link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: 'query_two_pages_1',
              href: null,
            },
          ],
        },
      },
      url: 'https://www.notion.so/query_two_pages_1-2f8a3a2b101380d29534d4074ed53f23',
      public_url: null,
    },
  ],
  next_cursor: '2f8a3a2b-1013-8089-a992-fe386c9158d4',
  has_more: true,
  type: 'page_or_data_source',
  page_or_data_source: {},
  request_id: '269b8738-81ee-4d2f-a774-0e1474b2d0b2',
} as const;

export const twoPagesResponseWithPagination_2 = {
  object: 'list',
  results: [
    {
      object: 'page',
      id: '2f8a3a2b-1013-8089-a992-fe386c9158d4',
      created_time: '2026-01-30T14:06:00.000Z',
      last_edited_time: '2026-01-30T14:17:00.000Z',
      created_by: {
        object: 'user',
        id: '2c2e3281-7359-40a0-81ff-1959f6a3a953',
      },
      last_edited_by: {
        object: 'user',
        id: '2c2e3281-7359-40a0-81ff-1959f6a3a953',
      },
      cover: null,
      icon: null,
      parent: {
        type: 'data_source_id',
        data_source_id: '2bba3a2b-1013-81f7-90bc-000ba4902676',
        database_id: '2bba3a2b-1013-81c6-9fea-fab736f752a2',
      },
      archived: false,
      in_trash: false,
      is_locked: false,
      properties: {
        '최종 편집 일시': {
          id: 'F%5E%3Dj',
          type: 'last_edited_time',
          last_edited_time: '2026-01-30T14:17:00.000Z',
        },
        status: {
          id: 'tWa%3D',
          type: 'status',
          status: {
            id: 'fee952f0-6907-4970-8dd4-58187d77c0bb',
            name: 'adding',
            color: 'blue',
          },
        },
        '생성 일시': {
          id: 'uPjf',
          type: 'created_time',
          created_time: '2026-01-30T14:06:00.000Z',
        },
        title: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: 'query_two_pages_2', link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: 'query_two_pages_2',
              href: null,
            },
          ],
        },
      },
      url: 'https://www.notion.so/query_two_pages_2-2f8a3a2b10138089a992fe386c9158d4',
      public_url: null,
    },
  ],
  next_cursor: null,
  has_more: false,
  type: 'page_or_data_source',
  page_or_data_source: {},
  request_id: '03544108-cbed-401c-8537-37468e341080',
} as const;
