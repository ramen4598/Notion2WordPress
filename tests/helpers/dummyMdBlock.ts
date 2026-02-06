export const mdBlockEmpty = [] as const;

export const mdBlockTextOnly = [
  {
    type: 'paragraph',
    blockId: '2f8a3a2b-1013-807d-8dad-e9f4230ddc73',
    parent: 'Text Only',
    children: [],
  },
]; 

export const mdBlockSingleImage = [
  {
    type: 'image',
    blockId: '2f8a3a2b-1013-80c6-9688-fedd0614bf2d',
    parent:
      '![img1.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
    children: [],
  },
];

export const mdBlockMultiImageSameLevel = [
  {
    type: 'column_list',
    blockId: '2f8a3a2b-1013-8032-af17-dec644930c5d',
    parent: '',
    children: [
      {
        type: 'column',
        blockId: '2f8a3a2b-1013-80a7-8a14-fc20fbd08abf',
        parent: '',
        children: [
          {
            type: 'image',
            blockId: '2f8a3a2b-1013-80a3-85e1-d5bcb41cb778',
            parent:
              '![img1](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
            children: [],
          },
        ],
      },
      {
        type: 'column',
        blockId: '2f8a3a2b-1013-806a-ae72-fed0c0cb5c32',
        parent: '',
        children: [
          {
            type: 'image',
            blockId: '2f8a3a2b-1013-8044-ba1f-e59dfa09ffe4',
            parent:
              '![img2](https://prod-files-secure.s3.us-west-2.amazonaws.com/img2.png)',
            children: [],
          },
        ],
      },
    ],
  },
];

export const mdBlockImageNestedInChildren = [
  {
    type: 'bulleted_list_item',
    blockId: '2f8a3a2b-1013-80f2-9a9a-c6cd927d8dd5',
    parent: '- parent1',
    children: [
      {
        type: 'image',
        blockId: '2f8a3a2b-1013-808a-9498-e59ed6dff209',
        parent:
          '![img1](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
        children: [],
      },
    ],
  },
  {
    type: 'bulleted_list_item',
    blockId: '2f8a3a2b-1013-8003-84a6-c6442f68c711',
    parent: '- parent2',
    children: [
      {
        type: 'image',
        blockId: '2f8a3a2b-1013-8050-b0ea-dc1fe2dac338',
        parent:
          '![img2](https://prod-files-secure.s3.us-west-2.amazonaws.com/img2.png)',
        children: [],
      },
    ],
  },
];

export const mdBlockCalloutNoChildren = [
  {
    type: 'callout',
    blockId: '2f8a3a2b-1013-8051-b50b-e3fffdef56f4',
    parent: '> 💡 just parent no children',
    children: [],
  },
]; 

export const mdBlockCalloutWithChildren = [
  {
    type: 'callout',
    blockId: '2f8a3a2b-1013-80ff-8d70-c14cca1ebe22',
    parent:
      '> 💡 parent  \n> paragraph1  \n>   \n> ![img1](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
    children: [
      {
        type: 'paragraph',
        blockId: '2f8a3a2b-1013-804a-a25d-e0006a57ba6a',
        parent: 'paragraph1',
        children: [],
      },
      {
        type: 'image',
        blockId: '2f8a3a2b-1013-806c-829f-fc10ac1b30bd',
        parent:
          '![img1](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
        children: [],
      },
    ],
  },
];

export const mdBlockCalloutWithImageMarkdownInParent = [
  {
    type: 'callout',
    blockId: '2f8a3a2b-1013-8039-83db-eaefed36d71f',
    parent:
      '> 💡 ![img1.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
    children: [
      {
        type: 'image',
        blockId: '2f8a3a2b-1013-80f2-a19c-ccbdc84bfa85',
        parent:
          '![img1.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
        children: [],
      },
    ],
  },
];

export const mdBlockCalloutNested = [
  {
    type: 'callout',
    blockId: '2f8a3a2b-1013-803a-8153-e6269e9c7ce0',
    parent:
      '> 💡 callout 1  \n> paragraph  \n>   \n> > 💡 callout 2    \n> > - list    \n> >     \n> > > 💡 callout 3      \n> > > ![img3.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img3.png)',
    children: [
      {
        type: 'paragraph',
        blockId: '2f8a3a2b-1013-805a-9d6a-fb529a74daf6',
        parent: 'paragraph',
        children: [],
      },
      {
        type: 'callout',
        blockId: '2f8a3a2b-1013-80d2-9c5e-f61fafbc4ce2',
        parent:
          '> 💡 callout 2  \n> - list  \n>   \n> > 💡 callout 3    \n> > ![img3.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img3.png)',
        children: [
          {
            type: 'bulleted_list_item',
            blockId: '2f8a3a2b-1013-80e0-907c-f39a08bc9ca7',
            parent: '- list',
            children: [],
          },
          {
            type: 'callout',
            blockId: '2f8a3a2b-1013-8043-ac6d-d89e4635c3d0',
            parent:
              '> 💡 callout 3  \n> ![img3.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img3.png)',
            children: [
              {
                type: 'image',
                blockId: '2f8a3a2b-1013-809d-a793-f599b351c07e',
                parent:
                  '![img3.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img3.png)',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: 'paragraph',
    blockId: '2f8a3a2b-1013-807f-b364-edf2b8656d02',
    parent: '',
    children: [],
  },
];