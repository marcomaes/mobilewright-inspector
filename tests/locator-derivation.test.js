import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { deriveLocator, deriveElementList } from '../src/server/lib/locator-derivation.js'

function node(overrides = {}) {
  return { type: 'statictext', isVisible: true, bounds: { x: 0, y: 0, width: 100, height: 30 }, children: [], ...overrides }
}

// ---- Priority order ----

describe('deriveLocator — priority order', () => {
  test('testId (identifier) beats role, label, text', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'button', identifier: 'my-id', label: 'Label', text: 'Text' })),
      { kind: 'testId', value: 'my-id' }
    )
  })

  test('testId (resourceId) beats role, label, text', () => {
    assert.deepEqual(
      deriveLocator(node({ resourceId: 'com.example:id/btn', label: 'Tap me' })),
      { kind: 'testId', value: 'com.example:id/btn' }
    )
  })

  test('identifier takes precedence over resourceId', () => {
    assert.deepEqual(
      deriveLocator(node({ identifier: 'first', resourceId: 'second' })),
      { kind: 'testId', value: 'first' }
    )
  })

  test('role beats label and text', () => {
    const result = deriveLocator(node({ type: 'button', label: 'Tap', text: 'Tap me' }))
    assert.equal(result?.kind, 'role')
    assert.equal(result?.value, 'button')
  })

  test('label beats text', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'unknown', label: 'My Label', text: 'My Text' })),
      { kind: 'label', value: 'My Label' }
    )
  })

  test('text used when no label and no role', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'unknown', text: 'Hello' })),
      { kind: 'text', value: 'Hello' }
    )
  })

  test('value used as text fallback', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'unknown', value: 'typed' })),
      { kind: 'text', value: 'typed' }
    )
  })

  test('returns null when nothing available', () => {
    assert.equal(deriveLocator(node({ type: 'unknown' })), null)
  })
})

// ---- Role: name field ----

describe('deriveLocator — role name', () => {
  test('role includes name from label', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'button', label: 'Submit' })),
      { kind: 'role', value: 'button', name: 'Submit' }
    )
  })

  test('role includes name from text when no label', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'button', text: 'OK' })),
      { kind: 'role', value: 'button', name: 'OK' }
    )
  })

  test('role with no label or text has undefined name', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'button' })),
      { kind: 'role', value: 'button', name: undefined }
    )
  })
})

// ---- Role type mapping ----

describe('deriveLocator — role type mapping', () => {
  const cases = [
    ['button',            'button'],
    ['imagebutton',       'button'],
    ['textfield',         'textfield'],
    ['securetextfield',   'textfield'],
    ['edittext',          'textfield'],
    ['searchfield',       'textfield'],
    ['reactedittext',     'textfield'],
    ['statictext',        'text'],
    ['textview',          'text'],
    ['text',              'text'],
    ['image',             'image'],
    ['imageview',         'image'],
    ['reactimageview',    'image'],
    ['switch',            'switch'],
    ['toggle',            'switch'],
    ['checkbox',          'checkbox'],
    ['slider',            'slider'],
    ['seekbar',           'slider'],
    ['table',             'list'],
    ['collectionview',    'list'],
    ['listview',          'list'],
    ['recyclerview',      'list'],
    ['scrollview',        'list'],
    ['reactscrollview',   'list'],
    ['cell',              'listitem'],
    ['linearlayout',      'listitem'],
    ['relativelayout',    'listitem'],
    ['tab',               'tab'],
    ['tabbar',            'tab'],
    ['link',              'link'],
    ['navigationbar',     'header'],
    ['toolbar',           'header'],
    ['header',            'header'],
  ]

  for (const [type, expectedRole] of cases) {
    test(`${type} -> ${expectedRole}`, () => {
      const result = deriveLocator(node({ type }))
      assert.equal(result?.kind, 'role')
      assert.equal(result?.value, expectedRole)
    })
  }

  test('unknown type does not get a role', () => {
    assert.notEqual(deriveLocator(node({ type: 'unknownwidget' }))?.kind, 'role')
  })

  test('other type does not map to listitem', () => {
    const result = deriveLocator(node({ type: 'other' }))
    assert.notEqual(result?.value, 'listitem')
  })
})

