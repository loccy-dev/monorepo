import ts from 'typescript'
import * as vscode from 'vscode'
import { debug } from './utils'

export class TypeResolver {
  constructor(
    private readonly document: vscode.TextDocument,
    private readonly genericEncountered: () => boolean,
    private readonly markGeneric: () => void,
  ) {}

  async getTypeValuesAtPosition(position: vscode.Position): Promise<string[]> {
    debug('Getting type values at position:', position)

    // Try hover provider first (most reliable for union types)
    let values = await this.tryHoverProvider(position)
    debug('Hover provider values', values)

    if (values.length > 0) {
      debug('Got values from hover provider:', values)
      return values
    } else if (this.genericEncountered()) {
      debug('Encountered unknown during hover provider')
      return []
    }

    values = await this.tryTypeDefinitionProvider(position)
    debug('Type definition provider values', values)
    if (values.length > 0) {
      debug('Got values from type definition provider:', values)
      return values
    } else if (this.genericEncountered()) {
      debug('Encountered unknown during type definition provider')
      return []
    }

    // Try definition provider (for const declarations, enums, etc.)
    values = await this.tryDefinitionProvider(position)
    debug('Definition provider values', values)

    if (values.length > 0) {
      debug('Got values from definition provider:', values)
      return values
    } else if (this.genericEncountered()) {
      debug('Encountered unknown during definition provider')
      return []
    }

    debug('No values found at position')

    return []
  }

