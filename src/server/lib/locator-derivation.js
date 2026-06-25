// Derives the best mobilewright locator for every node in a ViewNode tree.
// Priority: Test ID > Role > Label > Text. Mirrors @mobilewright/core query-engine.ts.
// If mobilewright changes matching rules, update ROLE_TYPE_MAP below to stay in sync.

/** @type {Record<string, string[]>} */
const ROLE_TYPE_MAP = {
  button: ['button', 'imagebutton'],
  textfield: ['textfield', 'securetextfield', 'edittext', 'searchfield', 'reactedittext'],
  text: ['statictext', 'textview', 'text', 'reacttextview'],
  image: ['image', 'imageview', 'reactimageview'],
  switch: ['switch', 'toggle'],
  checkbox: ['checkbox'],
  slider: ['slider', 'seekbar'],
  list: ['table', 'collectionview', 'listview', 'recyclerview', 'scrollview', 'reactscrollview'],
  listitem: ['cell', 'linearlayout', 'relativelayout'],
  tab: ['tab', 'tabbar'],
  link: ['link'],
  header: ['navigationbar', 'toolbar', 'header'],
}

/**
 * @param {import('@mobilewright/protocol').ViewNode} node
 * @returns {string | null}
 */
function deriveRole(node) {
  const type = (node.type ?? '').toLowerCase()

  if (type === 'reactviewgroup') {
    const isClickable = node.raw?.['clickable'] === 'true' || node.raw?.['accessible'] === 'true'
    return isClickable ? 'button' : null
  }

  for (const [role, types] of Object.entries(ROLE_TYPE_MAP)) {
    if (types.includes(type)) return role
  }
  return null
}

/**
 * @param {import('@mobilewright/protocol').ViewNode} node
 * @returns {{ kind: 'testId' | 'role' | 'label' | 'text', value: string, name?: string } | null}
 */
export function deriveLocator(node) {
  const testId = node.identifier || node.resourceId
  if (testId) return { kind: 'testId', value: testId }

  const role = deriveRole(node)
  if (role) {
    const name = node.label || node.text || undefined
    return { kind: 'role', value: role, name }
  }

  if (node.label) return { kind: 'label', value: node.label }

  const text = node.text || node.value
  if (text) return { kind: 'text', value: text }

  return null
}

/**
 * Flatten a ViewNode forest and annotate every node with its derived locator.
 * @param {import('@mobilewright/protocol').ViewNode[]} roots
 * @returns {Array<{ node: import('@mobilewright/protocol').ViewNode, locator: ReturnType<typeof deriveLocator> }>}
 */
export function deriveElementList(roots) {
  const result = []

  function walk(nodes) {
    for (const node of nodes) {
      result.push({ node, locator: deriveLocator(node) })
      if (node.children?.length) walk(node.children)
    }
  }

  walk(roots)
  return result
}
