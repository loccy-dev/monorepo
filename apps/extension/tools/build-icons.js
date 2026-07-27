const fs = require('fs')
const path = require('path')
const glob = require('glob')

// Paths
const LUCIDE_CSS = path.join(__dirname, '../node_modules/lucide-static/font/lucide.css')
const ICONS_ENUM_PATH = path.join(__dirname, '../src/lucide-icons.ts')
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json')
const SRC_FOLDER = path.join(__dirname, '../src')

/**
 * Step 1: Parse CSS and extract all icon definitions
 */
function extractIconsFromCSS(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8')
  const iconRegex = /\.icon-([a-z0-9-]+)::before\s*{\s*content:\s*"\\([0-9a-f]+)";?\s*}/gi
  const icons = {}

  let match
  while ((match = iconRegex.exec(css)) !== null) {
    const iconName = match[1]
    const charCode = match[2]

    icons[iconName] = {
      name: iconName,
      character: charCode,
      id: `lucide-${iconName}`,
      enumName: iconName.toUpperCase().replace(/-/g, '_'),
    }
  }

  console.log(`✅ Extracted ${Object.keys(icons).length} icons from CSS`)
  return icons
}

/**
 * Step 2: Generate TypeScript enum
 */
function generateTypeScriptEnum(icons) {
  const enumEntries =
    Object.values(icons)
      .sort((a, b) => a.enumName.localeCompare(b.enumName))
      .map((icon) => `  ${icon.enumName} = 'lucide-${icon.name}'`)
      .join(',\n') + ','

  const enumCode = `/**
 * Auto-generated Lucide icon names
 * Total icons: ${Object.keys(icons).length}
 *
 * Usage:
 * import { LucideIcon } from './icons';
 *
 * const item = { label: \`\${LucideIcon.ACTIVITY} Activity\` };
 */
export enum LucideIcon {
${enumEntries}
}

/**
 * Type-safe icon name
 */
export type LucideIconName = \`\${LucideIcon}\`

/**
 * All available icon names as array
 */
export const ALL_LUCIDE_ICONS = Object.values(LucideIcon)
`

  fs.writeFileSync(ICONS_ENUM_PATH, enumCode)
  console.log(`✅ Generated TypeScript enum at ${ICONS_ENUM_PATH}`)
}

/**
 * Step 3: Scan codebase for used icons
 */
function scanCodebaseForUsedIcons(icons, srcFolder) {
  // Find all TypeScript/JavaScript files, excluding the generated icons.ts
  const files = glob.sync(`${srcFolder}/**/*.{ts,js,tsx,jsx}`, {
    ignore: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/lucide-icons.ts', '**/icons.d.ts'],
  })

  console.log(`🔍 Scanning ${files.length} files for icon usage...`)
  if (files.length === 0) {
    console.warn('⚠️  No files found to scan!')
    return []
  }

  // Show which files are being scanned
  files.forEach((file) => {
    console.log(`   📄 ${path.relative(process.cwd(), file)}`)
  })

  const usedIcons = new Set()
  const iconUsageByFile = {}

  // ONLY match: LucideIcon.ICON_NAME
  const enumPattern = /LucideIcon\.([A-Z0-9_]+)/g

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8')
    const relativeFile = path.relative(process.cwd(), file)

    // Reset regex lastIndex
    enumPattern.lastIndex = 0

    let match
    while ((match = enumPattern.exec(content)) !== null) {
      const enumName = match[1] // e.g., "AIRPLAY"
      const iconName = enumName.toLowerCase().replace(/_/g, '-') // e.g., "airplay"

      // Check if icon exists
      if (icons[iconName]) {
        usedIcons.add(iconName)

        // Track usage by file
        if (!iconUsageByFile[relativeFile]) {
          iconUsageByFile[relativeFile] = []
        }
        iconUsageByFile[relativeFile].push({
          icon: iconName,
          enumName: enumName,
          line: content.substring(0, match.index).split('\n').length,
        })
      } else {
        console.warn(`   ⚠️  Unknown icon: LucideIcon.${enumName} in ${relativeFile}`)
      }
    }
  })

  console.log(`\n✅ Found ${usedIcons.size} unique icons in ${files.length} files\n`)

  // Show usage details
  if (usedIcons.size > 0) {
    console.log('📋 Icon usage by file:')
    Object.entries(iconUsageByFile).forEach(([file, usages]) => {
      console.log(`   ${file}:`)
      const uniqueIcons = [...new Set(usages.map((u) => u.icon))]
      uniqueIcons.forEach((icon) => {
        const usage = usages.find((u) => u.icon === icon)
        console.log(`      - ${icon} (LucideIcon.${usage.enumName})`)
      })
    })
    console.log('')
  }

  if (usedIcons.size === 0) {
    console.warn('⚠️  No icons found in codebase.')
    console.warn('   Only LucideIcon.ICON_NAME pattern is supported.')
    console.warn('\n   Example usage:')
    console.warn("   import { LucideIcon } from './icons';")
    console.warn('   const item = { label: `$(${LucideIcon.AIRPLAY}) Airplay` };')
  }

  return Array.from(usedIcons)
}

/**
 * Step 4: Update package.json with only used icons
 */
function updatePackageJson(icons, usedIconNames, packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  // Create icons configuration ONLY for used icons
  const iconsConfig = {}
  usedIconNames.sort().forEach((iconName) => {
    const icon = icons[iconName]
    if (icon) {
      iconsConfig[icon.id] = {
        description: `${iconName} icon`,
        default: {
          fontPath: './fonts/lucide.woff',
          fontCharacter: `\\${icon.character}`,
        },
      }
    }
  })

  // Update package.json
  if (!packageJson.contributes) {
    packageJson.contributes = {}
  }
  packageJson.contributes.icons = iconsConfig

  // Write back
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')

  console.log(`✅ Updated package.json with ${Object.keys(iconsConfig).length} icons`)

  // Show savings
  const totalIcons = Object.keys(icons).length
  const usedIcons = Object.keys(iconsConfig).length
  if (usedIcons > 0) {
    const savings = ((1 - usedIcons / totalIcons) * 100).toFixed(1)
    console.log(`📊 Bundle size optimization: ${usedIcons}/${totalIcons} icons (${savings}% reduction)`)

    // List used icons
    console.log('\n📦 Icons included in bundle:')
    usedIconNames.forEach((name) => {
      const icon = icons[name]
      console.log(`   - ${name} (LucideIcon.${icon.enumName})`)
    })
  } else {
    console.log('📦 No icons will be included in bundle')
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Building Lucide icons...\n')

  try {
    // Step 1: Extract all icons from CSS
    const icons = extractIconsFromCSS(LUCIDE_CSS)

    // Step 2: Generate TypeScript enum
    generateTypeScriptEnum(icons)

    // Step 3: Scan codebase for used icons (ONLY LucideIcon.ICON_NAME pattern)
    const usedIconNames = scanCodebaseForUsedIcons(icons, SRC_FOLDER)

    // Step 4: Update package.json with ONLY used icons
    updatePackageJson(icons, usedIconNames, PACKAGE_JSON_PATH)

    console.log('\n✨ Build complete!')
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run
main()
