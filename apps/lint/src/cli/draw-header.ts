import chalk from 'chalk'
import gradient from 'gradient-string'
import terminalLink from 'terminal-link'

type StyleFn = (text: string, row: number) => string

interface Piece {
  lines: string[]
  position: { x: number; y: number }
  style: StyleFn
}

interface Canvas {
  width: number
  height: number
  cells: Array<Array<{ char: string; pieceId: string | null }>>
}

const boltGradientColors = [
  '#a78bfa',
  '#c084fc',
  '#e879f9',
  '#f472b6',
  '#fb7185',
  '#fb923c',
  '#fbbf24',
  '#fbbf24',
  '#fbbf24',
]

// Pre-rendered figlet "Loccy" in ANSI-Compact font
const figletLines = [
  // prettier-ignore
  '                               ',
  '                               ',
  '██      ▄▄▄   ▄▄▄▄  ▄▄▄▄ ▄▄ ▄▄ ',
  '██     ██▀██ ██▀▀▀ ██▀▀▀ ▀███▀ ',
  '██████ ▀███▀ ▀████ ▀████   █   ',
  '                               ',
]

const pieces: Record<string, Piece> = {
  logo: {
    // prettier-ignore
    lines: [
      "     #   ",
      "    ##   ",
      "  ####   ",
      "#########",
      "   ####  ",
      "   ##    ",
      "   #     ",
      "         ",
    ],
    position: { x: 2, y: 0 },
    style: (text, row) => {
      if (text.trim() === '') return text
      const currentColor = boltGradientColors[row] || '#fbbf24'
      const nextColor = boltGradientColors[row + 1] || currentColor
      return gradient([currentColor, nextColor])(text)
    },
  },

  title: {
    lines: figletLines,
    position: { x: 16, y: -1 },
    style: (text) => chalk.whiteBright.bold(text),
  },

  subtitle: {
    lines: [chalk.dim('i18n linter • ' + terminalLink('loccy.dev', 'https://loccy.dev', { fallback: (text) => text }))],
    position: { x: 16, y: 5 },
    style: (text) => text,
  },
}

function createCanvas(pieces: Record<string, Piece>): Canvas {
  let width = 0
  let height = 0
  for (const piece of Object.values(pieces)) {
    const pieceWidth = piece.position.x + Math.max(...piece.lines.map((l) => l.length))
    const pieceHeight = piece.position.y + piece.lines.length
    width = Math.max(width, pieceWidth)
    height = Math.max(height, pieceHeight)
  }
  const cells: Canvas['cells'] = []
  for (let y = 0; y < height; y++) {
    const row: Canvas['cells'][number] = []
    for (let x = 0; x < width; x++) {
      row.push({ char: ' ', pieceId: null })
    }
    cells.push(row)
  }
  return { width, height, cells }
}

function placePiece(canvas: Canvas, pieceId: string, piece: Piece): void {
  const { x: startX, y: startY } = piece.position
  for (let lineIdx = 0; lineIdx < piece.lines.length; lineIdx++) {
    const line = piece.lines[lineIdx]!
    const y = startY + lineIdx
    if (y < 0 || y >= canvas.height) continue
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const x = startX + charIdx
      const char = line[charIdx]!
      if (x >= canvas.width) continue
      if (char !== ' ') {
        canvas.cells[y]![x] = { char, pieceId }
      }
    }
  }
}

function renderCanvas(canvas: Canvas, pieces: Record<string, Piece>): void {
  for (let y = 0; y < canvas.height; y++) {
    let output = ''
    let currentPieceId: string | null = null
    let buffer = ''
    const flushBuffer = () => {
      if (buffer.length === 0) return
      if (currentPieceId && pieces[currentPieceId]) {
        const piece = pieces[currentPieceId]!
        const pieceRow = y - piece.position.y
        output += piece.style(buffer, pieceRow)
      } else {
        output += buffer
      }
      buffer = ''
    }
    for (let x = 0; x < canvas.width; x++) {
      const cell = canvas.cells[y]![x]!
      if (cell.pieceId !== currentPieceId) {
        flushBuffer()
        currentPieceId = cell.pieceId
      }
      buffer += cell.char
    }
    flushBuffer()
    console.log(output)
  }
}

export function drawHeader(): void {
  const canvas = createCanvas(pieces)
  for (const [pieceId, piece] of Object.entries(pieces)) {
    placePiece(canvas, pieceId, piece)
  }
  console.log('')
  renderCanvas(canvas, pieces)
}
