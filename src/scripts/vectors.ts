import { chroma } from 'lib/chroma';

const collection = await chroma.createCollection({ name: 'test-from-js' });
for (let index = 0; index < 20; index++) {
  await collection.add({
    documents: ['test'],
    embeddings: [1, 2, 3, 4, 5],
    ids: ['test-id-' + index.toString()],
  });
}

const queryData = await collection.query({
  queryEmbeddings: [1, 2, 3, 4, 5],
  queryTexts: ['test'],
});

console.log(queryData);
