import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'img', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'ul',
];

const ALLOWED_ATTR = [
  'alt', 'class', 'colspan', 'height', 'href', 'rel', 'rowspan', 'src',
  'target', 'title', 'width',
];

function isExternalHttpUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    const href = node.getAttribute('href');
    if (href && isExternalHttpUrl(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (['href', 'src'].includes(data.attrName) && /^\s*javascript:/i.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['base', 'embed', 'form', 'iframe', 'link', 'meta', 'object', 'script', 'style'],
    FORBID_ATTR: [/^on/i],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
  });
}
