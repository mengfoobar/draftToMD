const DraftJs = require('draft-js');
const SelectionState = DraftJs.SelectionState;
const Modifier = DraftJs.Modifier;
const EditorState = DraftJs.EditorState;
const Entity =DraftJs.Entity

class DraftToMD {

    constructor() {
        this.mdChars = {
            ITALIC: '*',
            CODE: '`',
            BOLD: '**',
            'header-one': '# ',
            'header-two': '## ',
            'header-three': '### ',
            'header-four': '#### ',
            'blockquote': '> ',
            'unordered-list-item': '- ',
            'ordered-list-item': '1. ',
            'code-block': "``` ",
            'todo-unchecked': "- [ ] ",
            'todo-checked': "- [x] ",
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
                regex: /^(``` )(.*(\n|\r|$))/,
                type: 'change-block-type'
            }
        };
    }

    draftToMD(rawNote, editorState) {
        var mdResult = '';
        var prevType = '';
        var prevTextLength = 0;

        let blocks=rawNote.blocks;

        //TODO: add a try catch


        for (var i=0; i<blocks.length; i++) {
            var extraChars = {};
            var offset = 0;

            let type = blocks[i].type;
            if(blocks[i].type==='todo'){
                type = blocks[i].data.checked ? "todo-checked":"todo-unchecked"
            }else{
                type = blocks[i].type;
            }


            if(blocks[i].type.includes("custom-code-block")){
                let text = "";
                let result = draftToMDCodeBlocks(blocks, i, text);
                mdResult += result.str;
                i=result.index

                var lastLineIndexOfCodeBlock = blocks[i].text;
                prevTextLength = lastLineIndexOfCodeBlock.length;

            } else{
                let text = blocks[i].text;
                for (var pos in blocks[i].inlineStyleRanges) {
                    let inlineStyle = blocks[i].inlineStyleRanges[pos];

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

                for (var pos in blocks[i].entityRanges) {

                    let entityStyle = blocks[i].entityRanges[pos];
                    // set start char
                    var iso = entityStyle.offset || 0;

                    if (!extraChars[iso]) {
                        extraChars[iso] = '';
                    }

                    const entity=getEntityData(editorState, blocks[i].key, entityStyle.offset);
                    if(entity.getType()==='LINK'){

                        extraChars[iso]="["+extraChars[iso];
                        iso+=entityStyle.length;

                        if (!extraChars[iso]) {
                            extraChars[iso] =`](${entity.getData()})`
                        }else{
                            extraChars[iso] = extraChars[iso]+`](${entity.getData()})`
                        }
                    }
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

                if (prevType === 'unstyled' && type === 'unstyled' && prevTextLength && text.length && !mdResult.match(/  $/)) {
                    mdResult += '  ';
                }

                mdResult += '\n';
                mdResult += md;
                prevTextLength = text.length;
            }

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


function draftToMDCodeBlocks(blocks, index){
    let result={};
    let blockType=blocks[index].type;
    let blockTypeSplitted=blockType.split('-');
    let lang=blockType.split('-').length===4? blockTypeSplitted[3] : "";

    var str="\n```"+ lang;

    for(var i=index; i<blocks.length; i++){
        if(blocks[i].type!==blockType){
            break;
        }else{
            str+=("\n"+blocks[i].text);
        }
    }

    str+="\n```"
    result.index=i-1;
    result.str=str
    return result;

}

function getEntityData(editorState, blockKey, offset){
    var contentState = editorState.getCurrentContent();

    const blockWithLinkAtBeginning = contentState.getBlockForKey(blockKey);
    const key = blockWithLinkAtBeginning.getEntityAt(offset);

    return contentState.getEntity(key);
}
