const STREET_ABBR = {
  avenue: 'AVE',
  street: 'ST',
  road: 'RD',
  drive: 'DR',
  boulevard: 'BLVD',
  court: 'CT',
  lane: 'LN',
  way: 'WAY',
  crescent: 'CRES',
  place: 'PL',
  circle: 'CIR',
  terrace: 'TER',
  parkway: 'PKWY',
}

// Derives a short "door plate" label from a street address, e.g.
// "177 Avenue NW" -> "177 AVE", "94 Street NW" -> "94 ST".
export function getPlateLabel(address) {
  const words = address.trim().split(/\s+/)
  const first = words[0]
  if (/^\d/.test(first) && words[1]) {
    const abbr = STREET_ABBR[words[1].toLowerCase()] || words[1].slice(0, 4).toUpperCase()
    return `${first} ${abbr}`
  }
  return words.slice(0, 2).join(' ').toUpperCase().slice(0, 14)
}

const GRADIENTS = [
  'linear-gradient(135deg,#3A4655,#1B2430)',
  'linear-gradient(135deg,#4A5A6A,#1B2430)',
  'linear-gradient(135deg,#5C6F58,#1B2430)',
  'linear-gradient(135deg,#5A4A5C,#1B2430)',
  'linear-gradient(135deg,#4A5768,#1B2430)',
]

export function getPhotoGradient(index) {
  return GRADIENTS[index % GRADIENTS.length]
}
