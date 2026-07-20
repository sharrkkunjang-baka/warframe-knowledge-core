'use strict';

function normalize(value) {
  return String(value || '').normalize('NFKC').trim();
}

function parseKnowledgeReference(value) {
  if (value && typeof value === 'object') {
    const query = normalize(value.query || value.id || value.title);
    return query ? { query, id: normalize(value.id), title: normalize(value.title) || query } : null;
  }
  const text = normalize(value);
  if (!text) return null;
  const command = text.match(/^刷\s+(.+)$/);
  if (command) return { query: normalize(command[1]), id: '', title: normalize(command[1]) };
  const token = text.match(/^\{(?:知识引用|玩法引用)\|([^{}|]+)\}$/);
  if (token) return { query: normalize(token[1]), id: '', title: normalize(token[1]) };
  return null;
}

function defaultRender(result) {
  const entry = result?.entry || result;
  if (!entry) return '';
  const lines = [entry.summary || entry.content];
  if (entry.steps?.length) lines.push(`步骤：\n${entry.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`);
  if (entry.notes?.length) lines.push(`注意：\n${entry.notes.map(note => `- ${note}`).join('\n')}`);
  return lines.filter(Boolean).join('\n\n');
}

function nestedReferences(result) {
  const entry = result?.entry || result;
  return [...(entry?.references || []), ...(entry?.methodRefs || []), ...(entry?.sourceOptions || [])];
}

function expandKnowledgeReferences(references, options = {}) {
  const resolve = options.resolve || (() => null);
  const render = options.render || defaultRender;
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 4;
  const output = [];
  const emitted = new Set();

  function visit(raw, depth, stack) {
    const reference = parseKnowledgeReference(raw);
    if (!reference) return;
    const key = reference.id || reference.query;
    if (depth > maxDepth) {
      const text = `引用展开已停止：超过${maxDepth}层（${reference.title}）`;
      if (!emitted.has(text)) output.push({ status: 'depth-limit', text, reference });
      emitted.add(text);
      return;
    }
    if (stack.includes(key)) {
      const text = `引用展开已停止：检测到循环（${[...stack, key].join(' → ')}）`;
      if (!emitted.has(text)) output.push({ status: 'cycle', text, reference });
      emitted.add(text);
      return;
    }
    const result = resolve(reference.id || reference.query);
    if (!result) {
      const text = `明确缺失：未找到“${reference.title}”的审核知识正文`;
      if (!emitted.has(text)) output.push({ status: 'missing', text, reference });
      emitted.add(text);
      return;
    }
    const text = normalize(render(result));
    if (text && !emitted.has(text)) {
      output.push({
        status: 'expanded',
        text,
        reference,
        sourceId: result.entry?.id || result.id || reference.id || null
      });
      emitted.add(text);
    }
    for (const nested of nestedReferences(result)) visit(nested, depth + 1, [...stack, key]);
  }

  for (const reference of references || []) visit(reference, 0, []);
  return output;
}

module.exports = { parseKnowledgeReference, expandKnowledgeReferences, defaultRender };
