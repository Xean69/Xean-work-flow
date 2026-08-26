const URL_REGEX = /(https?:\/\/[^\s]+)/g

// Turns plain http(s):// URLs in a string into clickable links — no
// preview/embed fetching, just text -> <a>, per the explicit "no need for
// link previews" scope. The capturing group in the regex is what makes
// split() interleave the matched URLs into the result array alongside the
// surrounding text, rather than just splitting them out.
export function linkify(text) {
  if (!text) return text
  return text.split(URL_REGEX).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  )
}
