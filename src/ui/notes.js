// Liner notes: a small, safe Markdown subset rendered for the reading sheet.
// Headings (#, ##), paragraphs, "- " lists, "> " quotes, **bold**, *italic*.
// HTML comments are dropped and every other character is escaped, so a note
// can never inject markup. The notes are bundled; nothing is fetched.

const escapeHtml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inline = text => escapeHtml(text)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

export function renderNotes(markdown) {
  const lines = String(markdown).replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  const flush = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    if (list) html.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
    if (quote.length) html.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    paragraph = [];
    list = null;
    quote = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(4, heading[1].length + 1);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith('- ')) {
      if (paragraph.length || quote.length) flush();
      (list ??= []).push(line.slice(2));
      continue;
    }
    if (line.startsWith('>')) {
      if (paragraph.length || list) flush();
      quote.push(line.replace(/^>\s?/, ''));
      continue;
    }
    if (list || quote.length) flush();
    paragraph.push(line);
  }
  flush();
  return html.join('\n');
}

export const isDraft = markdown => /DRAFT/.test(String(markdown));
