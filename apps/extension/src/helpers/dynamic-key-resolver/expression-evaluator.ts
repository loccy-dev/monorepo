import ts from 'typescript'
import * as vscode from 'vscode'
import type { Loc } from '@repo/types/platform.types'
import { debug, dedupe } from './utils'
import { TypeResolver } from './type-resolver'

const MAX_DYNAMIC_RESOLUTION_DEPTH = 10

export class ExpressionEvaluator {
  private readonly cache = new Map<string, string[]>()
  private isGenericEncountered = false
  private readonly typeResolver: TypeResolver

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly expressionLoc: Loc,
  ) {
    this.typeResolver = new TypeResolver(
      document,
      () => this.isGenericEncountered,
      () => this.markGeneric(),
    )
  }

  async evaluate(node: ts.Expression): Promise<string[]> {
    this.isGenericEncountered = false
    return this.evaluateNode(node, 0)
  }

  private markGeneric() {
    this.isGenericEncountered = true
  }

  private async evaluateNode(node: ts.Expression, depth: number): Promise<string[]> {
    if (depth > MAX_DYNAMIC_RESOLUTION_DEPTH) {
      return []
    }

    if (this.isGenericEncountered) {
      return []
    }

    const cacheKey = `${node.kind}-${node.getText()}-${node.pos}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? []
    }

    debug('Evaluating node:', ts.SyntaxKind[node.kind], 'at depth:', depth, 'text:', node.getText())

    let result: string[] = []

    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral: {
        const literal = node as ts.StringLiteralLike
        result = [literal.text]
        break
      }
      case ts.SyntaxKind.TemplateExpression: {
        result = await this.evaluateTemplateExpression(node as ts.TemplateExpression, depth)
        break
      }
      case ts.SyntaxKind.ParenthesizedExpression: {
        result = await this.evaluateNode((node as ts.ParenthesizedExpression).expression, depth + 1)
        break
      }
      case ts.SyntaxKind.AsExpression:
      case ts.SyntaxKind.TypeAssertionExpression: {
        const assertion = node as ts.AsExpression
        result = await this.evaluateNode(assertion.expression as ts.Expression, depth + 1)
        break
      }
      case ts.SyntaxKind.NonNullExpression: {
        result = await this.evaluateNode((node as ts.NonNullExpression).expression, depth + 1)
        break
      }
      case ts.SyntaxKind.BinaryExpression: {
        result = await this.evaluateBinaryExpression(node as ts.BinaryExpression, depth)
        break
      }
      case ts.SyntaxKind.ConditionalExpression: {
        result = await this.evaluateConditionalExpression(node as ts.ConditionalExpression, depth)
        break
      }
      case ts.SyntaxKind.Identifier: {
        result = await this.evaluateIdentifier(node as ts.Identifier)
        break
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        result = await this.evaluatePropertyAccess(node as ts.PropertyAccessExpression)
        break
      }
      case ts.SyntaxKind.ElementAccessExpression: {
        result = await this.evaluateElementAccess(node as ts.ElementAccessExpression)
        break
      }
      default:
        break
    }

    if (!result.length) {
      this.markGeneric()
    }

    debug('Node evaluation result for', ts.SyntaxKind[node.kind], ':', result, 'hasUnknown:', this.isGenericEncountered)

    const deduped = dedupe(result)
    this.cache.set(cacheKey, deduped)
    return deduped
  }

  private async evaluateTemplateExpression(node: ts.TemplateExpression, depth: number): Promise<string[]> {
    let combinations: string[] = [node.head.text]

    for (const span of node.templateSpans) {
      const dynamicValues = await this.evaluateNode(span.expression, depth + 1)
      if (this.isGenericEncountered) {
        return []
      }
      combinations = this.combineStringValues(combinations, dynamicValues).map(
        (value) => `${value}${span.literal.text}`,
      )
      combinations = dedupe(combinations)
      if (!combinations.length) {
        break
      }
    }

    return dedupe(combinations)
  }

  private async evaluateBinaryExpression(node: ts.BinaryExpression, depth: number): Promise<string[]> {
    const operator = node.operatorToken.kind
    if (operator === ts.SyntaxKind.PlusToken) {
      const left = await this.evaluateNode(node.left, depth + 1)
      const right = await this.evaluateNode(node.right, depth + 1)
      return this.combineStringValues(left, right)
    }

    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      const left = await this.evaluateNode(node.left, depth + 1)
      const right = await this.evaluateNode(node.right, depth + 1)
      return dedupe([...left, ...right])
    }

    return []
  }

  private async evaluateConditionalExpression(node: ts.ConditionalExpression, depth: number): Promise<string[]> {
    const whenTrue = await this.evaluateNode(node.whenTrue, depth + 1)
    const whenFalse = await this.evaluateNode(node.whenFalse, depth + 1)
    return dedupe([...whenTrue, ...whenFalse])
  }

  private async evaluateIdentifier(node: ts.Identifier): Promise<string[]> {
    debug('Evaluating identifier:', node.text)

    const position = this.getPositionInDocument(node)
    if (!position) {
      debug('Could not calculate position for identifier')
      this.markGeneric()
      return []
    }

    debug('Identifier position:', position)

    return await this.typeResolver.getTypeValuesAtPosition(position)
  }

  private async evaluatePropertyAccess(node: ts.PropertyAccessExpression): Promise<string[]> {
    debug('Evaluating property access:', node.getText())

    // Try the property name first (e.g., "prefix" in "props.prefix")
    const propertyNamePosition = this.getPositionInDocument(node.name)
    if (propertyNamePosition) {
      debug('Property name position:', propertyNamePosition, 'for:', node.name.text)
      const values = await this.typeResolver.getTypeValuesAtPosition(propertyNamePosition)
      if (values.length > 0) {
        return values
      } else if (this.isGenericEncountered) {
        return []
      }
    }

    // Try the start of the entire expression as fallback
    const expressionPosition = this.getPositionInDocument(node)
    if (expressionPosition) {
      debug('Full expression position:', expressionPosition)
      const values = await this.typeResolver.getTypeValuesAtPosition(expressionPosition)
      if (values.length > 0) {
        return values
      } else if (this.isGenericEncountered) {
        return []
      }
    }

    // Try querying the object part (e.g., "props" in "props.prefix")
    const objectPosition = this.getPositionInDocument(node.expression)
    if (objectPosition) {
      debug('Object expression position:', objectPosition)
      const values = await this.typeResolver.getPropertyTypeFromObject(objectPosition, node.name.text)
      if (values.length > 0) {
        return values
      } else if (this.isGenericEncountered) {
        return []
      }
    }

    this.markGeneric()
    return []
  }

  private async evaluateElementAccess(node: ts.ElementAccessExpression): Promise<string[]> {
    const position = this.getPositionInDocument(node)
    if (!position) {
      this.markGeneric()
      return []
    }

    return await this.typeResolver.getTypeValuesAtPosition(position)
  }

  private getPositionInDocument(node: ts.Node): vscode.Position | null {
    try {
      const nodeStartInExpression = node.getStart()
      const absoluteOffset = this.expressionLoc.start + nodeStartInExpression

      debug('Calculating position:', {
        nodeStartInExpression,
        expressionLocStart: this.expressionLoc.start,
        absoluteOffset,
        nodeText: node.getText(),
      })

      return this.document.positionAt(absoluteOffset)
    } catch (error) {
      debug('Error calculating position:', error)
      return null
    }
  }

  private combineStringValues(left: string[], right: string[]): string[] {
    if (!left.length && !right.length) {
      return []
    }

    const leftValues = left.length ? left : ['']
    const rightValues = right.length ? right : ['']
    const result: string[] = []

    for (const lv of leftValues) {
      for (const rv of rightValues) {
        const combined = `${lv}${rv}`
        result.push(combined)
      }
    }

    return dedupe(result)
  }
}
