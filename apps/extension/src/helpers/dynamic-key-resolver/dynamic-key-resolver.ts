import ts from 'typescript'
import * as vscode from 'vscode'
import type { Loc } from '@repo/types/platform.types'
import type { DynamicKeyResolverInterface } from '@repo/shared/core/usages/key-detection/types'
import { DEBUG, debug, dedupe, startDebugging, stopDebugging } from './utils'
import { ExpressionEvaluator } from './expression-evaluator'

export class DynamicKeyResolver implements DynamicKeyResolverInterface {
  private document: vscode.TextDocument | null = null
  private isInitialized = false

  constructor(private readonly fileUri: vscode.Uri) {}

  private async init() {
    if (this.isInitialized) {
      return
    }

    try {
      this.document = await vscode.workspace.openTextDocument(this.fileUri)
    } catch (error) {
      debug('Could not open document:', error)
    }

    this.isInitialized = true
  }

  public async resolveKey(expression: string, loc: Loc): Promise<string[]> {
    if (DEBUG && loc.start === DEBUG) {
      startDebugging()
    }
    debug('Starting resolveKey with expression:', expression, 'at loc:', loc)

    await this.init()

    if (!this.document) {
      debug('Document not available')
      stopDebugging()
      return []
    }

    const resolved = await this.resolveExpression(expression, loc)
    stopDebugging()
    return resolved
  }

  private async resolveExpression(expression: string, loc: Loc): Promise<string[]> {
    if (!this.document) {
      return []
    }

    try {
      const tempSourceFile = ts.createSourceFile('temp.ts', expression, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      debug('Parsed expression AST')

      const statement = tempSourceFile.statements[0]
      if (!statement || !ts.isExpressionStatement(statement)) {
        return []
      }

      const exprNode = statement.expression

      const evaluator = new ExpressionEvaluator(this.document, loc)
      const values = await evaluator.evaluate(exprNode)

      debug('Evaluation results:', { values })
      return dedupe(values)
    } catch (error) {
      debug('Error in resolveExpression:', error)
      return []
    }
  }
}
