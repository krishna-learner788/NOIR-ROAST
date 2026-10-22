// Serialises structured data for a <script type="application/ld+json"> tag. JSON.stringify does not
// escape "<", so text containing "</script>" (e.g. a product description) could end the tag early and
// inject markup. Escaping "<", ">", "&" and the JS line separators keeps the JSON identical when
// parsed but makes it inert inside HTML.
const hex = (code) => code.toString(16).padStart(4, '0')
const escapeChar = (c) => '\\u' + hex(c.charCodeAt(0))
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

export function serializeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/[<>&]/g, escapeChar)
    .split(LINE_SEPARATOR).join(escapeChar(LINE_SEPARATOR))
    .split(PARAGRAPH_SEPARATOR).join(escapeChar(PARAGRAPH_SEPARATOR))
}
