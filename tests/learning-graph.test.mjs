import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningGraph, buildLearningPlan, lessonTarget } from '../src/lib/learning-graph.mjs';

test('chapter links prefer an exact code heading and otherwise use the chapter overview anchor', () => {
  const article = { url: '/study/handbook/core/', headings: [
    { text: 'CPP-01 入门', slug: 'first' },
    { text: 'CPP-10 RAII', slug: 'resource' },
  ] };
  assert.equal(lessonTarget({ id: 'CPP-01' }, article), '/study/handbook/core/#first');
  assert.equal(lessonTarget({ id: 'CPP-10' }, article), '/study/handbook/core/#resource');
  assert.equal(lessonTarget({ id: 'CPP-02' }, article), '/study/handbook/core/#lesson-cpp-02');
});

test('graph keeps every chapter, uses declared prerequisites, and orders route prerequisites before dependents', () => {
  const lessons = [
    { id: 'CPP-01', title: '环境', requires: [], readings: [{ ref: 'handbook/start' }] },
    { id: 'CPP-02', title: '程序', requires: ['CPP-01'], readings: [{ ref: 'handbook/start' }] },
    { id: 'CPP-50', title: '选读', requires: ['CPP-02'], readings: [{ ref: 'handbook/start' }] },
  ];
  const curriculum = [{ slug: 'cpp', title: 'C++', parts: [{ title: '起步', modules: [{ title: '语法', lessons }] }] }];
  const graph = buildLearningGraph(curriculum, [{ id: 'handbook/start', url: '/handbook/start/', headings: [] }]);
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.nodes[2].stage, -1);
  assert.deepEqual(graph.edges.map(({ source, target }) => [source, target]), [['CPP-01', 'CPP-02'], ['CPP-02', 'CPP-50']]);
  assert.ok(graph.route.indexOf('CPP-01') < graph.route.indexOf('CPP-02'));
  assert.deepEqual(graph.missing, []);
});

test('task flow preserves Git/CMake parallelism and removes redundant arrows', () => {
  const nodes = [
    { id: 'CPP-01', group: 'cpp', stage: 0, requires: [] },
    { id: 'ENG-09', group: 'engineering', stage: 1, requires: ['CPP-01'] },
    { id: 'ENG-29', group: 'engineering', stage: 1, requires: ['CPP-01'] },
    { id: 'ENG-39', group: 'engineering', stage: 1, requires: ['ENG-29'] },
    { id: 'ENG-43', group: 'engineering', stage: 1, requires: ['ENG-29', 'ENG-39'] },
    { id: 'CPP-50', group: 'cpp', stage: -1, requires: ['CPP-01'] },
  ];
  const plan = buildLearningPlan({ nodes, route: nodes.slice(0, 5).map(node => node.id), stages: [{ index: 0 }, { index: 1 }] });
  const tasks = new Map(plan.tasks.map(task => [task.id, task]));
  assert.equal(tasks.get('1-git').row, tasks.get('1-cmake').row);
  assert.deepEqual(tasks.get('1-debug').flowRequires, ['1-testing']);
  const assigned = [...plan.tasks.flatMap(task => task.lessons), ...plan.supplementary];
  assert.equal(assigned.length, nodes.length);
  assert.equal(new Set(assigned).size, nodes.length);
});