// ---- Type is case-insensitive ----

describe('deriveLocator — case insensitive type', () => {
  test('BUTTON maps to button role', () => {
    const result = deriveLocator(node({ type: 'BUTTON' }))
    assert.equal(result?.kind, 'role')
    assert.equal(result?.value, 'button')
  })

  test('MixedCase maps correctly', () => {
    const result = deriveLocator(node({ type: 'StaticText' }))
    assert.equal(result?.kind, 'role')
    assert.equal(result?.value, 'text')
  })
})

// ---- reactviewgroup special case ----

describe('deriveLocator — reactviewgroup', () => {
  test('clickable=true -> button role', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'reactviewgroup', raw: { clickable: 'true' } })),
      { kind: 'role', value: 'button', name: undefined }
    )
  })

  test('accessible=true -> button role', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'reactviewgroup', raw: { accessible: 'true' } })),
      { kind: 'role', value: 'button', name: undefined }
    )
  })

  test('clickable=false falls through to label', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'reactviewgroup', label: 'wrapper', raw: { clickable: 'false' } })),
      { kind: 'label', value: 'wrapper' }
    )
  })

  test('no raw prop falls through to label', () => {
    assert.deepEqual(
      deriveLocator(node({ type: 'reactviewgroup', label: 'wrapper' })),
      { kind: 'label', value: 'wrapper' }
    )
  })

  test('non-clickable with no label returns null', () => {
    assert.equal(deriveLocator(node({ type: 'reactviewgroup' })), null)
  })
})

// ---- deriveElementList ----

describe('deriveElementList', () => {
  test('empty input returns empty array', () => {
    assert.deepEqual(deriveElementList([]), [])
  })

  test('flattens nested tree depth-first', () => {
    // cell -> listitem role; label goes into locator.name, not locator.value
    const roots = [
      node({ type: 'table', identifier: 'list', children: [
        node({ type: 'cell', label: 'Row 1', children: [] }),
        node({ type: 'cell', label: 'Row 2', children: [] }),
      ]}),
    ]
    const result = deriveElementList(roots)
    assert.equal(result.length, 3)
    assert.equal(result[0].locator?.kind, 'testId')
    assert.equal(result[0].locator?.value, 'list')
    assert.equal(result[1].locator?.kind, 'role')
    assert.equal(result[1].locator?.value, 'listitem')
    assert.equal(result[1].locator?.name, 'Row 1')
    assert.equal(result[2].locator?.name, 'Row 2')
  })

  test('includes nodes with no locator', () => {
    const result = deriveElementList([node({ type: 'unknown' })])
    assert.equal(result.length, 1)
    assert.equal(result[0].locator, null)
  })

  test('each entry has node and locator fields', () => {
    const root = node({ type: 'button', label: 'Go' })
    const result = deriveElementList([root])
    assert.ok('node' in result[0])
    assert.ok('locator' in result[0])
    assert.equal(result[0].node, root)
  })

  test('deeply nested tree flattened correctly', () => {
    // statictext -> text role (name='Mid'); button -> button role (name='Deep')
    const deep = node({ type: 'button', label: 'Deep', children: [] })
    const mid = node({ type: 'statictext', text: 'Mid', children: [deep] })
    const root = node({ identifier: 'root', children: [mid] })
    const result = deriveElementList([root])
    assert.equal(result.length, 3)
    assert.equal(result[0].locator?.value, 'root')
    assert.equal(result[1].locator?.kind, 'role')
    assert.equal(result[1].locator?.name, 'Mid')
    assert.equal(result[2].locator?.kind, 'role')
    assert.equal(result[2].locator?.name, 'Deep')
  })
})
