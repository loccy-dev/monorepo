// Pure TypeScript-AST extraction of the string values a dynamic key can take. Kept free of
// `vscode` so the resolution rules can be exercised on their own.

import ts from 'typescript'

/**
 * Which half of a const object's members a referring type stands for. `(typeof X)[keyof typeof X]`
 * is the value union and `keyof typeof X` the name union, so the type syntax decides on its own. A
 * reference carrying no such type is `both`: either half may reach a key, and offering both keeps a
 * live key from being reported unused at the cost of one spurious candidate.
 */
type MemberProjection = 'values' | 'names' | 'both'

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart() && position < node.getEnd()) {
      return ts.forEachChild(node, find) || node
    }
  }
  return find(sourceFile)
}

export function extractValuesFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  projection: MemberProjection = 'both',
): string[] {
  let current: ts.Node | undefined = node

  while (current) {
    if (ts.isEnumDeclaration(current)) {
      const values = current.members.flatMap((m) => {
        const name = m.name.getText(sourceFile)
        if (projection === 'names' || !m.initializer || !ts.isStringLiteral(m.initializer)) {
          return [name]
        }
        return projection === 'both' ? dedupe([m.initializer.text, name]) : [m.initializer.text]
      })

      if (values.length > 0) {
        return values
      }
    }

    // Type alias with union of string literals or typeof patterns
    if (ts.isTypeAliasDeclaration(current)) {
      const values = extractStringLiterals(current.type, sourceFile)
      if (values.length > 0) {
        return values
      }
    }

    // Variable declaration with const object (for typeof patterns)
    if (ts.isVariableDeclaration(current) && current.initializer) {
      const values = extractFromVariableDeclaration(current, sourceFile, projection)
      if (values.length > 0) {
        return values
      }
    }

    current = current.parent
  }

  return []
}

export function extractStringLiterals(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): string[] {
  const results: string[] = []

  if (ts.isUnionTypeNode(typeNode)) {
    typeNode.types.forEach((t) => {
      if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
        results.push(t.literal.text)
      }
    })
    return results
  }

  // `keyof typeof obj` — the member NAMES are what a key built from this type interpolates.
  if (ts.isTypeOperatorNode(typeNode) && typeNode.operator === ts.SyntaxKind.KeyOfKeyword) {
    const names = constObjectMembers(typeNode.type, sourceFile, 'names')
    if (names.length > 0) {
      return names
    }
  }

  // `typeof obj[keyof typeof obj]` or `(typeof obj)[keyof typeof obj]` — the member VALUES.
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    const values = constObjectMembers(typeNode.objectType, sourceFile, 'values')
    if (values.length > 0) {
      return values
    }
  }

  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    return [typeNode.literal.text]
  }

  return results
}

/** The members of the const object a `typeof obj` query names, when it resolves within this file. */
function constObjectMembers(typeNode: ts.TypeNode, sourceFile: ts.SourceFile, projection: MemberProjection): string[] {
  const objectType = ts.isParenthesizedTypeNode(typeNode) ? typeNode.type : typeNode
  if (!ts.isTypeQueryNode(objectType) || !ts.isIdentifier(objectType.exprName)) {
    return []
  }

  const objectDecl = findConstObjectDeclaration(sourceFile, objectType.exprName.text)
  return objectDecl ? extractValuesFromNode(objectDecl, sourceFile, projection) : []
}

function findConstObjectDeclaration(sourceFile: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
  let found: ts.VariableDeclaration | undefined

  function visit(node: ts.Node) {
    if (found) {
      return
    }

    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations.find((decl) => {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== name || !decl.initializer) {
          return false
        }

        // Direct object literal or "as const" pattern
        return (
          ts.isObjectLiteralExpression(decl.initializer) ||
          (ts.isAsExpression(decl.initializer) && ts.isObjectLiteralExpression(decl.initializer.expression))
        )
      })

      if (declaration) {
        found = declaration
        return
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function extractFromVariableDeclaration(
  declaration: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  projection: MemberProjection,
): string[] {
  if (!declaration.initializer) {
    return []
  }

  const initializer = declaration.initializer

  // Direct object literal: const foo = { A: "A", B: "B" }
  if (ts.isObjectLiteralExpression(initializer)) {
    return extractFromObjectLiteral(initializer, sourceFile, projection)
  }

  // As const expression: const foo = { A: "A" } as const
  if (ts.isAsExpression(initializer) && ts.isObjectLiteralExpression(initializer.expression)) {
    return extractFromObjectLiteral(initializer.expression, sourceFile, projection)
  }

  // String literal: const foo = "value"
  if (ts.isStringLiteral(initializer)) {
    return [initializer.text]
  }

  return []
}

function extractFromObjectLiteral(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  projection: MemberProjection,
): string[] {
  return objectLiteral.properties.filter(ts.isPropertyAssignment).flatMap((prop) => {
    const name = prop.name.getText(sourceFile).replace(/["']/g, '')
    const { initializer } = prop
    // A value that is not a string literal cannot appear in a key, so the name is all there is.
    const value =
      ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer) ? initializer.text : name

    if (projection === 'names') {
      return [name].filter(Boolean)
    }
    return (projection === 'both' ? dedupe([value, name]) : [value]).filter(Boolean)
  })
}
