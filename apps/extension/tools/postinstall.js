#!/usr/bin/env node

const fs = require('fs')
const path = require('path')


// CUSTOM FONTS

const fontSrc = path.join(__dirname, '../node_modules/lucide-static/font')
const fontDest = path.join(__dirname, '../fonts')

// Create fonts directory
if (!fs.existsSync(fontDest)) {
  fs.mkdirSync(fontDest, { recursive: true })
}

// Copy font files
[
  'lucide.woff', 
  // 'lucide.woff2'
].forEach(file => {
  fs.copyFileSync(
    path.join(fontSrc, file),
    path.join(fontDest, file)
  )
  console.log(`✅ Copied ${file}`)
})
