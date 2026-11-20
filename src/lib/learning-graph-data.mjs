import { articles } from './catalog.mjs';
import { fullCurriculum } from './full-curriculum.mjs';
import { buildLearningGraph } from './learning-graph.mjs';

export async function learningGraphData() {
  const entries = await Promise.all(articles.map(async article => ({
    id: article.id, url: article.url, headings: await article.page.getHeadings(),
  })));
  return buildLearningGraph(fullCurriculum, entries);
}
