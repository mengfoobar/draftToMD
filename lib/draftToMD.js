import {ContentState, SelectionState, Modifier, EditorState} from 'draft-js';

class DraftToMD {

    constructor() {
        this.mdChars = {
            ITALIC: '_',
            CODE: '`',
            BOLD: '**',
            'header-one': '# ',
            'header-two': '## ',
            'header-three': '### ',
            'header-four': '#### ',
            'blockquote': '> ',
            'unordered-list-item': '- ',
            'ordered-list-item': '1. ',
            'code-block': '    ',
            unstyled: ''
        };
        this.regexes = {
            BOLD: {
                regex: /(\*\*)(.*?)\*\*/,
                type: 'change-inline-style'
            },
            ITALIC: {
                regex: /(\*|_)(.*?)\1/,
                type: 'change-inline-style'
            },
            CODE: {
                regex: /(`)(.*?)`/,
                type: 'change-inline-style'
            },
            'header-one': {
                regex: /^(# )(.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'header-two': {
                regex: /^(## )(.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'header-three': {
                regex: /^(### )(.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'header-four': {
                regex: /^(#### )(.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'blockquote': {
                regex: /^(>) (.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'unordered-list-item': {
                regex: /^(\s*-|\*)\s+(.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'ordered-list-item': {
                regex: /^(\s*\d+\.)\s+(.*(\n|\r|$))/,
                type: 'change-block-type'
            },
            'code-block': {
                regex: /^    (.*(\n|\r|$))/,
                type: 'change-block-type'
            }
        };
    }

    createFromMarkdown(markdown) {
        markdown = markdown.replace(/(^|\n)\n?(# |## |### |#### |> |\d+\. |(\s*-|\*) |(\s*\d+\.) )(.*)\n?(\n|$)/gm, '$1$2$5$6');
        markdown = markdown.replace(/  \n/gm, '\n');
        return ContentState.createFromText(markdown);
    }

    draftToMD(blocks) {
        var mdResult = '';
        var prevType = '';
        var prevTextLength = 0;
        for (var index in blocks) {
            var extraChars = {};
            var offset = 0;
            let text = blocks[index].text;
            let type = blocks[index].type;

            for (var pos in blocks[index].inlineStyleRanges) {
                let inlineStyle = blocks[index].inlineStyleRanges[pos];

                // set start char
                var iso = inlineStyle.offset || 0;
                if (!extraChars[iso]) {
                    extraChars[iso] = '';
                }
                extraChars[iso] += this.mdChars[inlineStyle.style];

                // set end char
                iso += inlineStyle.length;
                if (!extraChars[iso]) {
                    extraChars[iso] = '';
                }
                extraChars[iso] += this.mdChars[inlineStyle.style];
            }
            // get current line of text
            var md = text;
            // set block styles
            md = this.mdChars[type] + md;
            offset = this.mdChars[type].length;

            // insert markdown syntax characters
            for (var key in extraChars) {
                key = parseInt(key, 10);
                md = this.insertString(key + offset, md, extraChars[key]);
                offset += extraChars[key].length;
            }

            // convert softbreak into markdown linebreak
            if (mdResult.length) {
                if (prevType === 'unstyled' && type === 'unstyled' && prevTextLength && text.length && !mdResult.match(/  $/)) {
                    mdResult += '  ';
                } else if (prevType != type && prevTextLength && text.length) {
                    mdResult += '\n';
                }
                mdResult += '\n';
            }

            mdResult += md;
            prevTextLength = text.length;
            prevType = type;
        }

        return mdResult;
    }

    MDToDraft(editorState, superClass) {

        var contentState = editorState.getCurrentContent();
        var contentBlocks = contentState.getBlockMap();
        var match, modifiedContent;

        contentBlocks.forEach(
            (contentBlock, blockKey) => {

            for (var key in this.regexes) {
                while ((match = this.regexes[key].regex.exec(contentBlock.getText())) !== null) {
                    match = this.regexes[key].regex.exec(contentBlock.getText());

                    if(match && match.length) {
                        let start = match.index;
                        let end = match[0].length + start;
                        let selectionState = SelectionState.createEmpty(contentBlock.getKey());
                        selectionState = selectionState.merge({
                            anchorOffset: start,
                            focusKey: contentBlock.getKey(),
                            focusOffset: end,
                            hasFocus: true
                        });

                        contentState = this.applyStyle(
                            this.regexes[key].type,
                            contentState,
                            selectionState,
                            key
                        );

                        contentBlock = contentState.getBlockMap().get(contentBlock.getKey());

                        contentState = Modifier.replaceText(
                            contentState,
                            selectionState,
                            match[0].replace(this.regexes[key].regex, '$2'),
                            contentBlock.getInlineStyleAt(start)
                        );

                        editorState = EditorState.push(
                            editorState,
                            contentState,
                            this.regexes[key].type
                        );

                        contentBlock = contentState.getBlockMap().get(contentBlock.getKey());
                    }
                }
            }

        });
        superClass.setState({
            editorState
        });
    }

    insertString(index, src, str, rm) {
        rm = rm || 0;
        src = src || '';
        return (src.slice(0, index) + str + src.slice(index + rm));
    }

    applyStyle(type, contentState, selectionState, key) {
        if (type === 'change-block-type') {
            return Modifier.setBlockType(
                contentState,
                selectionState,
                key
            );
        }
        return Modifier.applyInlineStyle(
            contentState,
            selectionState,
            key
        );
    }

}
module.exports = new DraftToMD();
