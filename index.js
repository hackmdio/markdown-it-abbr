// Enclose abbreviations in <abbr> tags
//
'use strict';


var PUNCT_CHARS = ' \n()[]\'".,!?-';


module.exports = function sub_plugin(md) {
  var escapeRE        = md.utils.escapeRE,
      arrayReplaceAt  = md.utils.arrayReplaceAt,
      replaceEntities = md.utils.replaceEntities,
      escapeHtml      = md.utils.replaceEntities;

  md.renderer.rules.abbr_open  = function abbr_open(tokens, idx) {
    return '<abbr title="' + escapeHtml(replaceEntities(tokens[idx].title)) + '">';
  };
  md.renderer.rules.abbr_close = function abbr_close() { return '</abbr>'; };


  function abbr_def(state, startLine, endLine, silent) {
    var label, title, ch, labelStart, labelEnd,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine];

    if (pos + 2 >= max) { return false; }

    if (state.src.charCodeAt(pos++) !== 0x2A/* * */) { return false; }
    if (state.src.charCodeAt(pos++) !== 0x5B/* [ */) { return false; }

    labelStart = pos;

    for (; pos < max; pos++) {
      ch = state.src.charCodeAt(pos);
      if (ch === 0x5B /* [ */) {
        return false;
      } else if (ch === 0x5D /* ] */) {
        labelEnd = pos;
        break;
      } else if (ch === 0x5C /* \ */) {
        pos++;
      }
    }

    if (labelEnd < 0 || state.src.charCodeAt(labelEnd + 1) !== 0x3A/* : */) {
      return false;
    }

    if (silent) { return true; }

    label = state.src.slice(labelStart, labelEnd).replace(/\\(.)/g, '$1');
    title = state.src.slice(labelEnd + 2, max).trim();
    if (title.length === 0) { return false; }
    if (!state.env.abbreviations) { state.env.abbreviations = {}; }
    // prepend ':' to avoid conflict with Object.prototype members
    if (typeof state.env.abbreviations[':' + label] === 'undefined') {
      state.env.abbreviations[':' + label] = title;
    }

    state.line = startLine + 1;
    return true;
  }


  function abbr_replace(state) {
    var i, j, l, tokens, token, text, nodes, pos, level, reg, m, regText,
        blockTokens = state.tokens;

    if (!state.env.abbreviations) { return; }
    if (!state.env.abbrRegExp) {
      regText = '(^|[' + PUNCT_CHARS.split('').map(escapeRE).join('') + '])'
              + '(' + Object.keys(state.env.abbreviations).map(function (x) {
                        return x.substr(1);
                      }).sort(function (a, b) {
                        return b.length - a.length;
                      }).map(escapeRE).join('|') + ')'
              + '($|[' + PUNCT_CHARS.split('').map(escapeRE).join('') + '])';
      state.env.abbrRegExp = new RegExp(regText, 'g');
    }
    reg = state.env.abbrRegExp;

    for (j = 0, l = blockTokens.length; j < l; j++) {
      if (blockTokens[j].type !== 'inline') { continue; }
      tokens = blockTokens[j].children;

      // We scan from the end, to keep position when new tags added.
      for (i = tokens.length - 1; i >= 0; i--) {
        token = tokens[i];
        if (token.type !== 'text') { continue; }

        pos = 0;
        text = token.content;
        reg.lastIndex = 0;
        level = token.level;
        nodes = [];

        while ((m = reg.exec(text))) {
          if (reg.lastIndex > pos) {
            nodes.push({
              type: 'text',
              content: text.slice(pos, m.index + m[1].length),
              level: level
            });
          }

          nodes.push({
            type: 'abbr_open',
            title: state.env.abbreviations[':' + m[2]],
            level: level++
          });
          nodes.push({
            type: 'text',
            content: m[2],
            level: level
          });
          nodes.push({
            type: 'abbr_close',
            level: --level
          });
          pos = reg.lastIndex - m[3].length;
        }

        if (!nodes.length) { continue; }

        if (pos < text.length) {
          nodes.push({
            type: 'text',
            content: text.slice(pos),
            level: level
          });
        }

        // replace current node
        blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
      }
    }
  }

  md.block.ruler.before('reference', 'abbr_def', abbr_def, { alt: [ 'paragraph', 'reference' ] });
  md.core.ruler.after('inline', 'abbr_replace', abbr_replace);
};