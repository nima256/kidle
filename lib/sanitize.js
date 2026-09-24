const sanitizeHtml = require("sanitize-html");

// Rich text from the admin editor (product descriptions, blog posts). Scripts, event handlers
// and javascript: URLs are stripped so a content editor can't run code in customers' browsers.
const RICH = {
  allowedTags: [
    "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "blockquote", "ul", "ol", "li",
    "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "span", "hr", "pre", "code",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    span: ["class"],
    p: ["class"],
    "*": ["id"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener" }),
    img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
    h1: "h2",
  },
};

module.exports = {
  rich: (html) => sanitizeHtml(String(html || ""), RICH),
  text: (html) => sanitizeHtml(String(html || ""), { allowedTags: [], allowedAttributes: {} }),
};
