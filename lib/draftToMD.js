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
                regex: /(\*)(.*?)\1/,
                type: 'change-inline-style'
            },
            CODE: {
                regex: /(`)(.*?)`/,
                type: 'change-inline-style'
            },
            "image":{
                regex:/(!\[)(.*?)(\])\(.*?\)/gm,
                type:"apply-entity"
            },
            "LINK":{
                //TODO: add note ! first char check to avoid image
                regex:/^(?!\!)(\[)(.*?)(\])\(.*?\)/gm,
                type:"apply-entity"
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
            'todo':{
                //TODO: modify to have x or space
                regex:/^(- \[.*?\])(.*(\n|\r|$))/gm,
                type:'change-block-type'
            },
            'unordered-list-item': {
                regex: /^(\s*-|\*)\s+(.*(\n|\r|$))/,
                type: 'change-block-type'
                //TODO: modify this so it does not take in checkbox
            },
            'ordered-list-item': {
                regex: /^(\s*\d+\.)\s+(.*(\n|\r|$))/,
                type: 'change-block-type'
            }
        };
    }

    draftToMD(rawNote, editorState) {
        var mdResult = '';
        var prevType = '';

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

            } else{
                let text = blocks[i].text;
                for (var pos in blocks[i].inlineStyleRanges) {
                    let inlineStyle = blocks[i].inlineStyleRanges[pos];

                    // set start char
                    var iso = inlineStyle.offset || 0;
                    if (!extraChars[iso]) {
                        extraChars[iso] = '';
                    }

                    if(blocks[i])
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

                if(blocks[i].type==="image"){
                    mdResult+= `![Image](${blocks[i].data.src})\n`
                }else{
                    // get current line of text
                    var md = text;
                    var prefixStr = ("  ").repeat(blocks[i].depth)+this.mdChars[type]
                    // set block styles
                    md = prefixStr + md;


                    offset = prefixStr.length;

                    for (var key in extraChars) {
                        key = parseInt(key, 10);
                        md = this.insertString(key + offset, md, extraChars[key]);
                        offset += extraChars[key].length;
                    }

                    mdResult += md;
                    mdResult += '\n';


                    if(md===""){
                        mdResult += '\n';
                    }
                }
            }

            prevType = type;
        }

        return mdResult;
    }

    MDToDraft(editorState) {

        var contentState = editorState.getCurrentContent();
        var contentBlocks = contentState.getBlockMap();
        var match, modifiedContent;
        var blocksToRemove={};

        var contentBlocksArr = Array.from(contentBlocks.entries());

        for(let i=0; i<contentBlocksArr.length; i++){
            let blockKey=contentBlocksArr[i][0];
            let contentBlock=contentBlocksArr[i][1];

            if(contentBlock.getText().includes("```")){
                const language = contentBlock.getText().replace("```","").trim();
                const blockType = "custom-code-block"+ (language ? "-"+language :"");

                blocksToRemove[i]=true;

                for(var j=i+1; i<contentBlocksArr.length; j++){
                    blockKey = contentBlocksArr[j][0]
                    contentBlock = contentBlocksArr[j][1];
                    if(contentBlocksArr[j][1].getText().trim()=="```"){
                        i=j;
                        blocksToRemove[i]=true;
                        break;
                    }else{
                        let selectionState = SelectionState.createEmpty(contentBlock.getKey());
                        selectionState = selectionState.merge({
                            anchorOffset: 0,
                            focusKey: contentBlock.getKey(),
                            focusOffset: contentBlock.getLength(),
                            hasFocus: true
                        });

                        contentState = this.applyStyle(
                            "change-block-type",
                            contentState,
                            selectionState,
                            blockType
                        );

                        editorState = EditorState.push(
                            editorState,
                            contentState,
                            "change-block-type"
                        );

                        contentBlock = contentState.getBlockMap().get(contentBlock.getKey());
                    }
                }

            }else{
                for (var key in this.regexes) {
                    while ((match = this.regexes[key].regex.exec(contentBlock.getText())) !== null) {

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

                            if(key==="image"){
                                let url = (/(?:__|[*#])|\(.*?\)/gm).exec(match[0])[0].replace("(","").replace(")", "");

                                contentState = this.applyStyle(
                                    "change-block-type",
                                    contentState,
                                    selectionState,
                                    "image"
                                );

                                contentBlock = contentState.getBlockMap().get(contentBlock.getKey());

                                contentState = Modifier.setBlockData(
                                    contentState,
                                    selectionState,
                                    {
                                        src:url
                                    }
                                );
                            } else if(key==="LINK"){
                                let url = (/(?:__|[*#])|\(.*?\)/gm).exec(match[0])[0].replace("(","").replace(")", "");
                                let linkText = (/(?:__|[*#])|\[(.*?)\]/gm).exec(match[0])[0].replace("[","").replace("]", "")

                                let entityKey= getLinkEntity(url);

                                contentState = this.applyStyle(
                                    this.regexes[key].type,
                                    contentState,
                                    selectionState,
                                    entityKey
                                );

                                contentBlock = contentState.getBlockMap().get(contentBlock.getKey());

                                contentState = Modifier.replaceText(
                                    contentState,
                                    selectionState,
                                    match[0].replace(this.regexes[key].regex, linkText),
                                    null,
                                    entityKey
                                );
                            }
                            else{
                                contentState = this.applyStyle(
                                    this.regexes[key].type,
                                    contentState,
                                    selectionState,
                                    key
                                );

                                contentBlock = contentState.getBlockMap().get(contentBlock.getKey());

                                const matchedStrWORegex = match[0].replace(this.regexes[key].regex, '$2');

                                contentState = Modifier.replaceText(
                                    contentState,
                                    selectionState,
                                    matchedStrWORegex,
                                    contentBlock.getInlineStyleAt(start)
                                );

                                //setting checked for todos
                                if(match[1] && match[1]==="- [x]"){
                                    contentState =  Modifier.mergeBlockData(
                                        contentState,
                                        selectionState,
                                        {checked:true}
                                    );
                                }else if(key==="ordered-list-item" || key==="unordered-list-item"){
                                    const depth = Math.floor(match[0].search(/\S/)/2)
                                    contentBlock =  contentState.getBlockMap().get(contentBlock.getKey()).merge({ depth: depth });
                                    contentState = contentState.merge({
                                        blockMap: contentState.getBlockMap().set(contentBlock.getKey(), contentBlock)
                                    })
                                }
                            }

                            editorState = EditorState.push(
                                editorState,
                                contentState,
                                this.regexes[key].type
                            );

                            contentBlock = contentState.getBlockMap().get(contentBlock.getKey());
                        }
                    }
                }
            }
        }

        const convertedNoteRaw=DraftJs.convertToRaw(editorState.getCurrentContent());

        convertedNoteRaw.blocks=convertedNoteRaw.blocks.filter(function (item, index) {
            return !blocksToRemove[index]
        });

        console.log(convertedNoteRaw)

        return convertedNoteRaw;
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
        }else if(type==="apply-entity"){
            //Here the key is an entity key
            return Modifier.applyEntity(
                contentState,
                selectionState,
                key
            )
        }else{
            return Modifier.applyInlineStyle(
                contentState,
                selectionState,
                key
            );
        }
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

function removeBlock(editorState, contentState, contentBlock){
    let selectionState = SelectionState.createEmpty(contentBlock.getKey());
    selectionState = selectionState.merge({
        anchorOffset: 0,
        focusKey: contentBlock.getKey(),
        focusOffset: contentBlock.getLength()
    });


    const ncs = Modifier.removeRange(contentState, selectionState, 'backward');
    return EditorState.push(editorState, ncs, 'remove-range');

}


function getLinkEntity(url){
    let newUrl = url;

    if (url !== '') {
        if (url.indexOf('@') >= 0) {
            newUrl = `mailto:${newUrl}`;
        } else if (url.indexOf('http') === -1) {
            newUrl = `http://${newUrl}`;
        }
        return Entity.create('LINK', 'MUTABLE', newUrl);

    }else{
        return null;
    }
}