  async getPropertyTypeFromObject(objectPosition: vscode.Position, propertyName: string): Promise<string[]> {
    try {
      const typeDefs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        this.document.uri,
        objectPosition,
      )

      if (!typeDefs || typeDefs.length === 0) {
        return []
      }

      for (const typeDef of typeDefs) {
        const doc = await vscode.workspace.openTextDocument(typeDef.uri)
        const text = doc.getText()

        const sourceFile = ts.createSourceFile(doc.fileName, text, ts.ScriptTarget.Latest, true)

        const offset = doc.offsetAt(typeDef.range.start)
        const node = this.findNodeAtPosition(sourceFile, offset)

        if (node) {
          const propertyValues = this.findPropertyTypeInNode(node, propertyName, sourceFile)
          if (propertyValues.length > 0) {
            return propertyValues
          }
        }
      }

      return []
    } catch (error) {
      debug('Error getting property type from object:', error)
      return []
    }
  }

  private async tryTypeDefinitionProvider(position: vscode.Position): Promise<string[]> {
    try {
      const typeDefs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        this.document.uri,
        position,
      )
      debug('tryTypeDefinitionProvider: type definitions:', typeDefs)

      if (!typeDefs || typeDefs.length === 0) {
        return []
      }

      for (const typeDef of typeDefs) {
        const values = await this.extractFromLocation(typeDef)
        debug('tryTypeDefinitionProvider: extracted values:', values)
        if (values.length > 0) {
          return values
        }
      }

      return []
    } catch (error) {
      debug('Type definition provider error:', error)
      return []
    }
  }

  private async tryDefinitionProvider(position: vscode.Position): Promise<string[]> {
    try {
      const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        this.document.uri,
        position,
      )

      debug('tryDefinitionProvider: definitions:', definitions)

      if (!definitions || definitions.length === 0) {
        return []
      }

      for (const definition of definitions) {
        const values = await this.extractFromLocation(definition)
        if (values.length > 0) {
          return values
        }
      }

      return []
    } catch (error) {
      debug('Definition provider error:', error)
      return []
    }
  }

  private async tryHoverProvider(position: vscode.Position): Promise<string[]> {
    try {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        this.document.uri,
        position,
      )

      if (!hovers || hovers.length === 0) {
        return []
      }

      for (const hover of hovers) {
        const values = this.extractFromHover(hover)
        if (values.length > 0) {
          return values
        }

        // Check if hover indicates a type reference that needs resolution
        const hoverText = hover.contents.map((c) => (typeof c === 'string' ? c : c.value)).join('\n')
        const typeRefMatch = hoverText.match(/:\s*(\w+)(?:\.(\w+))?\s*$/m)
        if (typeRefMatch) {
          const typeName = typeRefMatch[1]

          // Don't try to resolve primitive types
          const primitiveTypes = ['string', 'number', 'boolean', 'any', 'unknown', 'void', 'never', 'Array', 'Promise']
          if (!primitiveTypes.includes(typeName)) {
            const resolvedValues = await this.resolveTypeReference(typeName, position)
            if (resolvedValues.length > 0) {
              return resolvedValues
            }
          } else {
            this.markGeneric()
          }
        }
      }

      return []
    } catch (error) {
      debug('Hover provider error:', error)
      return []
    }
  }

  private extractFromHover(hover: vscode.Hover): string[] {
    const hoverText = hover.contents.map((c) => (typeof c === 'string' ? c : c.value)).join('\n')

    debug('Hover text:', hoverText)

    // Skip if still loading or shows 'any'
    if (hoverText.includes('loading') || hoverText.includes(') any')) {
      return []
    }

    const codeBlocks = hoverText.match(/```(?:typescript|ts|javascript|js)\n([\s\S]*?)\n```/g)
    if (!codeBlocks) {
      return []
    }

    const allLiterals = new Set<string>()

    for (const block of codeBlocks) {
      const codeMatch = block.match(/```(?:typescript|ts|javascript|js)\n([\s\S]*?)\n```/)
      if (!codeMatch) {
        continue
      }

      const code = codeMatch[1]

      // Extract string literals from union types: "a" | "b" | "c"
      const unionLiterals = code.match(/"([^"]+)"|'([^']+)'/g)
      if (unionLiterals && unionLiterals.length >= 1) {
        unionLiterals.forEach((lit) => {
          const cleaned = lit.replace(/["']/g, '')
          if (cleaned) {
            allLiterals.add(cleaned)
          }
        })
      }

      const enumMatch = code.match(/enum\s+\w+\s*{([^}]+)}/s)
      if (enumMatch) {
        const members = enumMatch[1].split(',').map((m) => m.trim().split('=')[0].trim())
        members.forEach((m) => {
          if (m) {
            allLiterals.add(m)
          }
        })
      }
    }

    return Array.from(allLiterals)
  }

  private async extractFromLocation(location: vscode.Location): Promise<string[]> {
    if (!location.uri || !location.range) {
      return []
    }

    try {
      const doc = await vscode.workspace.openTextDocument(location.uri)
      const text = doc.getText()

      const sourceFile = ts.createSourceFile(doc.fileName, text, ts.ScriptTarget.Latest, true)

      const offset = doc.offsetAt(location.range.start)
      const node = this.findNodeAtPosition(sourceFile, offset)

      return node ? this.extractValuesFromNode(node, sourceFile) : []
    } catch (error) {
      debug('Extract from location error:', error)
      return []
    }
  }

  private findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
    function find(node: ts.Node): ts.Node | undefined {
      if (position >= node.getStart() && position < node.getEnd()) {
        return ts.forEachChild(node, find) || node
      }
    }
    return find(sourceFile)
  }

  private extractValuesFromNode(node: ts.Node, sourceFile: ts.SourceFile): string[] {
    let current: ts.Node | undefined = node

    while (current) {
      if (ts.isEnumDeclaration(current)) {
        const values = current.members.map((m) => {
          if (m.initializer && ts.isStringLiteral(m.initializer)) {
            return m.initializer.text
          }
          return m.name.getText(sourceFile)
        })

        if (values.length > 0) {
          return values
        }
      }

      // Type alias with union of string literals or typeof patterns
      if (ts.isTypeAliasDeclaration(current)) {
        const values = this.extractStringLiterals(current.type, sourceFile)
        if (values.length > 0) {
          return values
        }
      }

      // Variable declaration with const object (for typeof patterns)
      if (ts.isVariableDeclaration(current) && current.initializer) {
        const values = this.extractFromVariableDeclaration(current, sourceFile)
        if (values.length > 0) {
          return values
        }
      }

      current = current.parent
    }

    return []
  }

  private findPropertyTypeInNode(node: ts.Node, propertyName: string, sourceFile: ts.SourceFile): string[] {
    let current: ts.Node | undefined = node

    while (current) {
      if (ts.isInterfaceDeclaration(current) || ts.isTypeLiteralNode(current)) {
        const members = 'members' in current ? current.members : []
        const values = this.findStringLiteralProperty(members, propertyName, sourceFile, 'interface')
        if (values.length > 0) {
          return values
        }
      }

      if (ts.isTypeAliasDeclaration(current) && current.type && ts.isTypeLiteralNode(current.type)) {
        const values = this.findStringLiteralProperty(current.type.members, propertyName, sourceFile, 'type alias')
        if (values.length > 0) {
          return values
        }
      }

      current = current.parent
    }

    return []
  }

  private findStringLiteralProperty(
    members: readonly ts.TypeElement[],
    propertyName: string,
    sourceFile: ts.SourceFile,
    label: string,
  ): string[] {
    for (const member of members) {
      if (ts.isPropertySignature(member) && member.name) {
        const memberName = member.name.getText(sourceFile)

        if (memberName === propertyName && member.type && this.isStringLiteralType(member.type)) {
          const typeValues = this.extractStringLiterals(member.type, sourceFile)
          if (typeValues.length > 0) {
            debug(`Found property type in ${label}:`, typeValues)
            return typeValues
          }
        }
      }
    }

    return []
  }

  private isStringLiteralType(typeNode: ts.TypeNode): boolean {
    // Union of string literals: "a" | "b" | "c"
    if (ts.isUnionTypeNode(typeNode)) {
      return typeNode.types.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))
    }

    // Single string literal: "hello"
    if (ts.isLiteralTypeNode(typeNode)) {
      return ts.isStringLiteral(typeNode.literal)
    }

    // Indexed access type - check if it references a const object
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      let objectType = typeNode.objectType
      if (ts.isParenthesizedTypeNode(objectType)) {
        objectType = objectType.type
      }
      // Only allow typeof references, not generic indexed types
      return ts.isTypeQueryNode(objectType)
    }

    return false
  }

  private extractStringLiterals(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): string[] {
    const results: string[] = []

    if (ts.isUnionTypeNode(typeNode)) {
      typeNode.types.forEach((t) => {
        if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
          results.push(t.literal.text)
        }
      })
      return results
    }

    // Indexed access type: typeof obj[keyof typeof obj] or (typeof obj)[keyof typeof obj]
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      let objectType = typeNode.objectType

      // Handle parenthesized type: (typeof obj)
      if (ts.isParenthesizedTypeNode(objectType)) {
        objectType = objectType.type
      }

      if (ts.isTypeQueryNode(objectType)) {
        const exprName = objectType.exprName
        if (ts.isIdentifier(exprName)) {
          const objectDecl = this.findConstObjectDeclaration(sourceFile, exprName.text)
          if (objectDecl) {
            return this.extractValuesFromNode(objectDecl, sourceFile)
          }
        }
      }
    }

    if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
      return [typeNode.literal.text]
    }

    return results
  }

  private findConstObjectDeclaration(sourceFile: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
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

  private extractFromVariableDeclaration(declaration: ts.VariableDeclaration, sourceFile: ts.SourceFile): string[] {
    if (!declaration.initializer) {
      return []
    }

    const initializer = declaration.initializer

    // Direct object literal: const foo = { A: "A", B: "B" }
    if (ts.isObjectLiteralExpression(initializer)) {
      return this.extractFromObjectLiteral(initializer, sourceFile)
    }

    // As const expression: const foo = { A: "A" } as const
    if (ts.isAsExpression(initializer) && ts.isObjectLiteralExpression(initializer.expression)) {
      return this.extractFromObjectLiteral(initializer.expression, sourceFile)
    }

    // String literal: const foo = "value"
    if (ts.isStringLiteral(initializer)) {
      return [initializer.text]
    }

    return []
  }

  private extractFromObjectLiteral(objectLiteral: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): string[] {
    return objectLiteral.properties
      .filter(ts.isPropertyAssignment)
      .map((prop) => {
        const name = prop.name.getText(sourceFile).replace(/["']/g, '')
        return name
      })
      .filter((name) => name.length > 0)
  }

  private async resolveTypeReference(typeName: string, position: vscode.Position): Promise<string[]> {
    try {
      // Try VSCode's type definition provider first
      const typeDefinitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeTypeDefinitionProvider',
        this.document.uri,
        position,
      )

      if (typeDefinitions && typeDefinitions.length > 0) {
        const typeDef = typeDefinitions[0]
        const typeDefUri = 'targetUri' in typeDef ? typeDef.targetUri : typeDef.uri
        const typeDefRange = 'targetRange' in typeDef ? typeDef.targetRange : typeDef.range

        if (typeDefUri && typeDefRange) {
          const typeDefDoc = await vscode.workspace.openTextDocument(typeDefUri)
          const typeDefText = typeDefDoc.getText(typeDefRange)

          // Extract union values directly from the type definition text
          const unionMatches = Array.from(typeDefText.matchAll(/"([^"]+)"/g))
          if (unionMatches.length > 1) {
            return unionMatches.map((match) => match[1])
          }
        }
      }

      // Fallback: Manual AST-based resolution
      return await this.manualTypeResolution(typeName)
    } catch (error) {
      debug('Error resolving type reference:', error)
      return []
    }
  }

  private async manualTypeResolution(typeName: string): Promise<string[]> {
    const sourceFile = ts.createSourceFile(
      this.document.fileName,
      this.document.getText(),
      ts.ScriptTarget.Latest,
      true,
    )

    let typeDecl = this.findDeclarationInFile(sourceFile, typeName)
    let typeDeclSourceFile = sourceFile

    if (!typeDecl) {
      const importDecl = this.findImportDeclaration(sourceFile, typeName)
      if (importDecl) {
        try {
          const importPath = await this.resolveImportPath(importDecl)
          if (importPath) {
            const importedDoc = await vscode.workspace.openTextDocument(importPath)
            const importedSourceFile = ts.createSourceFile(
              importedDoc.fileName,
              importedDoc.getText(),
              ts.ScriptTarget.Latest,
              true,
            )
            typeDecl = this.findExportedDeclaration(importedSourceFile, typeName)
            if (typeDecl) {
              typeDeclSourceFile = importedSourceFile
            }
          }
        } catch (error) {
          debug('Import resolution failed:', error)
        }
      }

      if (!typeDecl) {
        const result = await this.findTypeInWorkspace(typeName)
        if (result) {
          typeDecl = result.node
          typeDeclSourceFile = result.sourceFile
        }
      }
    }

    if (typeDecl) {
      return this.extractValuesFromNode(typeDecl, typeDeclSourceFile)
    }

    return []
  }

  private findDeclarationInFile(sourceFile: ts.SourceFile, name: string): ts.Node | undefined {
    let found: ts.Node | undefined

    function visit(node: ts.Node) {
      if (found) {
        return
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
        found = node
        return
      }

      if (ts.isEnumDeclaration(node) && node.name.text === name) {
        found = node
        return
      }

      if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
        found = node
        return
      }

      if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === name) {
        found = node
        return
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return found
  }

  private findImportDeclaration(sourceFile: ts.SourceFile, varName: string): ts.ImportDeclaration | undefined {
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const bindings = statement.importClause.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          const found = bindings.elements.find((element) => element.name.text === varName)
          if (found) {
            return statement
          }
        }
      }
    }
    return undefined
  }

  private findExportedDeclaration(sourceFile: ts.SourceFile, name: string): ts.Node | undefined {
    for (const statement of sourceFile.statements) {
      // Named exports: export { Foo }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const found = statement.exportClause.elements.find((element) => element.name.text === name)
        if (found) {
          return this.findDeclarationInFile(sourceFile, found.name.text)
        }
      }

      // Direct exports: export const Foo = ...
      if (this.hasExportModifier(statement)) {
        if (ts.isVariableStatement(statement)) {
          const decl = statement.declarationList.declarations.find(
            (d) => ts.isIdentifier(d.name) && d.name.text === name,
          )
          if (decl) {
            return decl
          }
        }
        if (ts.isEnumDeclaration(statement) && statement.name.text === name) {
          return statement
        }
        if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) {
          return statement
        }
      }
    }

    // Fallback: look for non-exported declarations
    return this.findDeclarationInFile(sourceFile, name)
  }

  private hasExportModifier(node: ts.Node): boolean {
    return (
      (ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) ??
      false
    )
  }

  private async resolveImportPath(importDecl: ts.ImportDeclaration): Promise<vscode.Uri | undefined> {
    if (!ts.isStringLiteral(importDecl.moduleSpecifier)) {
      return undefined
    }

    const importPath = importDecl.moduleSpecifier.text
    const documentDir = vscode.Uri.joinPath(this.document.uri, '..')

    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      return this.resolveRelativeImport(importPath, documentDir)
    }

    return this.resolveWithTypeScript(importPath)
  }

  private async resolveRelativeImport(importPath: string, documentDir: vscode.Uri): Promise<vscode.Uri | undefined> {
    const hasExtension = /\.(m?[tj]sx?|[cm]js)$/.test(importPath)

    if (hasExtension) {
      const extensions = [
        importPath.replace(/\.m?js$/, '.ts'),
        importPath.replace(/\.m?js$/, '.tsx'),
        importPath.replace(/\.m?js$/, '.mts'),
        importPath.replace(/\.cjs$/, '.cts'),
        importPath,
      ]

      for (const ext of extensions) {
        const resolvedPath = vscode.Uri.joinPath(documentDir, ext)
        try {
          await vscode.workspace.fs.stat(resolvedPath)
          return resolvedPath
        } catch {
          continue
        }
      }
      return vscode.Uri.joinPath(documentDir, importPath)
    } else {
      const extensions = ['.ts', '.tsx', '.js', '.jsx']
      for (const ext of extensions) {
        const resolvedPath = vscode.Uri.joinPath(documentDir, importPath + ext)
        try {
          await vscode.workspace.fs.stat(resolvedPath)
          return resolvedPath
        } catch {
          continue
        }
      }
      return vscode.Uri.joinPath(documentDir, importPath + '.ts')
    }
  }

  private async resolveWithTypeScript(importPath: string): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.document.uri)
    if (!workspaceFolder) {
      return undefined
    }

    try {
      const documentDirPath = this.document.uri.fsPath.substring(0, this.document.uri.fsPath.lastIndexOf('/'))

      // Find and parse tsconfig.json or jsconfig.json
      const configPath =
        ts.findConfigFile(documentDirPath, ts.sys.fileExists, 'tsconfig.json') ||
        ts.findConfigFile(documentDirPath, ts.sys.fileExists, 'jsconfig.json')

      if (!configPath) {
        return undefined
      }

      const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
      if (configFile.error) {
        return undefined
      }

      const configDirPath = configPath.substring(0, configPath.lastIndexOf('/'))

      const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configDirPath)

      const resolved = ts.resolveModuleName(importPath, this.document.uri.fsPath, parsedConfig.options, ts.sys)

      if (resolved.resolvedModule) {
        const resolvedPath = resolved.resolvedModule.resolvedFileName
        return vscode.Uri.file(resolvedPath)
      }

      return undefined
    } catch (error) {
      debug('TypeScript module resolution error:', error)
      return undefined
    }
  }

  private async findTypeInWorkspace(
    typeName: string,
  ): Promise<{ node: ts.Node; sourceFile: ts.SourceFile } | undefined> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        typeName,
      )

      if (symbols && symbols.length > 0) {
        // Look for exact type alias, interface, or enum matches
        const typeSymbol = symbols.find(
          (s) =>
            s.name === typeName &&
            (s.kind === vscode.SymbolKind.TypeParameter ||
              s.kind === vscode.SymbolKind.Interface ||
              s.kind === vscode.SymbolKind.Enum ||
              s.kind === vscode.SymbolKind.Class),
        )

        if (typeSymbol) {
          try {
            const symbolDoc = await vscode.workspace.openTextDocument(typeSymbol.location.uri)
            const symbolSourceFile = ts.createSourceFile(
              symbolDoc.fileName,
              symbolDoc.getText(),
              ts.ScriptTarget.Latest,
              true,
            )
            const foundDecl = this.findExportedDeclaration(symbolSourceFile, typeName)
            if (foundDecl) {
              return { node: foundDecl, sourceFile: symbolSourceFile }
            }
          } catch (error) {
            debug('Error accessing workspace symbol:', error)
          }
        }
      }
    } catch (error) {
      debug('Workspace symbol search error:', error)
    }

    return undefined
  }
}
