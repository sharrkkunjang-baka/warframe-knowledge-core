'use strict'

function createCraftingGraph(entries = []) {
  const identities = new Map(entries.map(entry => [entry.subject.officialUniqueName, entry]))
  const byResult = new Map(), byIngredient = new Map()
  for (const entry of entries) for (const recipe of entry.recipes || []) {
    byResult.set(recipe.resultUniqueName, recipe)
    for (const ingredient of recipe.ingredients || []) {
      const list = byIngredient.get(ingredient.uniqueName) || []
      list.push({ resultUniqueName: recipe.resultUniqueName, result: identities.get(recipe.resultUniqueName) || null, recipe, quantity: ingredient.quantity })
      byIngredient.set(ingredient.uniqueName, list)
    }
  }
  const recipesFor = uniqueName => byResult.has(uniqueName) ? [byResult.get(uniqueName)] : []
  const craftTo = uniqueName => byIngredient.get(uniqueName) || []
  function tree(uniqueName, maxDepth = 1, seen = new Set()) {
    if (maxDepth < 0 || seen.has(uniqueName)) return { uniqueName, cycle: seen.has(uniqueName), recipes: [] }
    const nextSeen = new Set(seen); nextSeen.add(uniqueName)
    return { uniqueName, recipes: recipesFor(uniqueName).map(recipe => ({ ...recipe, ingredients: recipe.ingredients.map(ingredient => ({ ...ingredient, tree: maxDepth ? tree(ingredient.uniqueName, maxDepth - 1, nextSeen) : null })) })) }
  }
  return { identities, byResult, byIngredient, recipesFor, craftTo, tree }
}

function formatDuration(seconds) {
  const value = Number(seconds || 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  const units = [[86400, '天'], [3600, '小时'], [60, '分钟']]
  let remaining = Math.round(value), text = ''
  for (const [size, label] of units) {
    const count = Math.floor(remaining / size)
    if (!count) continue
    text += `${count}${label}`
    remaining %= size
  }
  if (remaining || !text) text += `${remaining}秒`
  return text
}

function renderRecipe(recipe, identity) {
  const name = identity?.subject?.displayName || identity?.subject?.canonical || recipe.resultUniqueName
  const unresolved = recipe.ingredients.filter(item => !/^official-(?:zh|audited)$/.test(item.localizationStatus))
  if (unresolved.length) return `${name}的 DE 官方配方已收录，但有 ${unresolved.length} 项材料尚未接入官方简中身份，当前保持待审，禁止输出英文材料名。`
  const ingredients = recipe.ingredients.map(item => `${item.displayName} ×${item.quantity}`).join('、')
  return `${name}如何合成：${ingredients || '官方配方未列出材料'}${recipe.credits ? `；制造费用 ${recipe.credits} 星币` : ''}${recipe.buildTimeSeconds ? `；耗时 ${formatDuration(recipe.buildTimeSeconds)}` : ''}`
}

function renderCraftingUses(entry, graph) {
  const uniqueName = entry.subject.officialUniqueName
  const outgoing = graph.craftTo(uniqueName)
  const targets = [...new Set(outgoing.map(item => item.result?.subject?.displayName || item.result?.subject?.canonical).filter(Boolean))]
  return targets.length ? `1把${entry.subject.displayName}可合成为 ${targets.join('、')}` : ''
}

function renderCrafting(entry, graph) {
  const uniqueName = entry.subject.officialUniqueName
  const outgoing = graph.craftTo(uniqueName)
  const outgoingText = outgoing.length ? outgoing.map(item => `${entry.subject.displayName} ×${item.quantity} → ${item.result?.subject?.displayName || item.result?.subject?.canonical || item.resultUniqueName}`).join('\n') : `${entry.subject.displayName}没有被 DE 官方配方列为其他武器的材料。`
  const recipes = graph.recipesFor(uniqueName)
  const recipeText = recipes.length ? recipes.map(recipe => renderRecipe(recipe, entry)).join('\n') : `${entry.subject.displayName}没有 DE 官方制造配方。`
  return `【${entry.subject.displayName}】\n可以用于合成什么：\n${outgoingText}\n\n如何合成：\n${recipeText}`
}

module.exports = { createCraftingGraph, formatDuration, renderRecipe, renderCraftingUses, renderCrafting }
